"""Build browser ESM resources. --out creates a fresh candidate without touching dist/."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from resource_graph import candidate_directory, native_closure, stamp_html

ROOT = Path(__file__).resolve().parent.parent


def build(root=ROOT, output=None):
    root = Path(root).resolve()
    target = candidate_directory(root, output) if output else root / 'dist'
    # Resolve every module and resource before touching the output directory.
    page, styles, resources, graph, vendor = native_closure(root)
    version = json.loads((root / 'site/releases.json').read_text(encoding='utf-8-sig'))['version']
    fingerprint = hashlib.sha256()
    source_files = sorted(set([root / name for name in graph['inputs']] + styles + resources + [root / 'index.html']))
    for source in source_files:
        fingerprint.update(source.relative_to(root).as_posix().encode('utf-8') + b'\0' + source.read_bytes())
    build_id = fingerprint.hexdigest()[:16]
    if not output and target.exists():
        if target.resolve() != root / 'dist' or target.is_symlink():
            raise ValueError('Unsafe default dist path')
        shutil.rmtree(target)
    target.mkdir(parents=True)
    for name in ('css', 'js'):
        shutil.copytree(root / name, target / name)
    for source in vendor:
        relative = source.relative_to(root / 'node_modules/three')
        if relative.parts[0] == 'build':
            relative = Path('lib', *relative.parts[1:])
        destination = target / 'vendor/three' / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    # Preserve explicitly referenced local media as well as the usual JS/CSS.
    for source in resources:
        relative = source.relative_to(root)
        if relative.parts[0] == 'node_modules':
            raise ValueError('HTML media should not directly reference dependency files: ' + str(relative))
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            shutil.copy2(source, destination)
    html = page.text.replace('./node_modules/three/build/three.module.js', './vendor/three/lib/three.module.js')
    html = html.replace('./node_modules/three/examples/jsm/', './vendor/three/examples/jsm/')
    if 'node_modules' in html:
        raise ValueError('Unmapped dependency URL in native HTML')
    (target / 'index.html').write_text(stamp_html(html, version, build_id, 'native'), encoding='utf-8')
    # Public distribution preserves notices; miniature QA fixtures may omit them.
    for notice, destination in (('node_modules/three/LICENSE', 'vendor/three/LICENSE'), ('LICENSE', 'LICENSE'), ('THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md')):
        if (root / notice).is_file():
            shutil.copy2(root / notice, target / destination)
    # The old _serve.js lacked server/auth-api; do not emit a broken preview entry.
    manifest = {'schema': 1, 'kind': 'esm', 'version': version, 'buildId': build_id, 'modules': sorted(graph['inputs']),
                'sourceSha256': {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_files},
                'files': {p.relative_to(target).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                          for p in sorted(target.rglob('*')) if p.is_file()}}
    (target / 'build-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'output': str(target), 'modules': len(graph['inputs']), 'vendorFiles': len(vendor),
            'resourceFiles': len(manifest['files']), 'bytes': sum(p.stat().st_size for p in target.rglob('*') if p.is_file())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, help='New candidate directory; refuses existing/source/release directories')
    args = parser.parse_args()
    try:
        print(json.dumps(build(output=args.out), ensure_ascii=False, indent=2))
    except (ValueError, OSError) as exc:
        parser.exit(1, 'ESM build failed: ' + str(exc) + '\n')


if __name__ == '__main__':
    main()
