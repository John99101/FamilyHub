#!/usr/bin/env python3
"""SessionStart hook: tells Claude when this kit's setup is unfinished, so it can offer /setup.

Prints nothing when there is nothing to do. Turn off with cct.json "setup_reminder": false.
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cct_config import (defer_to_project, home_claude, is_device_copy, load_config,  # noqa: E402
                        project_dir, setup_command)

SOURCE_REPO = "claude-code-project-template"
PROJECT_SIGNS = [".git", "package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml",
                 "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json", "pubspec.yaml",
                 "Package.swift", "CMakeLists.txt", "Makefile", "deno.json"]


def is_template_source(proj):
    """Don't nag inside the template's own repo."""
    try:
        url = subprocess.run(["git", "-C", proj, "config", "--get", "remote.origin.url"],
                             capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return False
    return SOURCE_REPO in url


def refresh_plugin_statusline():
    """Plugins can't set a status line, so /cct:setup copies it into the plugin's data folder (which survives
    updates) and points settings.json there. Keep that copy current after each plugin update."""
    data = os.environ.get("CLAUDE_PLUGIN_DATA")
    target = os.path.join(data, "statusline") if data else None
    if not target or not os.path.isdir(target):
        return
    here = os.path.dirname(os.path.abspath(__file__))
    for name in ("statusline.py", "cct_config.py"):
        src, dst = os.path.join(here, name), os.path.join(target, name)
        try:
            with open(src, "rb") as f:
                new = f.read()
            old = None
            if os.path.exists(dst):
                with open(dst, "rb") as f:
                    old = f.read()
            if old != new:
                with open(dst, "wb") as f:
                    f.write(new)
        except OSError:
            pass


def main():
    refresh_plugin_statusline()
    if defer_to_project(__file__) or not load_config().get("setup_reminder", True):
        return
    proj = project_dir()
    if is_template_source(proj):
        return

    ask = "Don't start until the user agrees."
    setup = setup_command(__file__)
    if os.path.exists(os.path.join(proj, ".claude", "cct-pending")):
        print("[cct] The Claude Code project kit was installed here but setup isn't finished. "
              f"At the start of your first reply, tell the user in one sentence and offer to run {setup}. "
              f"{ask}")
    elif os.path.exists(os.path.join(home_claude(), "cct-pending")):
        print("[cct] The Claude Code kit was installed on this device but device setup isn't finished. "
              f"At the start of your first reply, tell the user in one sentence and offer to run {setup} "
              f"in device mode. {ask}")
    elif (is_device_copy(__file__)
          and proj != os.path.expanduser("~")
          and any(os.path.exists(os.path.join(proj, s)) for s in PROJECT_SIGNS)
          and not os.path.exists(os.path.join(proj, "CLAUDE.md"))
          and not os.path.exists(os.path.join(proj, ".claude", "CLAUDE.md"))
          and not os.path.exists(os.path.join(proj, ".claude", "cct-ignore"))):
        print("[cct] This project has no CLAUDE.md yet. Near the start of your first reply, offer once to run "
              f"{setup} to configure Claude Code for it. If the user declines, offer to create .claude/cct-ignore "
              f"so you don't ask again. {ask}")


if __name__ == "__main__":
    main()
