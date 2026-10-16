"""Run reviewed local entries with an OS-only inherited environment. Not a sandbox."""
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import uuid
from datetime import datetime, timezone, timedelta

from preflight import MARKERS, copy_like

OS_KEYS = {"path", "systemroot", "windir", "temp", "tmp", "comspec", "pathext"}
QA_NAMES = {
    "admin_workbench_checks.js", "admin_console_checks.js", "admin_session_checks.js",
    "admin_service_settings_checks.js", "mail_system_checks.js",
    "backend_game_save_checks.cjs", "backend_contract_checks.cjs", "backend_security_checks.cjs", "backend_payment_checks.cjs",
    "momo_gameplay_checks.cjs", "fortune_save_checks.cjs",
    "mail_improvements_checks.js", "alipay_adapter_checks.js", "alipay_billing_checks.js",
    "audit_regression_checks.js", "save_transfer_checks.js", "house_save_checks.js",
    "daily_save_checks.cjs", "tutorial_save_checks.js", "festival_activity_rules_checks.js",
    "momo_cloak_model_checks.cjs", "local_play_isolation_checks.cjs",
    "cloud_sync_lifecycle_checks.js", "desktop_unlimited_fps_unit_checks.js",
    "daily_module_checks.cjs", "diagnostics_checks.cjs", "draw_diagnostics_checks.cjs",
    "dependency_refactor_checks.cjs", "town_module_checks.cjs", "decor_module_checks.cjs",
    "scene_performance_checks.cjs", "decor_fit_checks.cjs", "ui_presentation_checks.cjs",
    "decor_drag_checks.cjs", "town_static_props_checks.cjs",
    "ui3_interaction_logic_checks.cjs", "ui3_save_flags_checks.cjs",
}


def clean_environment(source):
    return {key: value for key, value in source.items() if key.lower() in OS_KEYS}


def contained(root, target):
    target = target.resolve()
    if not target.is_relative_to(root):
        raise ValueError("Resolved path is outside the selected project")
    return target


def plan(root, mode, suite, node, output, source_env):
    env = clean_environment(source_env)
    env.update({"HOST": "127.0.0.1", "API_HOST": "127.0.0.1"})
    if mode == "qa":
        normalized = (suite or "").replace("\\", "/")
        if normalized not in {"tools/qa/" + name for name in QA_NAMES}:
            raise ValueError("Suite is not in the reviewed allowlist. Read validation.md; do not bypass by adding an arbitrary script.")
        target = contained(root, root / normalized)
        env.update({"LIVE_QA_OUT": str(output), "SYNC_QA_OUT": str(output), "LOCAL_PLAY_QA_OUT": str(output), "TOWN_QA_OUT": str(output), "SCENE_QA_OUT": str(output)})
    elif mode == "workbench":
        if suite:
            raise ValueError("--suite applies only to --mode qa")
        target = contained(root, root / "tools/qa/admin_workbench_preview.cjs")
        env["WORKBENCH_PREVIEW_PORT"] = "57831"
    else:
        if suite:
            raise ValueError("--suite applies only to --mode qa")
        target = contained(root, root / "server.js")
        env.update({"PORT": "5173", "DATA_DIR": str(output), "AUTH_DB": str(output / "accounts.sqlite"),
                    "COOKIE_SECURE": "0", "PUBLIC_FREE_ENTITLEMENTS": "1", "TEST_AUTH_ENABLED": "0",
                    "PAYMENT_PROVIDER": "", "PAYMENT_CHECKOUT_ENABLED": "0", "PAYMENT_TEST_MODE": "0",
                    "APP_ORIGINS": "http://127.0.0.1:5173,http://localhost:5173",
                    "ADMIN_PUBLIC_ORIGIN": "http://127.0.0.1:5173"})
    if not target.is_file():
        raise ValueError("Entry is missing: " + str(target))
    return [node, str(target)], env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--mode", choices=("game", "workbench", "qa"), required=True)
    parser.add_argument("--suite")
    parser.add_argument("--dry-run", action="store_true", help="Show the local plan without launching or writing files")
    parser.add_argument("--allow-copy", action="store_true", help="Only when an isolated review/output copy is the explicitly selected task target")
    args = parser.parse_args()
    root = args.root.resolve()
    if copy_like(root) and not args.allow_copy:
        parser.error("Review/output copy rejected. Use --allow-copy only for an explicitly selected isolated task copy")
    if any(not (root / name).is_file() for name in MARKERS):
        parser.error("Source markers missing; run preflight.py first")
    # Resolve the executable, then invoke it with clean Node settings too.
    node = shutil.which("node")
    if not node:
        parser.error("Node.js 24+ is required")
    stamp = datetime.now(timezone(timedelta(hours=8))).strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    output = contained(root, root / "output" / ("ai-local-" + stamp))
    try:
        cmd, env = plan(root, args.mode, args.suite, node, output, os.environ)
        version = subprocess.check_output([node, "--version"], env=clean_environment(os.environ), text=True).strip()
        if int(version.lstrip("v").split(".")[0]) < 24:
            parser.error("Use Node.js 24+; detected " + version)
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        parser.error(str(exc))
    preview = root / "output/admin-workbench-local-preview"
    if args.mode == "workbench":
        contained(root, preview)
        contained(root, preview / "preview.sqlite")
        contained(root, preview / "preview-session.json")
    summary = {"mode": args.mode, "root": str(root), "node": version,
               "entry": str(Path(cmd[1]).relative_to(root)), "dryRun": args.dry_run,
               "output": str(preview if args.mode == "workbench" else output),
               "evidenceDir": str(output), "launchRecord": str(output / "launch.json"),
               "inheritedKeys": sorted(clean_environment(os.environ)),
               "credentialsInherited": False,
               "note": "Reviewed local entries only. Environment isolation is not an OS sandbox. Workbench preview reuses its synthetic fixture directory."}
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
    if args.dry_run:
        return 0
    if args.mode != "qa":
        port = 5173 if args.mode == "game" else 57831
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                parser.error(f"Port {port} is occupied; identify its owner, do not kill an unrelated process")
    output.mkdir(parents=True, exist_ok=False)
    (output / "launch.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Intentionally no arbitrary arguments, --observe, inherited AUTH_DB or NODE_OPTIONS.
    process = subprocess.Popen(cmd, cwd=root, env=env)
    try:
        code = process.wait()
    except KeyboardInterrupt:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        code = 130
    (output / "exit.json").write_text(json.dumps({"exitCode": code, "entry": summary["entry"],
        "evidenceScope": "Process status only; inspect suite assertions and reports before claiming acceptance."}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
