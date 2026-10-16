#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""官网网页版资源清单的公共读取工具。

build_single.py 负责生成资源和 manifest；发布工具只通过这里读取清单，
避免不同发布入口对网页版体积和校验码各算一套。
"""
import hashlib
import json
import os
from urllib.parse import urlsplit


SHELL_FILES = ('play.html', 'play.js', 'play-sw.js', 'play-manifest.json')


def read_manifest(site):
    path = os.path.join(site, 'play-manifest.json')
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding='utf-8') as f:
            value = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(value, dict) or value.get('schema') != 1:
        return None
    return value


def files_from_manifest(site, manifest):
    """返回 manifest 中应发布的网页版文件相对路径，去重且保持稳定顺序。"""
    names = list(SHELL_FILES)
    for item in manifest.get('resources', []):
        if isinstance(item, dict):
            # A CDN URL is delivery metadata, not a path inside the release.
            # Keep local bytes for release statistics and an offline fallback.
            rel = item.get('sourcePath') or item.get('url')
            if isinstance(rel, str):
                names.append(rel)
    out = []
    seen = set()
    for rel in names:
        rel = rel.replace('\\', '/')
        parts = urlsplit(rel)
        if parts.scheme or parts.netloc or rel.startswith('/') or '..' in rel.split('/') or parts.query or parts.fragment:
            raise ValueError('manifest release path must be local: ' + rel)
        if rel not in seen:
            seen.add(rel)
            out.append(rel)
    return out


def web_files(site):
    """返回当前应统计/发布的网页版文件；旧产物仍可被旧项目读取。"""
    manifest = read_manifest(site)
    if manifest is None:
        return [name for name in ('play.html', 'play.js')
                if os.path.isfile(os.path.join(site, name))]
    return [rel for rel in files_from_manifest(site, manifest)
            if os.path.isfile(os.path.join(site, rel.replace('/', os.sep)))]


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def web_stats(site):
    files = web_files(site)
    combo = hashlib.sha256()
    total = 0
    hashes = {}
    for rel in files:
        path = os.path.join(site, rel.replace('/', os.sep))
        digest = sha256_of(path)
        hashes[rel] = digest
        combo.update(digest.encode('ascii'))
        total += os.path.getsize(path)
    return {'files': files, 'size': total, 'sha256': combo.hexdigest(), 'hashes': hashes}
