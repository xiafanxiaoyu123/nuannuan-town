"""Native frozen entry: verify a complete runtime, keep the game's userData.

This entry can itself live on a long path. Chromium's native data files are
started from a normal per-user runtime cache; no game save is copied or reset.
"""
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile
import uuid

MANIFEST_SHA256 = '__MANIFEST_SHA256__'

def extended(path):
    value = os.path.abspath(os.fspath(path))
    if os.name == 'nt' and not value.startswith('\\\\?\\'):
        value = '\\\\?\\UNC\\' + value[2:] if value.startswith('\\\\') else '\\\\?\\' + value
    return Path(value)

def digest(file):
    with open(file, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def child(root, relative):
    p = PurePosixPath(relative)
    if not relative or p.is_absolute() or ':' in relative or '\\' in relative or any(x in ('.','..') for x in relative.split('/')):
        raise ValueError('运行清单包含无效路径')
    return root.joinpath(*p.parts)

def valid(root, entries):
    try:
        if not root.is_dir() or root.is_symlink() or root.is_junction():
            return False
        return all((p := child(root, x['path'])).is_file() and p.stat().st_size == x['size'] and digest(p) == x['sha256'] for x in entries)
    except OSError:
        return False

class RuntimeLock:
    def __enter__(self):
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.kernel.CreateMutexW.argtypes = [ctypes.c_void_p,wintypes.BOOL,wintypes.LPCWSTR]
        self.kernel.CreateMutexW.restype = wintypes.HANDLE
        self.kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE,wintypes.DWORD]
        self.kernel.ReleaseMutex.argtypes = [wintypes.HANDLE]
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.handle = self.kernel.CreateMutexW(None,False,'Local\\NikkiTown.Runtime.'+MANIFEST_SHA256)
        if not self.handle:
            raise ctypes.WinError(ctypes.get_last_error())
        result = self.kernel.WaitForSingleObject(self.handle,120000)
        if result not in (0,0x80):
            self.kernel.CloseHandle(self.handle)
            raise RuntimeError('另一份游戏正在准备运行文件，请稍后重试。')
        return self
    def __exit__(self,*_):
        self.kernel.ReleaseMutex(self.handle)
        self.kernel.CloseHandle(self.handle)

def prepare(source, cache):
    data = (source/'runtime-manifest.json').read_bytes()
    if hashlib.sha256(data).hexdigest() != MANIFEST_SHA256:
        raise ValueError('运行清单校验失败，请重新完整解压游戏包。')
    manifest = json.loads(data)
    entries = manifest['files']
    names = [x['path'] for x in entries]
    if not entries or len(set(x.casefold() for x in names)) != len(names) or manifest['executable'] not in names:
        raise ValueError('运行清单不完整。')
    for entry in entries:
        child(source,entry['path'])
        if entry['size'] < 0 or len(entry['sha256']) != 64:
            raise ValueError('运行清单条目无效。')
    cache.mkdir(parents=True,exist_ok=True)
    if cache.is_symlink() or cache.is_junction():
        raise ValueError('运行缓存不能是目录链接。')
    runtime = child(cache,MANIFEST_SHA256)
    with RuntimeLock():
        if not valid(runtime,entries):
            pending = extended(tempfile.mkdtemp(prefix=MANIFEST_SHA256+'.pending-',dir=cache))
            for entry in entries:
                src, dst = child(source,entry['path']), child(pending,entry['path'])
                dst.parent.mkdir(parents=True,exist_ok=True)
                # New file permissions come from the cache, never the source.
                with open(src,'rb') as reader, open(dst,'xb') as writer:
                    shutil.copyfileobj(reader,writer)
                if dst.stat().st_size != entry['size'] or digest(dst) != entry['sha256']:
                    raise ValueError('运行文件校验失败：'+entry['path'])
            if not valid(pending,entries):
                raise ValueError('运行文件不完整。')
            if runtime.exists():
                if runtime.is_symlink() or runtime.is_junction():
                    raise ValueError('运行缓存路径无效。')
                # Both targets are generated, validated children of our cache.
                # Keep damaged runtime files; never delete or move player data.
                runtime.rename(child(cache,MANIFEST_SHA256+'.invalid-'+uuid.uuid4().hex))
            pending.rename(runtime)
    return child(runtime,manifest['executable'])

def main():
    args = list(sys.argv[1:])
    option = '--launcher-cache-dir='
    cache_arg = next((x[len(option):] for x in args if x.startswith(option)),None)
    local = os.environ.get('LOCALAPPDATA') or str(Path.home()/'AppData/Local')
    cache = extended(cache_arg or Path(local)/'NikkiTown/Runtime')
    source = extended(sys.executable).parent
    executable = prepare(source,cache)
    if '--launcher-prepare-only' in args:
        return 0
    args = [x for x in args if not x.startswith(option)]
    # PyInstaller sets a DLL directory for its own Python runtime. Reset it for
    # the external Electron child so it loads its matching DLLs, not ours.
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.SetDllDirectoryW.argtypes = [wintypes.LPCWSTR]
    kernel.SetDllDirectoryW(None)
    # The same package name/main.js retain Electron userData and save keys.
    return subprocess.call([str(executable),*args],cwd=executable.parent)

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        if sys.stderr:
            print(str(error),file=sys.stderr)
        ctypes.windll.user32.MessageBoxW(None,'游戏启动失败：\n'+str(error),'暖暖的方块小镇',0x10)
        raise SystemExit(1)
