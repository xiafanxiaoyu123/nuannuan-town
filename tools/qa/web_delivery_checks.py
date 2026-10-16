"""Check optional URL maps against real local bytes without building a release."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from web_delivery import map_web_resources, package_delivery, read_delivery_map  # noqa: E402
from web_release import files_from_manifest, web_stats  # noqa: E402
from site_release import build_release  # noqa: E402


class DeliveryChecks(unittest.TestCase):
    def setUp(self):
        self.js = b'window.testResource=true;'
        self.css = b'body { color: green; }'
        self.resource = {'url': 'assets/play.123456.js', 'sha256': hashlib.sha256(self.js).hexdigest(), 'size': len(self.js)}
        self.manifest = {'schema': 1, 'version': 'test', 'buildId': '1234567890abcdef',
                         'entry': self.resource['url'], 'styles': 'assets/play.abcdef.css', 'resources': [dict(self.resource)]}
        self.link = {'url': 'https://download.invalid/immutable/test.js', 'corsVerified': True,
                     'sha256': self.resource['sha256'], 'sizeBytes': self.resource['size']}

    def test_default_local_and_external_keep_exact_source(self):
        map_web_resources(self.manifest, {})
        self.assertEqual(self.manifest['resources'][0]['sourcePath'], self.resource['url'])
        map_web_resources(self.manifest, {'web': {self.resource['url']: self.link}})
        item = self.manifest['resources'][0]
        self.assertEqual(item['url'], self.link['url'])
        self.assertEqual(item['fallbackUrl'], self.resource['url'])
        self.assertIn(self.resource['url'], files_from_manifest('', self.manifest))
        self.assertNotIn(self.link['url'], files_from_manifest('', self.manifest))

    def test_reject_unverified_stale_and_unsafe_url_maps(self):
        for change in ({'corsVerified': False}, {'sizeBytes': 999}, {'sha256': '0' * 64},
                       {'url': 'http://download.invalid/test.js'}, {'url': 'https://secret:password@download.invalid/test.js'},
                       {'url': 'javascript:alert(1)'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                map_web_resources(self.manifest, {'web': {self.resource['url']: {**self.link, **change}}})
        with self.assertRaises(ValueError):
            files_from_manifest('', {'resources': [{'sourcePath': '../private.pem'}]})

    def test_web_statistics_read_local_resource_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            site = Path(folder)
            (site / 'assets').mkdir()
            (site / self.resource['url']).write_bytes(self.js)
            map_web_resources(self.manifest, {'web': {self.resource['url']: self.link}})
            (site / 'play-manifest.json').write_text(json.dumps(self.manifest), encoding='utf-8')
            stats = web_stats(folder)
            self.assertEqual(stats['hashes'][self.resource['url']], self.resource['sha256'])
            self.assertIn(self.resource['url'], stats['files'])

    def test_download_map_requires_current_hash_and_keeps_fallback(self):
        local = 'downloads/test.zip?v=123'
        digest = self.resource['sha256']
        size = self.resource['size']
        self.assertEqual(package_delivery('windows', local, digest, size, 'test', {})['url'], local)
        item = {**self.link, 'mirrors': ['https://mirror.invalid/test.zip']}
        result = package_delivery('windows', local, digest, size, 'test', {'downloads': {'windows': item}})
        self.assertEqual(result['url'], item['url'])
        self.assertIn(local, result['mirrors'])
        with self.assertRaises(ValueError):
            package_delivery('windows', local, '0' * 64, size, 'test', {'downloads': {'windows': item}})

    def test_map_version_must_match_and_site_metadata_updates_equal_timestamps(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            site = root / 'site'
            (site / 'downloads').mkdir(parents=True)
            (root / 'release').mkdir()
            (site / 'releases.json').write_text(json.dumps({'version': 'test', 'releases': []}), encoding='utf-8')
            (site / 'index.html').write_text('<a href="downloads/nikki-block-town.apk?v=0000000000">apk</a>', encoding='utf-8')
            source = root / '暖暖的方块小镇.apk'
            target = site / 'downloads' / 'nikki-block-town.apk'
            source.write_bytes(self.js)
            target.write_bytes(b'old-package')
            os.utime(source, (123456789, 123456789))
            os.utime(target, (123456789, 123456789))
            delivery = root / 'map.json'
            delivery.write_text(json.dumps({'schema': 1, 'version': 'test', 'downloads': {'android': self.link}}), encoding='utf-8')
            result = build_release(folder, str(site), str(delivery))
            self.assertEqual(target.read_bytes(), self.js)
            self.assertEqual(result['files']['android']['url'], self.link['url'])
            self.assertEqual(result['files']['android']['sha256'], self.resource['sha256'])
            self.assertEqual(result['files']['android']['version'], 'test')
            with self.assertRaises(ValueError):
                read_delivery_map(str(delivery), 'another-version')


if __name__ == '__main__':
    unittest.main()
