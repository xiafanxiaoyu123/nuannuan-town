"""Read-only validation of candidate bytes, source freshness and emitted ESM imports."""
import argparse
import hashlib
import json
from pathlib import Path
from resource_graph import PageResources, local_reference, module_graph, page_resources

ROOT = Path(__file__).resolve().parent.parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(directory, source_root=ROOT):
    directory, source_root = Path(directory).resolve(), Path(source_root).resolve()
    manifest = json.loads((directory / 'build-manifest.json').read_text(encoding='utf-8'))
    if manifest.get('schema') != 1 or manifest.get('kind') not in ('esm', 'web'):
        raise ValueError('Unsupported build manifest')
    files = manifest.get('files', {})
    if not files or not manifest.get('sourceSha256'):
        raise ValueError('Candidate lacks file/source fingerprints')
    for name, expected in files.items():
        file = local_reference(directory, name)
        if not file or digest(file) != expected:
            raise ValueError('Candidate file hash mismatch: ' + name)
    for name, expected in manifest['sourceSha256'].items():
        file = local_reference(source_root, name)
        if not file or digest(file) != expected:
            raise ValueError('Source changed since candidate build: ' + name)
    report = {'kind': manifest['kind'], 'output': str(directory), 'filesChecked': len(files),
              'sourcesChecked': len(manifest['sourceSha256']), 'buildId': manifest['buildId']}
    if manifest['kind'] == 'esm':
        page_resources(directory)
        graph = module_graph(directory)
        report['emittedModuleInputs'] = len(graph['inputs'])
    else:
        site = directory / 'site'
        web = json.loads((site / 'play-manifest.json').read_text(encoding='utf-8'))
        entries = set()
        for item in web['resources']:
            name = item.get('sourcePath') or item['url']
            file = local_reference(site, name)
            if digest(file) != item['sha256'] or file.stat().st_size != item['size']:
                raise ValueError('Web resource SHA-256/size mismatch: ' + name)
            entries.add(name)
        if web['entry'] not in entries or web['styles'] not in entries:
            raise ValueError('Web entry/styles are absent from resources')
        for name in web['shell']:
            local_reference(site, name)
        for base, name in [(site, 'play.html'), (directory, '暖暖的方块小镇-网页版.html')]:
            page = PageResources((base / name).read_text(encoding='utf-8'))
            if page.modules:
                raise ValueError('Web candidate retains unbundled module scripts')
            for reference in page.references:
                local_reference(base, reference)
        report['webResourcesChecked'] = len(entries)
    report['pass'] = True
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--esm', type=Path)
    parser.add_argument('--web', type=Path)
    args = parser.parse_args()
    if not args.esm and not args.web:
        parser.error('Provide --esm and/or --web candidate directories')
    try:
        reports = [verify(directory) for directory in (args.esm, args.web) if directory]
        print(json.dumps({'readOnly': True, 'pass': True, 'candidates': reports}, ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError) as exc:
        parser.exit(1, 'Candidate check failed: ' + str(exc) + '\n')


if __name__ == '__main__':
    main()
