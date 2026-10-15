# 构建 Android APK。
# Android 构建工具不支持路径里有中文，所以先把 apk/ 复制到纯英文路径再构建，最后把 APK 拷回项目根目录。
# 用法：python tools/apk_build.py        （先确保已运行 tools/build_dist.py 和 cd apk && npx cap sync android）
import os, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
WORK = os.environ.get('NIKKI_APK_WORK') or os.path.join(ROOT, 'output', 'android-build')
SDK = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or (os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Android', 'Sdk') if os.name == 'nt' else os.path.expanduser('~/Android/Sdk'))
JDK = os.environ.get('JAVA_HOME', '')

def ignore(d, names):
    # 只排除 Gradle 的构建缓存，不能误伤游戏资源里的同名文件夹
    parts = d.replace('\\', '/').split('/')
    in_android_src = 'android' in parts and 'node_modules' not in parts and 'public' not in parts
    return [n for n in names if n == 'build.log' or (in_android_src and n in ('build', '.gradle'))]

def main():
    if not os.path.isdir(SDK): raise SystemExit('Set ANDROID_HOME to an installed Android SDK')
    if JDK and not os.path.isdir(JDK): raise SystemExit('Set JAVA_HOME to an installed JDK')
    dst = os.path.join(WORK, 'apk')
    source, target, workspace = Path(ROOT, 'apk').resolve(), Path(dst).resolve(), Path(WORK).resolve()
    if target.parent != workspace or target == source or target in source.parents or source in target.parents or workspace == Path(workspace.anchor):
        raise SystemExit('Unsafe Android staging directory: ' + str(target))
    os.makedirs(WORK, exist_ok=True)
    if os.path.isdir(dst): shutil.rmtree(dst)
    shutil.copytree(os.path.join(ROOT, 'apk'), dst, ignore=ignore)
    pub = os.path.join(dst, 'android', 'app', 'src', 'main', 'assets', 'public')
    assert os.path.exists(os.path.join(pub, 'vendor', 'three', 'lib', 'three.module.js')), '游戏资源没有同步进来，请先运行 tools/build_dist.py 和 npx cap sync android'
    with open(os.path.join(dst, 'android', 'local.properties'), 'w') as f:
        f.write('sdk.dir=' + SDK.replace('\\', '/').replace(':', '\\:') + '\n')
    env = dict(os.environ, ANDROID_HOME=SDK.replace('\\', '/'))
    if JDK: env['JAVA_HOME'] = JDK
    wrapper = os.path.join(dst, 'android', 'gradlew.bat' if os.name == 'nt' else 'gradlew')
    command = [wrapper] if os.name == 'nt' else ['sh', wrapper]
    r = subprocess.run([*command, 'assembleDebug', '--no-daemon'], cwd=os.path.join(dst, 'android'), env=env)
    if r.returncode: sys.exit(r.returncode)
    apk = os.path.join(dst, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
    out = os.path.join(ROOT, '暖暖的方块小镇.apk')
    shutil.copy2(apk, out)
    print('APK:', out, round(os.path.getsize(out) / 1e6, 2), 'MB')

if __name__ == '__main__':
    main()
