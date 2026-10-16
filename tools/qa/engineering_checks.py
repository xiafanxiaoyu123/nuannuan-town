"""Boundary tests using a temporary miniature game, never current release outputs."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_dist import build as build_esm
from build_single import build as build_web
from resource_graph import candidate_directory, module_graph, native_closure
from check_candidate import verify


class EngineeringBoundaries(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='nikki-engineering-')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.root = self.home / 'fixture'
        self.root.mkdir()
        self.write('index.html', '''<!doctype html><html><head>
<link href='css/style.css' data-layout='test' rel='stylesheet'>
<script type='importmap'>{"imports":{"three":"./node_modules/three/build/three.module.js","three/addons/":"./node_modules/three/examples/jsm/"}}</script>
</head><body><canvas id="stage"></canvas><script type='module'>
import("./js/main.js").catch((error) => { console.error(error); });
</script></body></html>''')
        self.write('css/style.css', 'body { color: pink; }')
        self.write('js/main.js', 'import {value} from "./features/added.js"; globalThis.__fixture = value;')
        self.write('js/features/added.js', 'import {suffix} from "three/addons/utils/sample.js"; export const value = "added-module-sentinel" + suffix;')
        self.write('node_modules/three/build/three.module.js', 'export const engine = "engine-value";')
        self.write('node_modules/three/examples/jsm/utils/sample.js', 'import {engine} from "three"; export const suffix = engine;')
        self.write('site/releases.json', '{"version":"2.1.14"}')
        self.write('tools/web_play_loader.js', 'globalThis.loader = true;')
        self.write('tools/web_play_sw.js', 'globalThis.worker = true;')
        self.write('site/play.html', 'canonical-site-sentinel')
        self.write('dist/keep.txt', 'canonical-dist-sentinel')

    def write(self, name, text):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8')

    def test_double_quote_new_module_reaches_both_builds(self):
        esm, web = self.home / 'esm', self.home / 'web'
        build_esm(self.root, esm)
        build_web(self.root, web)
        self.assertTrue((esm / 'vendor/three/examples/jsm/utils/sample.js').is_file())
        self.assertTrue((esm / 'vendor/three/lib/three.module.js').is_file())
        self.assertEqual((esm / 'js/features/added.js').read_bytes(), (self.root / 'js/features/added.js').read_bytes())
        emitted = module_graph(esm)
        self.assertIn('vendor/three/examples/jsm/utils/sample.js', emitted['inputs'])
        for target in (esm, web):
            manifest = json.loads((target / 'build-manifest.json').read_text(encoding='utf-8'))
            self.assertIn('js/features/added.js', manifest['modules'])
        manifest = json.loads((web / 'site/play-manifest.json').read_text())
        bundle = (web / 'site' / manifest['entry']).read_bytes()
        self.assertIn(b'added-module-sentinel', bundle)
        self.assertEqual(hashlib.sha256(bundle).hexdigest(), manifest['resources'][0]['sha256'])
        self.assertIn('name="nuannuan-build" content="native"', (esm / 'index.html').read_text())
        self.assertIn('name="nuannuan-build" content="web"', (web / 'site/play.html').read_text())
        self.assertNotIn("type='module'", (web / 'site/play.html').read_text())
        self.assertNotIn("rel='stylesheet'", (web / 'site/play.html').read_text())
        self.assertEqual((self.root / 'site/play.html').read_text(), 'canonical-site-sentinel')
        self.assertEqual((self.root / 'dist/keep.txt').read_text(), 'canonical-dist-sentinel')
        self.assertTrue(verify(esm, self.root)['pass'])
        self.assertTrue(verify(web, self.root)['pass'])

    def test_missing_import_fails_before_either_output_exists(self):
        self.write('js/features/added.js', 'export {value} from "./missing.js";')
        for name, builder in [('esm', build_esm), ('web', build_web)]:
            target = self.home / name
            with self.assertRaisesRegex(ValueError, 'missing.js'):
                builder(self.root, target)
            self.assertFalse(target.exists())

    def test_comments_are_not_dependencies_and_reexports_are(self):
        self.write('js/features/added.js', '// import "./not-a-dependency.js";\nexport {suffix as value} from\n"three/addons/utils/sample.js";')
        graph = module_graph(self.root)
        self.assertIn('node_modules/three/examples/jsm/utils/sample.js', graph['inputs'])
        self.assertFalse(any('not-a-dependency' in name for name in graph['inputs']))

    def test_missing_html_and_css_resources_fail(self):
        self.write('css/style.css', 'body { background: url("../assets/missing.png"); }')
        with self.assertRaisesRegex(ValueError, 'Missing resource'):
            native_closure(self.root)
        self.write('css/style.css', 'body {}')
        (self.root / 'css/style.css').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing resource'):
            native_closure(self.root)

    def test_syntax_error_and_unreachable_module_are_checked(self):
        self.write('js/new-unused.js', 'export const broken = ;')
        with self.assertRaises(ValueError):
            native_closure(self.root)

    def test_output_cannot_replace_sources_or_existing_evidence(self):
        for directory in (self.root, self.root / 'js', self.root / 'site/new', self.root / 'dist', self.home):
            with self.assertRaises(ValueError):
                candidate_directory(self.root, directory)
        existing = self.home / 'evidence'
        existing.mkdir()
        marker = existing / 'keep.txt'
        marker.write_text('keep')
        with self.assertRaises(ValueError):
            build_esm(self.root, existing)
        self.assertEqual(marker.read_text(), 'keep')

    def test_extra_html_module_is_not_silently_dropped(self):
        html = (self.root / 'index.html').read_text()
        self.write('index.html', html.replace('</body>', '<script src="js/other.js" type="module"></script></body>'))
        self.write('js/other.js', 'globalThis.sideEffect = true;')
        with self.assertRaisesRegex(ValueError, 'Additional module entry'):
            build_web(self.root, self.home / 'web')

    def test_debug_bundle_has_source_map(self):
        target = self.home / 'debug'
        build_web(self.root, target, debug=True)
        manifest = json.loads((target / 'site/play-manifest.json').read_text())
        bundle = (target / 'site' / manifest['entry']).read_text(encoding='utf-8')
        self.assertIn('sourceMappingURL=data:', bundle)

    def test_candidate_detects_css_drift_and_tampered_output(self):
        esm, web = self.home / 'esm', self.home / 'web'
        build_esm(self.root, esm)
        build_web(self.root, web)
        self.write('css/style.css', 'body { color: blue; }')
        for output in (esm, web):
            with self.assertRaisesRegex(ValueError, 'Source changed'):
                verify(output, self.root)
        self.write('css/style.css', 'body { color: pink; }')
        (web / 'site/play.js').write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'Candidate file hash mismatch'):
            verify(web, self.root)


if __name__ == '__main__':
    unittest.main(verbosity=2)
