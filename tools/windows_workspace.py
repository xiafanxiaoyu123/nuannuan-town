"""Keep generated Windows executables outside a low-integrity source tree.

ZIP does not carry NTFS mandatory labels. A workspace's inherited low label
can lower the EXE process token and prevent Chromium from starting its sandbox.
"""
from pathlib import Path
import tempfile
import os
import hashlib
import json
import subprocess
import re
import sys
import importlib.metadata
import shutil

def file_integrity_level(file):
    """Read the mandatory label only; do not request or change audit/ACL data."""
    if os.name != 'nt':
        return None
    import ctypes as c
    from ctypes import wintypes as w
    api = c.WinDLL('advapi32', use_last_error=True)
    kernel = c.WinDLL('kernel32', use_last_error=True)
    api.GetNamedSecurityInfoW.argtypes = [w.LPWSTR,w.DWORD,w.DWORD,c.c_void_p,c.c_void_p,c.c_void_p,c.POINTER(c.c_void_p),c.POINTER(c.c_void_p)]
    api.GetNamedSecurityInfoW.restype = w.DWORD
    api.GetAce.argtypes = [c.c_void_p,w.DWORD,c.POINTER(c.c_void_p)]
    kernel.LocalFree.argtypes = [c.c_void_p]
    acl, descriptor = c.c_void_p(), c.c_void_p()
    error = api.GetNamedSecurityInfoW(str(Path(file).resolve()),1,0x10,None,None,None,c.byref(acl),c.byref(descriptor))
    if error:
        raise OSError(error, 'Cannot read executable integrity label', str(file))
    try:
        if acl.value:
            for index in range(c.c_ushort.from_address(acl.value+4).value):
                ace = c.c_void_p()
                if not api.GetAce(acl,index,c.byref(ace)):
                    raise c.WinError(c.get_last_error())
                if c.c_ubyte.from_address(ace.value).value == 17:
                    sid = ace.value+8
                    count = c.c_ubyte.from_address(sid+1).value
                    return c.c_ulong.from_address(sid+8+4*(count-1)).value
        # Windows treats an unlabeled object as medium integrity.
        return 0x2000
    finally:
        if descriptor.value:
            kernel.LocalFree(descriptor)

def verify_windows_execution_label(file):
    level = file_integrity_level(file)
    if level is not None and level < 0x2000:
        raise RuntimeError('Windows EXE has a low-integrity label; this is a staging security-label problem, not a game path-length failure: '+str(file))
    return level

def create_windows_workspace():
    # Fresh per-build staging, retained for diagnosis. Never change the source
    # directory's security labels, system settings, or player data locations.
    return Path(tempfile.mkdtemp(prefix='nuannuan-windows-')).resolve()

def install_portable_launcher(root, folder, name):
    root, folder = Path(root).resolve(), Path(folder).resolve()
    entry, runtime = folder/(name+'.exe'), folder/'NikkiTown.runtime.exe'
    if not entry.is_file() or runtime.exists():
        raise RuntimeError('Expected fresh Electron output')
    verify_windows_execution_label(entry)
    entry.rename(runtime)
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    data = json.dumps({'executable':runtime.name,'files':[
        {'path':p.relative_to(folder).as_posix(),'size':p.stat().st_size,'sha256':digest(p)}
        for p in sorted(folder.rglob('*')) if p.is_file()
    ]},ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
    (folder/'runtime-manifest.json').write_bytes(data)
    manifest_hash = hashlib.sha256(data).hexdigest()
    if getattr(sys,'frozen',False):
        support = Path(sys.executable).parent/'工程辅助文件/windows'
        template = support/'portable-launcher-template.exe'
        if not template.is_file():
            raise RuntimeError('便携工具缺少启动器模板，请重新完整解压1.0.1或更新版本')
        shutil.copyfile(template, entry)
        # The frozen launcher reads this hash from its own executable overlay.
        # It retains the same manifest pinning and validated per-user runtime cache.
        with entry.open('ab') as stream:
            stream.write(b'\nNIKKI-MANIFEST-SHA256:'+manifest_hash.encode('ascii')+b'\n')
        shutil.copyfile(support/'launcher-LICENSES.txt',folder/'launcher-LICENSES.txt')
        verify_windows_execution_label(entry)
        return {'manifestSha256':manifest_hash,'launcherSha256':digest(entry),'runtimeSha256':digest(runtime)}
    distribution = importlib.metadata.distribution('pyinstaller')
    work = folder.parent/(folder.name+'-launcher-build')
    work.mkdir(exist_ok=False)
    source = work/'windows-launcher.py'
    source.write_text((root/'desktop/windows-launcher.py').read_text(encoding='utf-8').replace('__MANIFEST_SHA256__',manifest_hash),encoding='utf-8')
    version = json.loads((root/'desktop/package.json').read_text(encoding='utf-8-sig'))['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+',version): raise RuntimeError('Invalid desktop version')
    metadata = work/'version.txt'
    numbers = tuple(map(int,version.split('.')))+(0,)
    metadata.write_text('VSVersionInfo(ffi=FixedFileInfo(filevers='+repr(numbers)+', prodvers='+repr(numbers)+', mask=0x3f, flags=0, OS=0x40004, fileType=1, subtype=0, date=(0,0)), kids=[StringFileInfo([StringTable("040904B0", [StringStruct("FileVersion", '+repr(version)+'), StringStruct("ProductVersion", '+repr(version)+'), StringStruct("ProductName", "Nikki Block Town")])]), VarFileInfo([VarStruct("Translation", [1033,1200])])])',encoding='utf-8')
    env = {k:v for k,v in os.environ.items() if k.upper() in {'PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA','USERPROFILE','SYSTEMDRIVE'}}
    env['PYTHONUTF8']='1'
    subprocess.run([sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onefile','--noconsole',
                    '--manifest',str(root/'desktop/windows-launcher.manifest'),'--icon',str(root/'desktop/icon.ico'),
                    '--version-file',str(metadata),'--name',name,'--distpath',str(folder),'--workpath',str(work/'work'),
                    '--specpath',str(work),str(source)],check=True,env=env)
    licenses = ['Python: '+(Path(sys.base_prefix)/'LICENSE.txt').read_text(encoding='utf-8',errors='replace')]
    for file in distribution.files or []:
        if file.name in ('COPYING.txt','LICENSE'):
            licenses.append('PyInstaller: '+Path(distribution.locate_file(file)).read_text(encoding='utf-8',errors='replace'))
    (folder/'launcher-LICENSES.txt').write_text('\n\n'.join(licenses),encoding='utf-8')
    verify_windows_execution_label(entry)
    return {'manifestSha256':manifest_hash,'launcherSha256':digest(entry),'runtimeSha256':digest(runtime)}
