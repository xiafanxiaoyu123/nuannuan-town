"""Resolve local build tools without assuming one developer's dependency path."""
import os
from pathlib import Path
import shutil


def find_esbuild(root):
    root = Path(root)
    explicit = os.environ.get('ESBUILD')
    suffix = 'esbuild.cmd' if os.name == 'nt' else 'esbuild'
    candidates = ([explicit] if explicit else []) + [
        root / 'node_modules/.bin' / suffix,
        root / 'desktop/node_modules/.bin' / suffix,
        root / 'apk/node_modules/.bin' / suffix,
        shutil.which('esbuild'),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
        if explicit and candidate == explicit:
            found = shutil.which(explicit)
            if found:
                return found
            raise RuntimeError('ESBUILD points to a missing executable: ' + explicit)
    raise RuntimeError('Install esbuild locally or set ESBUILD to its executable path')


def needs_shell(executable):
    return os.name == 'nt' and str(executable).lower().endswith(('.cmd', '.bat'))
