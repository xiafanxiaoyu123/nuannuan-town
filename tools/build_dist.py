# 生成可直接上传到静态托管的发布文件夹 dist/：游戏代码 + 只含用到的 three.js 文件（不带 node_modules / tools / 视频）
import os, re, shutil, sys
from pathlib import Path
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DIST = os.path.join(ROOT, 'dist')
T = os.path.join(ROOT, 'node_modules', 'three')
root_path, dist_path = Path(ROOT).resolve(), Path(DIST)
if dist_path.is_symlink() or dist_path.resolve().parent != root_path or dist_path.name != 'dist':
    raise SystemExit('Unsafe distribution directory: ' + str(dist_path))
if not os.path.isfile(os.path.join(T, 'LICENSE')):
    raise SystemExit('Missing three.js installation. Run npm ci first.')
if os.path.isdir(DIST): shutil.rmtree(DIST)
os.makedirs(DIST)
for name in ('css', 'js'): shutil.copytree(os.path.join(ROOT, name), os.path.join(DIST, name))

# 找出游戏用到的 addons，并沿 import 链补全依赖
seen, todo = set(), []
for dp, _, fs in os.walk(os.path.join(ROOT, 'js')):
    for f in fs:
        if f.endswith('.js'):
            for m in re.finditer(r"from\s+'three/addons/([^']+)'", open(os.path.join(dp, f), encoding='utf-8').read()):
                todo.append(os.path.join(T, 'examples', 'jsm', m.group(1)))
while todo:
    p = os.path.normpath(todo.pop())
    if p in seen: continue
    seen.add(p)
    src = open(p, encoding='utf-8').read()
    for m in re.finditer(r"""(?:from|import)\s*['"](\.{1,2}/[^'"]+)['"]""", src):
        todo.append(os.path.join(os.path.dirname(p), m.group(1)))
files = sorted(seen) + [os.path.join(T, 'build', 'three.module.js')]
# three.module.js 若引用同目录的 three.core.js 也带上
core = os.path.join(T, 'build', 'three.core.js')
if re.search(r"three\.core\.js", open(files[-1], encoding='utf-8').read()) and os.path.exists(core): files.append(core)
for p in files:
    rel = os.path.relpath(p, T)
    # 许多工具会忽略名叫 build 的文件夹（Gradle 复制、静态托管上传等），所以引擎主体放到 lib/ 下
    if rel.startswith('build' + os.sep): rel = 'lib' + rel[len('build'):]
    dst = os.path.join(DIST, 'vendor', 'three', rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(p, dst)

html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
html = html.replace('./node_modules/three/build/three.module.js', './vendor/three/lib/three.module.js').replace('./node_modules/three/examples/jsm/', './vendor/three/examples/jsm/')
assert 'node_modules' not in html
open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8').write(html)
# 保留依赖及项目许可证；dist 是纯静态目录，不复制依赖账号 API 的服务器入口。
shutil.copy2(os.path.join(T, 'LICENSE'), os.path.join(DIST, 'vendor', 'three', 'LICENSE'))
for name in ('LICENSE', 'THIRD_PARTY_NOTICES.md'):
    shutil.copy2(os.path.join(ROOT, name), os.path.join(DIST, name))
size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(DIST) for f in fs)
print(f'dist 生成完成：{len(files)} 个 three.js 文件，共 {size / 1e6:.2f} MB')
print('预览：python -m http.server 5173 --bind 127.0.0.1 --directory dist')
