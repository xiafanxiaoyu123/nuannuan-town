"""Read-only project identification. Does not import project code or open databases."""
import argparse
import hashlib
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

MARKERS = ("index.html", "js/main.js", "js/core/state.js", "js/core/save-format.js",
           "server/auth-api.js", "site/admin/admin.js", "tools/build_dist.py")


def copy_like(root):
    parts = {part.lower() for part in Path(root).parts}
    return "output" in parts or any("review" in part for part in parts) or str(root).lower().startswith(r"c:\users\11393\documents\chatgpt\暖暖小镇".lower())


def inspect_root(root):
    root = Path(root).resolve()
    missing = [name for name in MARKERS if not (root / name).is_file()]
    versions, errors = {}, []
    for name in ("desktop/package.json", "apk/package.json", "site/releases.json"):
        try:
            metadata = json.loads((root / name).read_text(encoding="utf-8-sig"))
            if not isinstance(metadata, dict):
                raise ValueError("Version metadata must be an object")
            version = metadata.get("version")
            if not isinstance(version, str) or not version.strip():
                raise ValueError("Version must be a non-empty string")
            versions[name] = version
        except (OSError, ValueError) as exc:
            errors.append({"path": name, "error": type(exc).__name__})
    files = []
    for name in MARKERS:
        path = root / name
        if path.is_file():
            data = path.read_bytes()
            files.append({"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    warnings = []
    if not (root / ".git").exists():
        warnings.append("No Git metadata: save task-specific backups and hashes before edits.")
    if not (root / "package.json").exists():
        warnings.append("No root package.json: do not use root npm install/npm start.")
    if versions and len(set(versions.values())) != 1:
        warnings.append("Version metadata differs: investigate before packaging; do not auto-bump.")
    if copy_like(root):
        warnings.append("Path appears to be a review/output copy. Confirm whether this is the authorized target.")
    return {"checkedAt": datetime.now(timezone(timedelta(hours=8))).isoformat(),
            "root": str(root), "readOnly": True, "sourceMarkersPresent": not missing,
            "missing": missing, "versions": versions, "metadataErrors": errors, "copyLike": copy_like(root),
            "warnings": warnings, "sourceFingerprint": files,
            "evidenceScope": "Local metadata and selected source hashes only; no gameplay, package or production validation."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--allow-copy", action="store_true", help="Only for an explicitly selected isolated review copy, never to disguise it as the primary checkout")
    args = parser.parse_args()
    result = inspect_root(args.root)
    if result["copyLike"] and not args.allow_copy:
        result["targetError"] = "Review/output copy rejected by default. Use --allow-copy only when this copy is the explicitly selected task target."
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["sourceMarkersPresent"] and not result["metadataErrors"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
