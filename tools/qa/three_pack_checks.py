"""Failure-path regression checks and optional real Tk button interaction."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
import zipfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('pack_three', ROOT / 'tools/pack_three.py')
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)


class Checks(unittest.TestCase):
    def test_missing_project_is_actionable(self):
        with tempfile.TemporaryDirectory() as folder:
            report = pack.inspect(Path(folder), ['web'])
            self.assertFalse(report['ready'])
            failed = [row for row in report['checks'] if not row['ok']]
            self.assertTrue(any(row['name'] == '工程入口' for row in failed))
            self.assertTrue(all(row['fix'] for row in failed))

    def test_version_mismatch_blocks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for file, version in [('site/releases.json', '1.0'), ('desktop/package.json', '2.0'), ('apk/package.json', '1.0')]:
                pack.save_json(root / file, {'version': version})
            gradle = root / 'apk/android/app/build.gradle'
            gradle.parent.mkdir(parents=True)
            gradle.write_text('versionName "1.0"', encoding='utf-8')
            report = pack.inspect(root, ['web'])
            self.assertFalse(next(r['ok'] for r in report['checks'] if r['name'] == '三端版本一致'))

    def test_installed_package_must_match_lock(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            pack.save_json(root / 'package.json', {'dependencies': {'three': '^0.170.0'}})
            pack.save_json(root / 'package-lock.json', {'packages': {'node_modules/three': {'version': '0.170.0'}}})
            pack.save_json(root / 'node_modules/three/package.json', {'version': '0.169.0'})
            with patch.object(pack, 'probe', return_value=(False, 'fixture')):
                report = pack.inspect(root, ['web'])
            self.assertFalse(next(r['ok'] for r in report['checks'] if r['name'] == '根目录 / three'))
            self.assertIn('', report['missingDependencyGroups'])

    def test_lock_excludes_and_releases_on_error(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'fixture'):
                with pack.build_lock(folder):
                    with self.assertRaisesRegex(RuntimeError, '持有锁'):
                        with pack.build_lock(folder):
                            pass
                    raise ValueError('fixture')
            self.assertFalse((Path(folder) / 'output/three-pack.lock').exists())

    def test_search_finds_without_overwriting(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'backup').mkdir()
            file = root / 'backup/missing.js'
            file.write_text('old copy', encoding='utf-8')
            found, limited = pack.find_files([root], ['js/missing.js'])
            self.assertEqual(found, [str(file)])
            self.assertFalse(limited)
            self.assertEqual(file.read_text(), 'old copy')
            self.assertFalse((root / 'js/missing.js').exists())

    def test_missing_import_and_host_names(self):
        names = pack.missing_names([
            {'name': '源码与资源引用闭包', 'ok': False, 'detail': 'Could not resolve "./lost.js"\nMissing resource: css/gone.css'},
            {'name': 'Windows / icon.ico', 'ok': False, 'detail': 'missing'},
            {'name': 'Windows / ignored.js', 'ok': True, 'detail': 'exists'},
        ])
        self.assertEqual(names, ['./lost.js', 'css/gone.css', 'icon.ico'])

    def test_auto_search_includes_missing_host_candidate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            file = root / 'backup/icon.ico'
            file.parent.mkdir()
            file.write_bytes(b'fixture-icon')
            report = pack.inspect(root, ['windows'])
            self.assertIn(str(file), report['fileCandidates'])
            self.assertFalse(report['ready'])

    def test_build_env_excludes_server_overrides(self):
        with patch.dict(os.environ, {'AUTH_DB': 'real.sqlite', 'DATA_DIR': 'real-data', 'NODE_OPTIONS': '--require=x', 'ESBUILD': 'bad'}):
            env = pack.build_env({})
        for key in ('AUTH_DB', 'DATA_DIR', 'NODE_OPTIONS', 'ESBUILD'):
            self.assertNotIn(key, env)

    def test_packaged_manifest_cannot_hide_corrupted_payload(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            native = root / 'native'
            native.mkdir()
            (native / 'index.html').write_text('expected')
            pack.save_json(native / 'build-manifest.json', {'files': {'index.html': pack.sha(native / 'index.html')}})
            apk = root / 'fixture.apk'
            with zipfile.ZipFile(apk, 'w') as archive:
                archive.write(native / 'build-manifest.json', 'assets/public/build-manifest.json')
                archive.writestr('assets/public/index.html', 'corrupted')
            with self.assertRaisesRegex(RuntimeError, 'APK 内资源不一致'):
                pack.verify_packaged_assets(native, apk)

    def test_failed_build_retains_report_and_log(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            report = {'ready': True, 'tools': {}, 'versions': {'site/releases.json': '1.0'}}
            with patch.object(pack, 'inspect', return_value=report), patch.object(pack, 'snapshot', return_value={}), patch.object(pack, 'run', side_effect=RuntimeError('fixture failed step')):
                with self.assertRaisesRegex(RuntimeError, 'fixture failed step'):
                    pack.package(root, ['web'], emit=lambda _: None)
            output = next((root / 'output').glob('three-pack-*'))
            result = json.loads((output / 'result.json').read_text(encoding='utf-8'))
            self.assertEqual(result['status'], 'failed')
            self.assertIn('fixture failed step', result['error'])
            self.assertTrue((output / 'build.log').is_file())
            self.assertFalse((root / 'output/three-pack.lock').exists())


def gui_check(hold=0):
    desk = pack.Desk(ROOT)
    deadline = time.monotonic() + 35
    while time.monotonic() < deadline:
        desk.win.update()
        if desk.report and not desk.busy:
            break
        time.sleep(.03)
    assert desk.report and desk.report['ready'], desk.status.get()
    assert len(desk.table.get_children()) >= 25
    for value in desk.selected.values():
        value.set(False)
    desk.buttons[-1].invoke()
    assert '至少选择一个平台' in desk.status.get()
    for value in desk.selected.values():
        value.set(True)
    desk.buttons[0].invoke()
    deadline = time.monotonic() + 35
    while desk.busy and time.monotonic() < deadline:
        desk.win.update()
        time.sleep(.03)
    assert not desk.busy and desk.report['ready']
    desk.table.selection_set(desk.table.get_children()[0])
    desk.show_detail()
    desk.win.update()
    dialogs = [w for w in desk.win.winfo_children() if w.winfo_class() == 'Toplevel']
    assert len(dialogs) == 1
    dialogs[0].destroy()
    output = ROOT / 'output/pack-tool-qa'
    output.mkdir(parents=True, exist_ok=True)
    pack.save_json(output / 'gui.json', {'passed': True, 'checks': len(desk.report['checks']),
        'buttons': ['startup-auto-check', 'no-platform-build-blocked', 'recheck-button', 'row-detail-dialog'],
        'windowHandle': desk.win.winfo_id(), 'status': desk.status.get()})
    print('GUI checks PASS', flush=True)
    deadline = time.monotonic() + hold
    while time.monotonic() < deadline:
        desk.win.update()
        time.sleep(.05)
    desk.win.destroy()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--gui', action='store_true')
    parser.add_argument('--hold', type=int, default=0)
    args = parser.parse_args()
    if args.gui:
        gui_check(args.hold)
    else:
        unittest.main(argv=['three_pack_checks'])
