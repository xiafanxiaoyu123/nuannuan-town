"""Local three-platform build desk. Standard-library GUI and CLI; no deployment."""
import argparse
from contextlib import contextmanager
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import runpy
import shutil
import subprocess
import sys
import threading
import time
import traceback
import uuid
import zipfile
from windows_workspace import create_windows_workspace, verify_windows_execution_label, install_portable_launcher

FROZEN = bool(getattr(sys, 'frozen', False))
BUNDLE = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))


def default_root():
    if not FROZEN:
        return Path(__file__).resolve().parent.parent
    folder = Path(sys.executable).resolve().parent
    for candidate in (folder, folder.parent, Path.cwd()):
        if (candidate / 'index.html').is_file() and (candidate / 'js/main.js').is_file():
            return candidate
    return folder


ROOT = default_root()
NAME = '暖暖的方块小镇'
PLATFORMS = ('web', 'windows', 'android')
LABELS = {'web': '网页', 'windows': 'Windows', 'android': 'Android（调试 APK）'}
RUNNERS = {'resource_graph.py', 'build_dist.py', 'build_single.py', 'check_candidate.py'}


def python_command(script, *args):
    if FROZEN:
        return [sys.executable, '--run-script', str(script), *map(str, args)]
    return [sys.executable, '-B', '-X', 'utf8', str(script), *map(str, args)]


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def save_json(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def probe(command, env=None):
    try:
        result = subprocess.run([str(x) for x in command], capture_output=True, text=True,
                                encoding='utf-8', errors='replace', timeout=30, env=env,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        return result.returncode == 0, (result.stdout + result.stderr).strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, str(exc)


def discover(root, extra=()):
    """Bounded local discovery, never reads credentials or scans entire drives."""
    local = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local')))
    program = Path(os.environ.get('ProgramFiles', 'C:/Program Files'))
    found = {'node': shutil.which('node'), 'npm': shutil.which('npm.cmd' if os.name == 'nt' else 'npm'),
             'java': None, 'sdk': None, 'esbuild': None}
    for path in [root / 'node_modules/.bin/esbuild.cmd', root / 'desktop/node_modules/.bin/esbuild.cmd',
                 root / 'apk/node_modules/.bin/esbuild.cmd']:
        if path.is_file():
            found['esbuild'] = str(path)
            break
    jdks = [Path(os.environ[k]) for k in ('JAVA_HOME',) if os.environ.get(k)]
    for pattern in ('Eclipse Adoptium/*', 'Java/*', 'Microsoft/jdk*', 'Android/Android Studio/jbr'):
        jdks.extend(sorted(program.glob(pattern)))
    sdks = [Path(os.environ[k]) for k in ('ANDROID_HOME', 'ANDROID_SDK_ROOT') if os.environ.get(k)]
    sdks.append(local / 'Android/Sdk')
    properties = root / 'apk/android/local.properties'
    if properties.is_file():
        match = re.search(r'^sdk\.dir=(.+)$', properties.read_text(encoding='utf-8'), re.M)
        if match:
            sdks.append(Path(match[1].replace('\\:', ':').replace('\\\\', '\\')))
    # Custom locations may be an SDK/JDK itself or a containing folder (max 5 levels/12000 dirs).
    count = 0
    for base in extra:
        base = Path(base).resolve()
        for directory, dirs, files in os.walk(base, followlinks=False):
            count += 1
            path = Path(directory)
            dirs[:] = [d for d in dirs if d not in {'.git', '.gradle', 'output', 'dist', 'data', 'secrets'}
                       and not (path / d).is_symlink() and not (path / d).is_junction()]
            if len(path.relative_to(base).parts) >= 5 or count > 12000:
                dirs[:] = []
            if path.name == 'bin' and 'java.exe' in files:
                jdks.append(path.parent)
            if 'platforms' in dirs and 'build-tools' in dirs:
                sdks.append(path)
            for key, filename in [('node', 'node.exe'), ('npm', 'npm.cmd'), ('esbuild', 'esbuild.cmd')]:
                if not found[key] and filename in files:
                    found[key] = str(path / filename)
            if count > 12000:
                break
    java_name = 'java.exe' if os.name == 'nt' else 'java'
    for jdk in jdks:
        java = jdk / 'bin' / java_name
        if not java.is_file() or not (jdk / 'bin' / ('javac.exe' if os.name == 'nt' else 'javac')).is_file():
            continue
        ok, version = probe([java, '-version'])
        # Capacitor 8/this Android project use Java 21.
        if ok and re.search(r'version "21[.\"]', version):
            found['java'] = str(jdk.resolve())
            break
    for sdk in sdks:
        if (sdk / 'platforms').is_dir() and (sdk / 'build-tools').is_dir():
            found['sdk'] = str(sdk.resolve())
            break
    return found


def build_env(found):
    env = os.environ.copy()
    # Build subprocesses must not inherit application/server overrides.
    for key in list(env):
        if key.startswith(('AUTH_', 'ADMIN_', 'PAYMENT_', 'BILLING_', 'NIKKI_')) or key in (
                'NODE_OPTIONS', 'NODE_PATH', 'DATA_DIR', 'ESBUILD', 'ELECTRON_RUN_AS_NODE'):
            env.pop(key, None)
    env['PYTHONUTF8'] = '1'
    env['PYTHONIOENCODING'] = 'utf-8'
    paths = []
    for key in ('node', 'npm'):
        if found.get(key):
            paths.append(str(Path(found[key]).parent))
    if found.get('java'):
        env['JAVA_HOME'] = found['java']
        paths.append(str(Path(found['java']) / 'bin'))
    if found.get('sdk'):
        env['ANDROID_HOME'] = env['ANDROID_SDK_ROOT'] = found['sdk']
    if found.get('esbuild'):
        env['ESBUILD'] = found['esbuild']
    env['PATH'] = os.pathsep.join(paths + [env.get('PATH', '')])
    return env


def missing_names(rows):
    names = []
    for row in rows:
        if row['ok']:
            continue
        names += re.findall(r'(?:Missing resource: |Missing (?:module|file): )([^\s\n]+)', row['detail'])
        names += re.findall(r'Could not resolve [\'"]([^\'"]+)[\'"]', row['detail'])
        if ' / ' in row['name'] and row['name'].split(' / ')[0] in ('Windows', 'Gradle'):
            names.append(row['name'].split(' / ')[1])
    return sorted({n for n in names if Path(n).suffix})


def inspect(root, platforms, extra=()):
    root = Path(root).resolve()
    found = discover(root, extra)
    rows = []

    def add(name, ok, detail, fix=''):
        rows.append({'name': name, 'ok': bool(ok), 'detail': str(detail), 'fix': fix})

    add('Python（内置）' if FROZEN else 'Python', sys.version_info >= (3, 12), sys.version.split()[0], '安装 Python 3.12 或更新版本（含 Tk）')
    add('工程入口', (root / 'index.html').is_file() and (root / 'js/main.js').is_file(), root,
        '选择含 index.html、js、tools、desktop、apk 的源码目录')
    helpers = ['resource_graph.py', 'module_graph.cjs', 'build_runtime.py', 'build_dist.py',
               'build_single.py', 'check_candidate.py', 'web_delivery.py', 'web_play_loader.js', 'web_play_sw.js']
    if 'windows' in platforms:
        helpers.append('verify_packaged_assets.cjs')
    missing_helpers = [name for name in helpers if not (root / 'tools' / name).is_file()]
    add('工程构建辅助文件', not missing_helpers, ', '.join(missing_helpers) if missing_helpers else '所需文件完整',
        '将便携包中“工程辅助文件/tools”内缺失的脚本复制到游戏工程 tools，再检查')
    ok, version = probe([found['node'], '--version']) if found['node'] else (False, '未找到')
    add('Node.js', ok and int(re.search(r'\d+', version)[0]) >= 24 if ok else False, version,
        '安装 Node.js 24+ 或添加本机安装目录后重查')
    versions = {}
    for name in ('site/releases.json', 'desktop/package.json', 'apk/package.json'):
        try:
            versions[name] = read_json(root / name)['version']
        except (OSError, ValueError, KeyError) as exc:
            add(name, False, str(exc), '恢复对应源码元数据文件')
    try:
        gradle = (root / 'apk/android/app/build.gradle').read_text(encoding='utf-8')
        versions['Android versionName'] = re.search(r'versionName\s+[\'"]([^\'"]+)', gradle)[1]
    except (OSError, TypeError) as exc:
        add('Android 版本元数据', False, str(exc), '恢复 app/build.gradle')
    add('三端版本一致', len(versions) == 4 and len(set(versions.values())) == 1,
        json.dumps(versions, ensure_ascii=False), '核对 site、desktop、apk 及 Android versionName；工具不擅自改版本')
    dependencies = [('', 'three'), ('', 'esbuild')]
    if 'windows' in platforms:
        dependencies += [('desktop', 'electron'), ('desktop', '@electron/packager')]
    if 'android' in platforms:
        dependencies += [('apk', '@capacitor/cli'), ('apk', '@capacitor/core'), ('apk', '@capacitor/android')]
    missing_groups = set()
    for group, package in dependencies:
        file = root / group / 'node_modules' / package / 'package.json'
        expected = read_json(root / group / 'package.json') if (root / group / 'package.json').is_file() else {}
        wanted = {**expected.get('dependencies', {}), **expected.get('devDependencies', {})}.get(package)
        try:
            actual = read_json(file)['version']
            locked = read_json(root / group / 'package-lock.json').get('packages', {}).get('node_modules/' + package, {}).get('version')
            valid = bool(locked) and actual == locked
        except (OSError, ValueError, KeyError):
            actual, valid = '未找到', False
        add(f'{group or "根目录"} / {package}', valid, f'{actual}（声明 {wanted}）', '点击“补齐项目依赖”，按锁文件安装')
        if not valid:
            missing_groups.add(group)
    add('esbuild 可执行入口', found['esbuild'], found['esbuild'] or '未找到', '补齐根目录依赖，或添加搜索目录')
    env = build_env(found)
    if found['node'] and (root / 'node_modules/three/package.json').is_file():
        ok, detail = probe(python_command(root / 'tools/resource_graph.py', '--root', root), env)
        add('源码与资源引用闭包', ok, detail, '按错误位置修复源码或依赖；缺文件时可查找同名备份，恢复后重查')
    else:
        add('源码与资源引用闭包', False, '需先补齐 Node 与 Three.js 后才能完整检查', '补齐依赖后重新检查')
    if 'windows' in platforms:
        for name in ('main.js', 'preload.js', 'updater.js', 'icon.ico', 'release-config.json', 'update-public.pem'):
            add('Windows / ' + name, (root / 'desktop' / name).is_file(), root / 'desktop' / name, '从主工程备份恢复此宿主文件')
        electron = root / 'desktop/node_modules/electron/dist/electron.exe'
        add('Electron 运行时', electron.is_file(), electron, '在 desktop 执行 npm rebuild electron，或重新安装 desktop 依赖')
    if 'android' in platforms:
        add('JDK 21', found['java'], found['java'] or '未找到完整 JDK 21', '添加 JDK 所在文件夹重新搜索，或安装 JDK 21')
        add('Android SDK', found['sdk'], found['sdk'] or '未找到', '添加 Android SDK 所在文件夹，或用 Android Studio 安装 SDK')
        variables = root / 'apk/android/variables.gradle'
        text = variables.read_text(encoding='utf-8') if variables.is_file() else ''
        match = re.search(r'compileSdkVersion\s*=\s*(\d+)', text)
        api = match[1] if match else '?'
        sdk = Path(found['sdk']) if found['sdk'] else Path('__missing_sdk__')
        add('Android 平台 ' + api, (sdk / f'platforms/android-{api}/android.jar').is_file(), sdk / f'platforms/android-{api}', '用 SDK Manager 安装对应 Android SDK Platform')
        tools = list((sdk / 'build-tools').glob('*/aapt2.exe'))
        add('Android Build Tools', bool(tools), ', '.join(str(p.parent) for p in tools) or '未找到', '用 SDK Manager 安装 Build Tools')
        for name in ('gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties'):
            add('Gradle / ' + name, (root / 'apk/android' / name).is_file(), name, '从 apk/android 源码备份恢复 wrapper')
    names = missing_names(rows)
    matches, limited = find_files([root, *extra], names) if names else ([], False)
    if matches:
        for row in rows:
            if not row['ok'] and (row['name'] == '源码与资源引用闭包' or row['name'].startswith(('Windows / ', 'Gradle / '))):
                row['detail'] += '\n检索到同名候选（需核对版本）：\n' + '\n'.join(matches[:30])
    return {'root': str(root), 'platforms': list(platforms), 'tools': found, 'versions': versions,
            'fileCandidates': matches, 'fileSearchLimited': limited,
            'checks': rows, 'missingDependencyGroups': sorted(missing_groups),
            'ready': all(row['ok'] for row in rows), 'checkedAt': datetime.now().isoformat(timespec='seconds')}


def find_files(roots, names):
    matches = []
    count = 0
    wanted = {Path(n).name.lower() for n in names if n}
    for base in roots:
        base = Path(base).resolve()
        for directory, dirs, files in os.walk(base, followlinks=False):
            path = Path(directory)
            count += 1
            dirs[:] = [d for d in dirs if d not in {'.git', '.gradle', 'data', 'secrets', 'sessions', 'logs'}
                       and not (path / d).is_symlink() and not (path / d).is_junction()]
            if len(path.relative_to(base).parts) >= 8 or count > 30000:
                dirs[:] = []
            for name in files:
                if name.lower() in wanted:
                    matches.append(str(path / name))
            if count > 30000:
                return matches, True
    return matches, False


@contextmanager
def build_lock(root):
    path = Path(root) / 'output/three-pack.lock'
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise RuntimeError(f'另一个打包/依赖安装任务持有锁：{path}。异常退出时，请确认旧进程已结束后再删除锁。')
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(str(os.getpid()))
        yield
    finally:
        path.unlink(missing_ok=True)


def run(command, cwd, env, log):
    command = [str(x) for x in command]
    # cmd wrappers receive only fixed arguments and local paths, never user shell text.
    wrapper = command[0].lower().endswith(('.cmd', '.bat'))
    if wrapper:
        if any(re.search(r'[&|<>^%\r\n"]', x) for x in command):
            raise ValueError('Windows 批处理路径含特殊字符；请将工程放入普通文件夹')
    log('执行：' + ' '.join(command))
    process = subprocess.Popen(command, cwd=cwd, env=env, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace',
                               shell=wrapper,
                               creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    for line in process.stdout:
        log(line.rstrip())
    if process.wait():
        raise RuntimeError(f'步骤失败，退出码 {process.returncode}；查看上方日志')


def zip_tree(folder, target, prefix=''):
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted(Path(folder).rglob('*')):
            if file.is_file():
                archive.write(file, str(Path(prefix) / file.relative_to(folder)))


def verify_packaged_assets(native, packaged, root=ROOT):
    """Check actual packaged bytes, rather than trusting a copied manifest alone."""
    native, packaged = Path(native), Path(packaged)
    manifest = read_json(native / 'build-manifest.json')
    files = dict(manifest['files'])
    files['build-manifest.json'] = sha(native / 'build-manifest.json')
    if packaged.suffix == '.asar':
        found = discover(Path(root))
        ok, detail = probe([found['node'], Path(root) / 'tools/verify_packaged_assets.cjs', root, native, packaged], build_env(found))
        if not ok:
            raise RuntimeError('Windows ASAR 资源校验失败：' + detail)
        return json.loads(detail)['filesChecked']
    if packaged.suffix == '.apk':
        with zipfile.ZipFile(packaged) as archive:
            for name, expected in files.items():
                if hashlib.sha256(archive.read('assets/public/' + name)).hexdigest() != expected:
                    raise RuntimeError('APK 内资源不一致：' + name)
    else:
        for name, expected in files.items():
            file = packaged / name
            if not file.is_file() or sha(file) != expected:
                raise RuntimeError('Windows 内资源不一致：' + name)
    return len(files)


def snapshot(root):
    files = [root / 'index.html', root / 'site/releases.json', root / 'package.json', root / 'package-lock.json']
    files += [p for p in (root / 'tools').glob('*') if p.suffix in ('.py', '.js', '.cjs')]
    for name in ('js', 'css', 'desktop', 'apk'):
        for directory, dirs, names in os.walk(root / name):
            dirs[:] = [d for d in dirs if d not in ('node_modules', 'build', 'dist', '.gradle', '.git', 'public')]
            files.extend(Path(directory) / n for n in names if n not in ('local.properties', 'build.log'))
    return {str(p.relative_to(root)): sha(p) for p in sorted(files) if p.is_file()}


def package(root, platforms, extra=(), emit=print):
    root = Path(root).resolve()
    with build_lock(root):
        report = inspect(root, platforms, extra)
        if not report['ready']:
            raise RuntimeError('打包前检查未通过：\n' + '\n'.join(r['name'] + '：' + r['detail'] + '\n处理：' + r['fix'] for r in report['checks'] if not r['ok']))
        tag = datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
        out = root / 'output' / ('three-pack-' + tag)
        out.mkdir(parents=True)
        env = build_env(report['tools'])
        save_json(out / 'preflight.json', report)
        baseline = snapshot(root)
        save_json(out / 'source-baseline.json', baseline)
        result = {'status': 'building', 'platforms': list(platforms), 'version': report['versions']['site/releases.json'],
                  'output': str(out), 'artifacts': [], 'androidBuildType': 'debug',
                  'evidence': 'Local package build only; device, upgrade, signing/release and production not verified.'}
        stage = None
        windows_stage = None
        with (out / 'build.log').open('w', encoding='utf-8', buffering=1) as stream:
            def log(message):
                stream.write(message + '\n')
                emit(message)
            try:
                log('本次输出：' + str(out))
                if 'web' in platforms:
                    run(python_command(root / 'tools/build_single.py', '--out', out / 'web'), root, env, log)
                    run(python_command(root / 'tools/check_candidate.py', '--web', out / 'web'), root, env, log)
                    zip_tree(out / 'web', out / '网页版.zip')
                    result['artifacts'].append('网页版.zip')
                if {'windows', 'android'} & set(platforms):
                    run(python_command(root / 'tools/build_dist.py', '--out', out / 'native'), root, env, log)
                    run(python_command(root / 'tools/check_candidate.py', '--esm', out / 'native'), root, env, log)
                if 'windows' in platforms:
                    host = out / 'windows-host'
                    host.mkdir()
                    for file in (root / 'desktop').iterdir():
                        if file.is_file() and file.suffix in ('.js', '.json', '.ico', '.pem') and file.name != 'package-lock.json':
                            shutil.copy2(file, host / file.name)
                    shutil.copytree(out / 'native', host / 'dist')
                    electron_version = read_json(root / 'desktop/node_modules/electron/package.json')['version']
                    cache = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'electron/Cache'
                    cached = list(cache.glob('*/electron-v' + electron_version + '-win32-x64.zip'))
                    cache_args = ['--electron-zip-dir=' + str(cached[0].parent)] if cached else []
                    log('Electron：' + ('使用本机缓存 ' + str(cached[0]) if cached else '没有压缩包缓存，将由现有 packager 下载匹配版本'))
                    windows_stage = create_windows_workspace()
                    log('Windows 暂存：' + str(windows_stage))
                    run([report['tools']['node'], root / 'desktop/node_modules/@electron/packager/bin/electron-packager.mjs',
                         host, NAME, '--platform=win32', '--arch=x64', '--out=' + str(windows_stage),
                         '--icon=' + str(host / 'icon.ico'), '--electron-version=' + electron_version,
                         '--prune=false', *cache_args], root, env, log)
                    exe_folder = windows_stage / (NAME + '-win32-x64')
                    if not (exe_folder / (NAME + '.exe')).is_file():
                        raise RuntimeError('Windows 输出缺少 EXE')
                    log('Windows 执行完整性：' + str(verify_windows_execution_label(exe_folder / (NAME + '.exe'))))
                    archive = exe_folder / 'resources/app.asar'
                    packaged = archive if archive.is_file() else exe_folder / 'resources/app/dist'
                    log('Windows 包内资源校验：' + str(verify_packaged_assets(out / 'native', packaged, root)) + ' 项通过')
                    log('Windows 长路径入口：' + str(install_portable_launcher(root, exe_folder, NAME)))
                    zip_tree(exe_folder, out / 'Windows.zip', NAME)
                    result['artifacts'].append('Windows.zip')
                if 'android' in platforms:
                    # Fresh ASCII workspace; retained for debugging, never deletes a previous build.
                    stage = Path(os.environ.get('SystemDrive', 'C:') + '/nikki-build') / ('pack-' + tag)
                    stage.mkdir(parents=True, exist_ok=False)
                    if not str(stage).isascii():
                        raise RuntimeError('Android 暂存路径必须是英文路径')
                    log('Android 暂存：' + str(stage))
                    def ignore(directory, names):
                        return [n for n in names if n in ('build', '.gradle', '.git', 'build.log', 'local.properties')
                                and 'node_modules' not in Path(directory).parts]
                    shutil.copytree(root / 'apk', stage / 'apk', ignore=ignore)
                    shutil.copytree(out / 'native', stage / 'dist')
                    run([report['tools']['node'], stage / 'apk/node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android'], stage / 'apk', env, log)
                    sdk = report['tools']['sdk'].replace('\\', '/').replace(':', '\\:')
                    (stage / 'apk/android/local.properties').write_text('sdk.dir=' + sdk + '\n', encoding='utf-8')
                    run([stage / 'apk/android/gradlew.bat', 'assembleDebug', '--no-daemon'], stage / 'apk/android', env, log)
                    apk = stage / 'apk/android/app/build/outputs/apk/debug/app-debug.apk'
                    log('APK 包内资源校验：' + str(verify_packaged_assets(out / 'native', apk)) + ' 项通过')
                    shutil.copy2(apk, out / 'Android-debug.apk')
                    result['artifacts'].append('Android-debug.apk')
                # Reject any concurrent source edits, even if earlier stages succeeded.
                if baseline != snapshot(root):
                    raise RuntimeError('构建期间源码发生变化，本轮不标记成功；请重新打包')
                result['files'] = [{'path': p, 'bytes': (out / p).stat().st_size, 'sha256': sha(out / p)} for p in result['artifacts']]
                result['status'] = 'success'
                log('所选平台构建完成：' + str(out))
            except Exception as exc:
                result.update(status='failed', error=str(exc))
                log('失败：' + str(exc))
                raise
            finally:
                result['androidStaging'] = str(stage) if stage else None
                result['windowsStaging'] = str(windows_stage) if windows_stage else None
                save_json(out / 'result.json', result)
                (out / '构建说明.txt').write_text('状态：' + result['status'] + '\n版本：' + result['version'] +
                    '\nAndroid 为 debug 调试包。Windows 为便携包。网页 ZIP 包含单文件与托管资源。\n'
                    '未验证：物理设备、覆盖升级、正式签名与线上发布。\n日志：build.log；校验：result.json\n', encoding='utf-8')
        return out


class Desk:
    def __init__(self, root=ROOT):
        import tkinter as tk
        from tkinter import ttk
        self.tk, self.ttk = tk, ttk
        self.win = tk.Tk()
        self.win.title('暖暖小镇 · 三端打包工具')
        self.win.geometry('1120x820')
        self.win.minsize(920, 650)
        self.events = queue.Queue()
        self.busy = False
        self.report = None
        self.last_output = None
        self.extra = []
        self.root = tk.StringVar(value=str(root))
        self.status = tk.StringVar(value='选择目标平台，工具会先检查环境与源码，再生成独立候选包。')
        style = ttk.Style()
        style.theme_use('clam')
        style.configure('TButton', padding=(12, 7))
        outer = ttk.Frame(self.win, padding=20)
        outer.pack(fill='both', expand=True)
        ttk.Label(outer, text='三端打包工作台', font=('Microsoft YaHei UI', 21, 'bold')).pack(anchor='w')
        ttk.Label(outer, text='自动检查缺失 · 查找本机依赖 · 独立保存每次产物与日志', font=('Microsoft YaHei UI', 10)).pack(anchor='w', pady=(4, 14))
        row = ttk.Frame(outer)
        row.pack(fill='x')
        ttk.Label(row, text='工程目录').pack(side='left', padx=(0, 10))
        ttk.Entry(row, textvariable=self.root).pack(side='left', fill='x', expand=True)
        ttk.Button(row, text='选择目录', command=self.choose_root).pack(side='left', padx=6)
        row = ttk.Frame(outer)
        row.pack(fill='x', pady=12)
        self.selected = {p: tk.BooleanVar(value=True) for p in PLATFORMS}
        for p in PLATFORMS:
            ttk.Checkbutton(row, text=LABELS[p], variable=self.selected[p]).pack(side='left', padx=(0, 25))
        actions = ttk.Frame(outer)
        actions.pack(fill='x')
        self.buttons = []
        for title, command in [('检查与自动检索', self.check), ('添加搜索目录', self.add_search),
                               ('查找缺失同名文件', self.search_files), ('补齐项目依赖', self.repair), ('开始打包', self.build)]:
            button = ttk.Button(actions, text=title, command=command)
            button.pack(side='left', padx=(0, 8))
            self.buttons.append(button)
        ttk.Label(outer, textvariable=self.status, wraplength=1030).pack(anchor='w', pady=12)
        self.progress = ttk.Progressbar(outer, mode='indeterminate')
        self.progress.pack(fill='x', pady=(0, 10))
        pane = ttk.Panedwindow(outer, orient='vertical')
        pane.pack(fill='both', expand=True)
        table_frame = ttk.Frame(pane)
        self.table = ttk.Treeview(table_frame, columns=('state', 'name', 'detail', 'fix'), show='headings', height=10)
        for key, label, width in [('state', '状态', 65), ('name', '检查项目', 195), ('detail', '找到的文件 / 原因', 420), ('fix', '处理办法', 290)]:
            self.table.heading(key, text=label)
            self.table.column(key, width=width, minwidth=50)
        self.table.tag_configure('missing', foreground='#b42318')
        scroll = ttk.Scrollbar(table_frame, orient='vertical', command=self.table.yview)
        self.table.configure(yscrollcommand=scroll.set)
        self.table.bind('<Double-1>', self.show_detail)
        self.table.pack(side='left', fill='both', expand=True)
        scroll.pack(side='right', fill='y')
        pane.add(table_frame, weight=2)
        from tkinter.scrolledtext import ScrolledText
        self.log = ScrolledText(pane, height=12, font=('Consolas', 10), wrap='word', state='disabled')
        pane.add(self.log, weight=1)
        footer = ttk.Frame(outer)
        footer.pack(fill='x', pady=(12, 0))
        ttk.Button(footer, text='打开本次产物', command=self.open_output).pack(side='left')
        help_file = Path(sys.executable).parent / '先读我.txt' if FROZEN else ROOT / 'docs/三端打包工具.md'
        ttk.Button(footer, text='打开使用说明', command=lambda: os.startfile(help_file)).pack(side='left', padx=8)
        ttk.Label(footer, text='仅本地构建；Android 为调试包。首次依赖下载可能需要联网。').pack(side='right')
        self.win.protocol('WM_DELETE_WINDOW', self.close)
        self.win.after(100, self.pump)
        self.win.after(300, self.check)

    def emit(self, message):
        if message.startswith('本次输出：'):
            self.events.put(('output', Path(message.removeprefix('本次输出：'))))
        self.events.put(('log', message))

    def pump(self):
        try:
            while True:
                kind, data = self.events.get_nowait()
                if kind == 'log':
                    self.log.configure(state='normal')
                    self.log.insert('end', str(data) + '\n')
                    self.log.see('end')
                    self.log.configure(state='disabled')
                elif kind == 'report':
                    self.report = data
                    self.table.delete(*self.table.get_children())
                    for row in data['checks']:
                        self.table.insert('', 'end', values=('通过' if row['ok'] else '待处理', row['name'], row['detail'], row['fix']), tags=() if row['ok'] else ('missing',))
                elif kind == 'output':
                    self.last_output = data
                elif kind == 'done':
                    self.busy = False
                    self.progress.stop()
                    for button in self.buttons:
                        button.configure(state='normal')
                    self.status.set(data)
        except queue.Empty:
            pass
        self.win.after(100, self.pump)

    def args(self):
        platforms = [p for p in PLATFORMS if self.selected[p].get()]
        if not platforms:
            raise ValueError('至少选择一个平台')
        return Path(self.root.get()).resolve(), platforms, tuple(self.extra)

    def work(self, action):
        if self.busy:
            return
        try:
            args = self.args()
        except ValueError as exc:
            self.status.set(str(exc))
            return
        self.busy = True
        self.status.set('正在处理，请查看检查表和实时日志……')
        self.progress.start(12)
        for button in self.buttons:
            button.configure(state='disabled')
        def task():
            message = '操作完成'
            try:
                message = action(*args)
            except Exception as exc:
                self.emit(traceback.format_exc())
                message = '操作失败：' + str(exc)
            self.events.put(('done', message))
        threading.Thread(target=task, daemon=True).start()

    def check(self):
        def action(root, platforms, extra):
            report = inspect(root, platforms, extra)
            self.events.put(('report', report))
            for key, value in report['tools'].items():
                self.emit(key + '：' + str(value or '未找到'))
            for file in report['fileCandidates']:
                self.emit('自动检索到同名候选（请核对）：' + file)
            missing = sum(not row['ok'] for row in report['checks'])
            return f'检查完成：{len(report["checks"])} 项，{missing} 项待处理。' + ('可以开始打包。' if not missing else '处理后请重新检查。')
        self.work(action)

    def show_detail(self, event=None):
        selected = self.table.selection()
        if not selected:
            return
        values = self.table.item(selected[0], 'values')
        dialog = self.tk.Toplevel(self.win)
        dialog.title(values[1])
        dialog.geometry('840x420')
        from tkinter.scrolledtext import ScrolledText
        text = ScrolledText(dialog, wrap='word', font=('Microsoft YaHei UI', 10), padx=14, pady=14)
        text.pack(fill='both', expand=True)
        text.insert('end', '状态：' + values[0] + '\n\n' + values[2] + '\n\n处理办法：' + values[3])
        text.configure(state='disabled')

    def choose_root(self):
        from tkinter import filedialog
        if not self.busy:
            path = filedialog.askdirectory(title='选择游戏源码目录')
            if path:
                self.root.set(path)
                self.check()

    def add_search(self):
        from tkinter import filedialog
        path = filedialog.askdirectory(title='选择含 JDK、SDK、Node 或备份文件的文件夹')
        if path and path not in self.extra:
            self.extra.append(path)
            self.emit('新增搜索范围：' + path)
            self.check()

    def search_files(self):
        def action(root, platforms, extra):
            report = inspect(root, platforms, extra)
            self.events.put(('report', report))
            names = missing_names(report['checks'])
            if not names:
                self.emit('没有可按名称查找的缺失源码/宿主文件；环境依赖请按检查表补齐。')
                return '查找完成'
            matches, limited = report['fileCandidates'], report['fileSearchLimited']
            for match in matches:
                self.emit('同名候选（需核对版本后恢复）：' + match)
            return f'找到 {len(matches)} 个同名候选；未自动覆盖源码。' + ('达到扫描上限，可缩小搜索目录重试。' if limited else '')
        self.work(action)

    def repair(self):
        def action(root, platforms, extra):
            with build_lock(root):
                report = inspect(root, platforms, extra)
                npm = report['tools']['npm']
                if not npm:
                    raise RuntimeError('未找到 npm，请先添加 Node 安装目录')
                groups = set(report['missingDependencyGroups'])
                if not report['tools']['esbuild']:
                    groups.add('')
                if 'windows' in platforms and not (root / 'desktop/node_modules/electron/dist/electron.exe').is_file():
                    groups.add('desktop')
                for group in sorted(groups):
                    if not (root / group / 'package-lock.json').is_file():
                        raise RuntimeError('缺少锁文件：' + str(root / group / 'package-lock.json'))
                    run([npm, 'ci', '--no-audit', '--no-fund'], root / group, build_env(report['tools']), self.emit)
            updated = inspect(root, platforms, extra)
            self.events.put(('report', updated))
            return '依赖安装完成，检查表已更新。' if groups else '项目依赖已存在，无需重装。'
        self.work(action)

    def build(self):
        def action(root, platforms, extra):
            out = package(root, platforms, extra, self.emit)
            self.events.put(('output', out))
            return '打包完成：' + str(out)
        self.work(action)

    def open_output(self):
        path = self.last_output or Path(self.root.get()) / 'output'
        if Path(path).is_dir():
            os.startfile(path)

    def close(self):
        if self.busy:
            from tkinter import messagebox
            messagebox.showinfo('任务进行中', '请等待当前检查或构建结束后关闭，避免中断子进程。')
        else:
            self.win.destroy()


def main():
    # Frozen Windows processes otherwise use the machine's legacy console codec.
    # Parent and helper processes exchange UTF-8, including Chinese paths/logs.
    for output in (sys.stdout, sys.stderr):
        if output is not None and hasattr(output, 'reconfigure'):
            output.reconfigure(encoding='utf-8', errors='replace')
    if len(sys.argv) > 2 and sys.argv[1] == '--run-script':
        script = Path(sys.argv[2]).resolve()
        if script.name not in RUNNERS or script.parent.name != 'tools':
            raise ValueError('不支持的构建辅助脚本')
        sys.path.insert(0, str(script.parent))
        sys.argv = [str(script), *sys.argv[3:]]
        runpy.run_path(str(script), run_name='__main__')
        return 0
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--build', action='store_true')
    parser.add_argument('--platforms', nargs='+', choices=PLATFORMS, default=list(PLATFORMS))
    parser.add_argument('--search', type=Path, action='append', default=[])
    parser.add_argument('--report', type=Path, help='Write CLI result to a JSON file')
    parser.add_argument('--gui-smoke', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.check:
        report = inspect(args.root, args.platforms, args.search)
        if args.report:
            save_json(args.report, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report['ready'] else 1
    if args.build:
        out = package(args.root, args.platforms, args.search)
        if args.report:
            save_json(args.report, read_json(out / 'result.json'))
    else:
        desk = Desk(args.root)
        if args.gui_smoke:
            started = time.monotonic()
            def finish_smoke():
                if desk.report and not desk.busy:
                    if args.report:
                        save_json(args.report, {'gui': True, 'ready': desk.report['ready'],
                                               'rows': len(desk.table.get_children()), 'frozen': FROZEN})
                    desk.win.destroy()
                elif time.monotonic() - started > 60:
                    if args.report:
                        save_json(args.report, {'gui': False, 'error': 'timeout'})
                    desk.win.destroy()
                else:
                    desk.win.after(100, finish_smoke)
            desk.win.after(400, finish_smoke)
        desk.win.mainloop()
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print('失败：' + str(exc), file=sys.stderr)
        sys.exit(1)
