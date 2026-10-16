#!/usr/bin/env python3
"""Build a hash manifest/package for the Android resource overlay.

The generated directory is a transport package, not an APK replacement. The
APK keeps its embedded dist as the baseline and AndroidOverlayManager only
activates a package after every listed file has passed size/hash checks.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
except ImportError:  # pragma: no cover - the release tool reports a useful error below
    hashes = serialization = ec = None

PRODUCT = "nikki-block-town-android"
SCHEMA = 1
DEFAULT_VERSION = "2.1"
SIGNATURE_ALGORITHM = "ECDSA-P256-SHA256"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_json(value: object) -> str:
    """Canonical manifest payload shared with Windows and Android.

    Object keys are sorted lexicographically, arrays retain their declared
    order, strings are UTF-8, and separators contain no whitespace. The
    top-level ``signature`` field is removed before signing.
    """
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sign_manifest(manifest: dict[str, object], private_key: Path, key_id: str) -> None:
    if ec is None or serialization is None or hashes is None:
        raise SystemExit("签名需要 cryptography：python -m pip install cryptography")
    try:
        key = serialization.load_pem_private_key(private_key.read_bytes(), password=None)
    except Exception as exc:
        raise SystemExit(f"cannot read ECDSA private key: {private_key}: {exc}")
    if not isinstance(key, ec.EllipticCurvePrivateKey) or key.curve.name != "secp256r1":
        raise SystemExit("private key must be an ECDSA P-256 PEM key")
    payload = canonical_json({k: v for k, v in manifest.items() if k != "signature"}).encode("utf-8")
    signature = key.sign(payload, ec.ECDSA(hashes.SHA256()))
    manifest["signature"] = {
        "algorithm": SIGNATURE_ALGORITHM,
        "keyId": key_id,
        "value": base64.b64encode(signature).decode("ascii"),
    }


def load_url_map(path: Path | None) -> dict[str, str] | None:
    if path is None:
        return None
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(value, dict) and "android" in value:
        value = value["android"]
    if not isinstance(value, dict):
        raise SystemExit("url-map must be a path-to-HTTPS-URL object (or contain android)")
    for relative, url in value.items():
        if not isinstance(relative, str) or not isinstance(url, str):
            raise SystemExit("url-map paths and URLs must be strings")
        try:
            parsed = urlsplit(url)
            parsed.port  # Validate malformed ports before signing the URL.
        except ValueError as exc:
            raise SystemExit(f"invalid URL mapping for {relative}: {exc}")
        if parsed.scheme != "https" or not parsed.hostname or parsed.username is not None or parsed.password is not None or "#" in url:
            raise SystemExit(f"URL mapping for {relative} requires absolute HTTPS without credentials/fragments")
    return value


def collect(source: Path, output: Path, base: Path | None = None, url_map: dict[str, str] | None = None) -> tuple[list[dict[str, object]], list[str]]:
    files: list[dict[str, object]] = []
    current_paths: set[str] = set()
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(source).as_posix()
        # The local test server is not part of the Android package.
        if relative == "_serve.js":
            continue
        current_paths.add(relative)
        previous = base / relative if base is not None else None
        if previous is not None and previous.is_file() and previous.stat().st_size == path.stat().st_size and sha256(previous) == sha256(path):
            continue
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        item: dict[str, object] = {"path": relative, "size": path.stat().st_size, "sha256": sha256(path)}
        if url_map is not None:
            if relative not in url_map:
                raise SystemExit(f"url-map missing resource: {relative}")
            item["url"] = url_map[relative]
        files.append(item)
    removed: list[str] = []
    if base is not None and base.is_dir():
        for path in sorted(base.rglob("*")):
            if path.is_file():
                relative = path.relative_to(base).as_posix()
                if relative != "_serve.js" and relative not in current_paths:
                    removed.append(relative)
    return files, removed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("dist"), help="built dist directory")
    parser.add_argument("--output", type=Path, default=Path("release/android-overlay"))
    parser.add_argument("--base-source", type=Path, default=None, help="上一版 dist；只打包变化文件并生成 remove")
    parser.add_argument("--version", default=DEFAULT_VERSION)
    parser.add_argument("--base-version", default=DEFAULT_VERSION)
    parser.add_argument("--full", action="store_true", help="完整资源快照；baseVersion=null，可供跳过多版的旧客户端回退使用")
    parser.add_argument("--url-map", type=Path, default=None, help="路径到官方 HTTPS 直链的 JSON；传入时每个打包文件均须有映射")
    parser.add_argument("--private-key", type=Path, default=None, help="ECDSA P-256 PEM；未提供时生成未签名清单（仅供本地构建）")
    parser.add_argument("--key-id", default="android-release-1", help="签名公钥标识")
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    if not source.is_dir():
        raise SystemExit(f"source directory not found: {source}")
    if args.full and args.base_source is not None:
        raise SystemExit("--full cannot be combined with --base-source")
    if source == output or source in output.parents or output in source.parents:
        raise SystemExit("source and output must not contain each other")
    if args.base_source and not args.base_source.resolve().is_dir():
        raise SystemExit(f"base directory not found: {args.base_source}")
    if args.base_source:
        base_path = args.base_source.resolve()
        if base_path == output or base_path in output.parents or output in base_path.parents:
            raise SystemExit("base source and output must not contain each other")
    for name, value in (("version", args.version), ("base-version", args.base_version)):
        if not value or len(value) > 96 or value in (".", "..") or any(not (char.isalnum() or char in ".-_") for char in value):
            raise SystemExit(f"invalid {name}")
    url_map = load_url_map(args.url_map.resolve() if args.url_map else None)
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix="android-overlay-", dir=str(output.parent)))
    try:
        base = args.base_source.resolve() if args.base_source else None
        files, removed = collect(source, staging, base, url_map)
        if not files and not removed:
            raise SystemExit("source contains no overlay files")
        manifest = {
            "schema": SCHEMA,
            "product": PRODUCT,
            "version": args.version,
            "baseVersion": None if args.full else args.base_version,
            "files": files,
            "remove": removed,
        }
        if args.private_key is not None:
            sign_manifest(manifest, args.private_key.resolve(), args.key_id)
        (staging / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if output.exists():
            shutil.rmtree(output)
        staging.replace(output)
        print(json.dumps({"status": "ok", "output": str(output), "version": args.version, "fileCount": len(files), "removedCount": len(removed), "bytes": sum(int(item["size"]) for item in files), "incremental": base is not None, "full": args.full, "externalUrls": url_map is not None}, ensure_ascii=False))
        return 0
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        raise


if __name__ == "__main__":
    raise SystemExit(main())
