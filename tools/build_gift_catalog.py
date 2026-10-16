"""从游戏数据生成后台礼包目录；与新资源一起运行此脚本。"""
import os
from pathlib import Path
import subprocess
from build_runtime import find_esbuild, needs_shell

root = Path(__file__).resolve().parent.parent
out = root / 'output' / 'gift-catalog-build.cjs'
out.parent.mkdir(exist_ok=True)
esbuild = find_esbuild(root)
subprocess.run([esbuild, str(root / 'tools/gift-catalog-entry.js'), '--bundle', '--platform=node', '--format=cjs', f'--outfile={out}'], check=True, shell=needs_shell(esbuild))
result = subprocess.run(['node', str(out)], check=True, capture_output=True)
(root / 'server/gift-catalog.json').write_bytes(result.stdout)
print('Gift catalog generated')
