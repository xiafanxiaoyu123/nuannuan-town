# 构建 Windows 桌面版（Electron）：把 dist/ 拷进 desktop/，用 @electron/packager 打成文件夹，再压缩成 zip。
# 用法：python tools/exe_build.py     （先运行 tools/build_dist.py；desktop/ 里要已 npm install）
import os, shutil, subprocess, sys, zipfile
from windows_workspace import create_windows_workspace, verify_windows_execution_label, install_portable_launcher
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
D = os.path.join(ROOT, 'desktop')
NAME = '暖暖的方块小镇'
dist = os.path.join(D, 'dist')
if os.path.isdir(dist): shutil.rmtree(dist)
shutil.copytree(os.path.join(ROOT, 'dist'), dist)
out = os.path.join(ROOT, 'release')
os.makedirs(out, exist_ok=True)
windows_stage = create_windows_workspace()
r = subprocess.run(['npx', '--no-install', 'electron-packager', '.', NAME, '--platform=win32', '--arch=x64', '--out', str(windows_stage),
                    '--icon', 'icon.ico', '--ignore=install.log', '--ignore=node_modules', '--ignore=package-lock.json', '--prune=false', '--no-tmpdir'], cwd=D, shell=(os.name == 'nt'))
if r.returncode: sys.exit(r.returncode)
folder = os.path.join(windows_stage, f'{NAME}-win32-x64')
print('Windows execution integrity:', verify_windows_execution_label(os.path.join(folder, NAME + '.exe')))
print('Windows portable entry:', install_portable_launcher(ROOT, folder, NAME))
zp = os.path.join(out, f'{NAME}-Windows.zip')
if os.path.exists(zp): os.remove(zp)
with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for dp, _, fs in os.walk(folder):
        for f in fs:
            p = os.path.join(dp, f); z.write(p, os.path.join(NAME, os.path.relpath(p, folder)))
print('文件夹:', folder); print('压缩包:', zp, round(os.path.getsize(zp) / 1e6, 1), 'MB')
