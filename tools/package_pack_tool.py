"""Build a redistributable Windows folder and ZIP for the pack desk."""
from datetime import datetime
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import uuid
import zipfile

ROOT = Path(__file__).resolve().parent.parent
HELPERS = ('resource_graph.py', 'module_graph.cjs', 'build_runtime.py', 'build_dist.py',
           'build_single.py', 'check_candidate.py', 'web_delivery.py', 'web_play_loader.js',
           'web_play_sw.js', 'verify_packaged_assets.cjs')
README = '''暖暖小镇三端打包工具 · Windows 便携版 1.0.0

发给朋友：请发送整个 ZIP。对方先全部解压，再双击“暖暖小镇三端打包工具.exe”。
请保留同目录的 _internal 文件夹，不能只发送 EXE。

打开本工具不需要安装 Python，Python 和窗口组件已随工具附带。
这是为暖暖小镇当前 HTML/Three.js + Electron + Capacitor 工程制作的打包器，
不是任意项目通用打包器。包内没有游戏源码、账号、数据库、登录信息或签名私钥。

使用步骤
1. 点击“选择目录”，选择朋友自己的完整暖暖小镇源码工程。
2. 勾选网页、Windows、Android 中需要的平台，点击“检查与自动检索”。
3. 工具显示缺失原因与处理办法。安装在非标准位置的环境，可“添加搜索目录”。
4. 缺 npm 依赖时点击“补齐项目依赖”，按工程 package-lock.json 安装；可能联网。
5. 若旧工程缺少构建辅助文件，可从本包“工程辅助文件/tools”复制所需文件到
   工程 tools 目录。已有同名文件先备份和核对兼容性，避免覆盖朋友的自定义改动。
6. 检查通过后点击“开始打包”。双击检查表的任意行可以查看完整信息。
7. 完成后点击“打开本次产物”，每次输出独立保存在工程 output/three-pack-编号/。

外部构建环境（按所选平台检查）
通用：Node.js 24+、npm，以及工程锁定的 Three.js/esbuild 等依赖。
Windows：工程 desktop 中的 Electron、@electron/packager 和宿主文件。
Android：JDK 21、与工程 compileSdk 匹配的 Android SDK/Build Tools、Gradle Wrapper、
Capacitor 工程；第一次构建可能下载 Gradle/Maven 依赖并需要接受 SDK 许可证。
以上环境没有塞进本ZIP，工具负责定位、检查并提示；npm项目依赖可在窗口内补齐。
本工具按 Windows x64 制作，其他系统未验证。

产物类型
网页 ZIP：单文件游戏 HTML 和托管游戏资源，不包含账号 API 或整站服务器。
Windows ZIP：解压后运行的游戏便携包。
Android APK：debug 调试包；不包含正式签名配置，不等于已完成正式发行。
设备安装、覆盖升级和线上发布仍需另行验收。

构建日志与完整SHA-256在每轮输出的 build.log 和 result.json 中。
工具会核对包内资源哈希，并在构建期间源码变化时阻止标记成功。
请在构建过程中暂停修改源码。工具不会自动上传或操作玩家数据库。

本包“工具源码”提供软件源码；“文件校验.json”列出本包文件的大小与SHA-256。
'''


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
    out = ROOT / 'output' / ('pack-tool-portable-' + stamp)
    out.mkdir(parents=True)
    version = out / 'version.txt'
    version.write_text('''VSVersionInfo(ffi=FixedFileInfo(filevers=(1,0,0,0), prodvers=(1,0,0,0), mask=0x3f,
flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0,0)),
kids=[StringFileInfo([StringTable('080404b0', [StringStruct('FileDescription','暖暖小镇三端打包工具'),
StringStruct('FileVersion','1.0.0'), StringStruct('ProductName','暖暖小镇三端打包工具'),
StringStruct('ProductVersion','1.0.0')])]), VarFileInfo([VarStruct('Translation',[2052,1200])])])''', encoding='utf-8')
    command = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
               '--console', '--hide-console', 'hide-early', '--name', '暖暖小镇三端打包工具',
               '--icon', str(ROOT / 'desktop/icon.ico'), '--version-file', str(version),
               '--distpath', str(out / 'dist'), '--workpath', str(out / 'work'), '--specpath', str(out),
               '--hidden-import', 'ast', '--hidden-import', 'html.parser', '--hidden-import', 'urllib.parse',
               str(ROOT / 'tools/pack_three.py')]
    with (out / 'packaging.log').open('w', encoding='utf-8') as log:
        subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
    folder = out / 'dist/暖暖小镇三端打包工具'
    (folder / '先读我.txt').write_text(README, encoding='utf-8-sig')
    helpers = folder / '工程辅助文件/tools'
    helpers.mkdir(parents=True)
    for name in HELPERS:
        shutil.copy2(ROOT / 'tools' / name, helpers / name)
    source = folder / '工具源码'
    source.mkdir()
    for name in ('pack_three.py', 'package_pack_tool.py'):
        shutil.copy2(ROOT / 'tools' / name, source / name)
    files = [{'path': p.relative_to(folder).as_posix(), 'bytes': p.stat().st_size, 'sha256': digest(p)}
             for p in sorted(folder.rglob('*')) if p.is_file()]
    (folder / '文件校验.json').write_text(json.dumps({'toolVersion': '1.0.0', 'files': files}, ensure_ascii=False, indent=2), encoding='utf-8')
    archive = out / '暖暖小镇三端打包工具-Windows便携版.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for p in sorted(folder.rglob('*')):
            if p.is_file():
                bundle.write(p, str(Path(folder.name) / p.relative_to(folder)))
    (out / 'delivery.json').write_text(json.dumps({'folder': str(folder), 'zip': str(archive),
        'bytes': archive.stat().st_size, 'sha256': digest(archive)}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(out, flush=True)


if __name__ == '__main__':
    main()
