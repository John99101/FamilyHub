"""Shared helpers for the cct hooks: config loading, hook I/O, and device/project de-duplication."""
import json
import os
import sys

DEFAULTS = {
    "guard_level": "standard",      # off | standard | strict
    "format_on_edit": True,
    "lint_on_edit": True,
    "protect_lockfiles": True,
    "setup_reminder": True,
}


def project_dir():
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


def home_claude():
    return os.path.join(os.path.expanduser("~"), ".claude")


def _read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def load_config():
    """Defaults, then ~/.claude/cct.json, then <project>/.claude/cct.json."""
    cfg = dict(DEFAULTS)
    cfg.update(_read_json(os.path.join(home_claude(), "cct.json")))
    cfg.update(_read_json(os.path.join(project_dir(), ".claude", "cct.json")))
    return cfg


def _norm(path):
    """Absolute, case-normalised path (Windows paths are case-insensitive)."""
    return os.path.normcase(os.path.abspath(path))


def is_plugin_copy(script_path):
    """True when this script runs from the installed cct plugin."""
    root = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if not root:
        return False
    return _norm(script_path).startswith(_norm(root) + os.sep)


def is_device_copy(script_path):
    """True when this script is installed for all projects: device-wide in ~/.claude/hooks/, or as the plugin."""
    if is_plugin_copy(script_path):
        return True
    return _norm(os.path.dirname(script_path)).startswith(_norm(os.path.join(home_claude(), "hooks")) + os.sep)


def setup_command(script_path):
    """How the user invokes setup: plugin skills are namespaced."""
    return "/cct:setup" if is_plugin_copy(script_path) else "/setup"


def defer_to_project(script_path):
    """Keep each hook running once when the kit is installed in several places.

    Precedence: project copy, then device copy (~/.claude/hooks/cct/), then plugin copy.
    """
    if not is_device_copy(script_path):
        return False
    name = os.path.basename(script_path)
    me = _norm(script_path)
    candidates = [os.path.join(project_dir(), ".claude", "hooks", name)]
    if is_plugin_copy(script_path):
        candidates.append(os.path.join(home_claude(), "hooks", "cct", name))
    return any(os.path.exists(c) and _norm(c) != me for c in candidates)


def read_input():
    try:
        return json.load(sys.stdin)
    except ValueError:
        return {}


def decide(decision, reason):
    """Return a PreToolUse permission decision (allow | ask | deny) and exit."""
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)
