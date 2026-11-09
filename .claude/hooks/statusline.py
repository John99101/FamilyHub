#!/usr/bin/env python3
"""Status line: model · folder (branch) · guard level · setup state.

Registered as "statusLine" in settings.json. Claude Code passes session info as JSON on stdin.
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cct_config  # noqa: E402


def main():
    try:
        info = json.load(sys.stdin)
    except ValueError:
        info = {}
    workspace = info.get("workspace") or {}
    cwd = workspace.get("current_dir") or info.get("cwd") or os.getcwd()
    proj = workspace.get("project_dir") or os.environ.get("CLAUDE_PROJECT_DIR") or cwd
    os.environ["CLAUDE_PROJECT_DIR"] = proj
    cfg = cct_config.load_config()

    parts = []
    model = (info.get("model") or {}).get("display_name")
    if model:
        parts.append(model)
    folder = os.path.basename(cwd.rstrip(os.sep)) or cwd
    try:
        branch = subprocess.run(["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
                                capture_output=True, text=True, timeout=2).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        branch = ""
    parts.append(f"{folder} ({branch})" if branch else folder)
    parts.append(f"guard {cfg.get('guard_level', 'standard')}")

    pending = (os.path.exists(os.path.join(proj, ".claude", "cct-pending"))
               or os.path.exists(os.path.join(cct_config.home_claude(), "cct-pending")))
    parts.append("setup pending: run /setup" if pending else "setup done")
    print(" · ".join(parts))


if __name__ == "__main__":
    main()
