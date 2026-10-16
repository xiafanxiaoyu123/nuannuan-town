"""Shared, read-only resource discovery for checks and both build paths."""
import json
import ast
import os
from pathlib import Path
import re
import subprocess
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
from html import escape


def stamp_html(html, version, build_id, kind):
    if '</head>' not in html or '</body>' not in html:
        raise ValueError('Game page must contain head/body closing tags')
    return html.replace('</head>', '<meta name="nuannuan-version" content="' + escape(str(version), quote=True)
                        + '">\n<meta name="nuannuan-build" content="' + escape(kind, quote=True)
                        + '">\n<meta name="nuannuan-build-id" content="' + escape(str(build_id)[:12], quote=True) + '">\n</head>', 1)


class PageResources(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.text = text
        self.lines = [0]
        for match in re.finditer('\n', text):
            self.lines.append(match.end())
        self.styles, self.references, self.modules, self.remove = [], [], [], []
        self.script = None
        self.feed(text)

    def absolute_offset(self):
        row, col = self.getpos()
        return self.lines[row - 1] + col

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        start = self.absolute_offset()
        end = start + len(self.get_starttag_text())
        if tag == 'link' and attrs.get('rel', '').lower() == 'stylesheet':
            self.styles.append(attrs.get('href', ''))
            self.remove.append((start, end))
        for key in ('src', 'href'):
            if key in attrs and tag in ('script', 'link', 'img', 'source', 'video', 'audio'):
                self.references.append(attrs[key])
        if tag == 'script':
            self.script = (start, end, attrs)

    def handle_endtag(self, tag):
        if tag != 'script' or self.script is None:
            return
        start, content_start, attrs = self.script
        content_end = self.absolute_offset()
        end = self.text.index('>', content_end) + 1
        if attrs.get('type', '').lower() in ('module', 'importmap'):
            self.remove.append((start, end))
        if attrs.get('type', '').lower() == 'module':
            self.modules.append({'src': attrs.get('src'), 'text': self.text[content_start:content_end]})
        self.script = None

    def shell(self):
        text = self.text
        for start, end in sorted(set(self.remove), reverse=True):
            text = text[:start] + text[end:]
        return text


def local_reference(root, value, base=None):
    """Resolve a local URL, with case checks even on Windows; never fetch URLs."""
    parts = urlsplit(value)
    if parts.scheme in ('data', 'blob') or not parts.path:
        return None
    if parts.scheme or parts.netloc:
        raise ValueError('External resource is not part of the offline closure: ' + value)
    root = Path(root).resolve()
    path = unquote(parts.path).replace('\\', '/')
    target = (root / path.lstrip('/') if path.startswith('/') else Path(base or root) / path).resolve()
    if not target.is_relative_to(root):
        raise ValueError('Resource escapes project: ' + value)
    if not target.is_file():
        raise ValueError('Missing resource: ' + str(target.relative_to(root)))
    cursor = root
    for part in target.relative_to(root).parts:
        if part not in {p.name for p in cursor.iterdir()}:
            raise ValueError('Resource letter case mismatch: ' + value)
        cursor = cursor / part
    return target


def page_resources(root):
    root = Path(root).resolve()
    page = PageResources((root / 'index.html').read_text(encoding='utf-8-sig'))
    if not page.styles:
        raise ValueError('Game page has no stylesheet links')
    references = {local_reference(root, value) for value in page.references}
    references.discard(None)
    styles = [local_reference(root, value) for value in page.styles]
    todo, visited = list(styles), set()
    while todo:
        css_file = todo.pop()
        if css_file in visited:
            continue
        visited.add(css_file)
        css = re.sub(r'/\*.*?\*/', '', css_file.read_text(encoding='utf-8'), flags=re.S)
        urls = re.findall(r'''url\(\s*["']?([^\s"')]+)["']?\s*\)''', css)
        urls += re.findall(r'''@import\s+["']([^"']+)["']''', css)
        for value in urls:
            target = local_reference(root, value, css_file.parent)
            if target:
                references.add(target)
                if target.suffix == '.css':
                    todo.append(target)
    return page, styles, sorted(references)


def module_graph(root, mode='all', bundle=False, debug=False):
    tool = Path(__file__).with_name('module_graph.cjs')
    command = ['node', str(tool), '--root', str(Path(root).resolve()), '--mode', mode]
    if bundle:
        command.append('--bundle')
    if debug:
        command.append('--debug')
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8',
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    if result.returncode:
        raise ValueError(result.stderr.strip() or 'Module graph failed')
    return json.loads(result.stdout)


def check_graph_paths(root, graph):
    root = Path(root).resolve()
    for name in graph['inputs']:
        local_reference(root, name)
        if not (name.startswith('js/') or name.startswith('node_modules/three/')):
            raise ValueError('Game imports a file outside packaged source roots: ' + name)
    return graph


def native_closure(root):
    root = Path(root).resolve()
    page, styles, references = page_resources(root)
    graph = check_graph_paths(root, module_graph(root))
    # All modules are parsed, including newly added modules not reachable yet.
    vendor = [root / name for name in graph['inputs'] if name.startswith('node_modules/three/')]
    return page, styles, references, graph, vendor


def candidate_directory(root, requested):
    """Explicit --out always creates a fresh candidate; it never erases trees."""
    root = Path(root).resolve()
    target = Path(requested).resolve()
    protected = [root / p for p in ('js', 'css', 'assets', 'server', 'site', 'dist', 'desktop', 'apk', 'tools', 'docs', 'release', 'node_modules', 'data', 'secrets')]
    if target == root or root.is_relative_to(target) or any(target == p or target.is_relative_to(p) or p.is_relative_to(target) for p in protected):
        raise ValueError('--out must be a fresh candidate directory, not a source/release location: ' + str(target))
    if target.exists():
        raise ValueError('--out already exists; choose a fresh directory: ' + str(target))
    return target


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    try:
        page, styles, references, graph, vendor = native_closure(args.root)
        python_files = [p for p in (args.root / 'tools').rglob('*.py')
                        if not {'out', '__pycache__', 'node_modules'}.intersection(p.relative_to(args.root).parts)]
        for source in python_files:
            ast.parse(source.read_text(encoding='utf-8-sig'), filename=str(source))
        print(json.dumps({'styles': [str(p.relative_to(args.root)) for p in styles],
                          'resources': len(references), 'modules': len(graph['inputs']),
                          'vendorFiles': len(vendor), 'pythonSyntaxFiles': len(python_files)}, ensure_ascii=False))
    except (ValueError, OSError, SyntaxError) as exc:
        parser.exit(1, str(exc) + '\n')
