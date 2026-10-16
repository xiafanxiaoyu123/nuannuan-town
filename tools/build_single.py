"""Build offline HTML and hosted web resources. --out keeps canonical site/ untouched."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from resource_graph import candidate_directory, check_graph_paths, module_graph, page_resources, stamp_html
from web_delivery import read_delivery_map, map_web_resources

ROOT = Path(__file__).resolve().parent.parent
NATIVE_MODULES = {'js/desktop-updates.js', 'js/mobile-updates.js'}


def build(root=ROOT, output=None, delivery_map=None, debug=False):
    root = Path(root).resolve()
    destination = candidate_directory(root, output) if output else root
    site = destination / 'site'
    page, styles, resources = page_resources(root)
    # All gameplay entry modules join main.js, preserving an explicit entry
    # boundary while HTMLParser tolerates quotes, wrapping and attribute order.
    for module in page.modules:
        source = (module['src'] or '').removeprefix('./')
        if source and source not in NATIVE_MODULES | {'js/main.js'}:
            raise ValueError('Additional module entry must be imported by js/main.js: ' + source)
        if not source and not re.search(r"""import\(\s*['"]\./js/main\.js['"]\s*\)""", module['text']):
            raise ValueError('Unrecognized inline module; preserve its behavior before changing the web entry')
    graph = check_graph_paths(root, module_graph(root, mode='web', bundle=True, debug=debug))
    js_raw = graph.pop('bundle')
    css = '\n'.join(p.read_text(encoding='utf-8') for p in styles)
    # A standalone HTML cannot silently leave external CSS URLs behind.
    if 'url(' in re.sub(r"""url\(\s*["']?data:""", '', css) or re.search(r'@import\s', css):
        raise ValueError('Standalone CSS needs resource inlining before using url()/@import')
    media = [p for p in resources if p not in styles and p.suffix not in ('.js', '.mjs')]
    if media:
        raise ValueError('Standalone HTML needs explicit media inlining: ' + ', '.join(str(p.relative_to(root)) for p in media))
    version = json.loads((root / 'site/releases.json').read_text(encoding='utf-8-sig'))['version']
    delivery = read_delivery_map(delivery_map, version)
    shell = page.shell()
    js_bytes, css_bytes = js_raw.encode('utf-8'), css.encode('utf-8')
    js_hash, css_hash = hashlib.sha256(js_bytes).hexdigest(), hashlib.sha256(css_bytes).hexdigest()
    js_name, css_name = f'play.{js_hash[:12]}.js', f'play.{css_hash[:12]}.css'
    manifest = {
        'schema': 1, 'product': 'nikki-block-town-web', 'version': version,
        'buildId': hashlib.sha256((js_hash + css_hash).encode('ascii')).hexdigest()[:16],
        'entry': 'assets/' + js_name, 'styles': 'assets/' + css_name,
        'shell': ['play.html', 'play.js', 'play-sw.js', 'play-manifest.json'],
        'resources': [
            {'url': 'assets/' + js_name, 'sha256': js_hash, 'size': len(js_bytes)},
            {'url': 'assets/' + css_name, 'sha256': css_hash, 'size': len(css_bytes)},
        ],
    }
    map_web_resources(manifest, delivery)
    # Validation above is complete before creating or updating outputs.
    (site / 'assets').mkdir(parents=True, exist_ok=True)
    shell = stamp_html(shell, version, manifest['buildId'], 'web')
    inline = js_raw.replace('</script', '<\\/script')
    standalone = shell.replace('</head>', '<style>' + css + '</style>\n</head>', 1)
    standalone = standalone.replace('</body>', '<script>' + inline + '</script>\n</body>', 1)
    hosted = shell.replace('</body>', '<script src="play.js" defer></script>\n</body>', 1)
    (destination / '暖暖的方块小镇-网页版.html').write_text(standalone, encoding='utf-8')
    (site / 'play.html').write_text(hosted, encoding='utf-8')
    (site / 'assets' / js_name).write_bytes(js_bytes)
    (site / 'assets' / css_name).write_bytes(css_bytes)
    for source, name in [('web_play_loader.js', 'play.js'), ('web_play_sw.js', 'play-sw.js')]:
        (site / name).write_bytes((root / 'tools' / source).read_bytes())
    (site / 'play-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    build_manifest = {'schema': 1, 'kind': 'web', 'version': version, 'debug': debug,
                      'modules': sorted(graph['inputs']),
                      'sourceSha256': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in graph['inputs']},
                      'buildId': manifest['buildId']}
    if output:
        source_files = sorted(set([root / name for name in graph['inputs']] + styles
                                 + [root / 'index.html', root / 'tools/web_play_loader.js', root / 'tools/web_play_sw.js']))
        build_manifest['sourceSha256'] = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_files}
        build_manifest['files'] = {p.relative_to(destination).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                                  for p in sorted(destination.rglob('*')) if p.is_file()}
        (destination / 'build-manifest.json').write_text(json.dumps(build_manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'output': str(destination), 'modules': len(graph['inputs']), 'version': version,
            'buildId': manifest['buildId'], 'js': js_name, 'css': css_name, 'debug': debug}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, help='New candidate directory; refuses existing/source/release directories')
    parser.add_argument('--delivery-map', help='Verified versioned official download/CDN URL map')
    parser.add_argument('--debug', action='store_true', help='Unminified bundle with inline source map for local debugging')
    args = parser.parse_args()
    try:
        print(json.dumps(build(output=args.out, delivery_map=args.delivery_map, debug=args.debug), ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError) as exc:
        parser.exit(1, 'Web build failed: ' + str(exc) + '\n')


if __name__ == '__main__':
    main()
