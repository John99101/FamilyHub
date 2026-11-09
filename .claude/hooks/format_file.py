#!/usr/bin/env python3
"""PostToolUse hook for Edit/Write: formats the edited file, then lints it and reports problems back to Claude.

Uses only tools already installed in the project or on PATH; never downloads anything.
Lint problems are sent to Claude (exit code 2) so it fixes them right away.
Turn off with cct.json "format_on_edit": false / "lint_on_edit": false.
"""
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cct_config import defer_to_project, load_config, project_dir, read_input  # noqa: E402

PRETTIER_EXT = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".css", ".scss",
                ".less", ".html", ".vue", ".svelte", ".yaml", ".yml", ".graphql"}
JS_EXT = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".vue", ".svelte"}
ESLINT_CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts",
                  ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml"]
MAX_LINES = 40


def find_up(start, rel):
    d = os.path.abspath(start)
    root = os.path.abspath(project_dir())
    while True:
        cand = os.path.join(d, rel)
        if os.path.exists(cand):
            return cand
        if d == root or os.path.dirname(d) == d:
            return None
        d = os.path.dirname(d)


EXTS = (".exe", ".cmd", ".bat", "") if os.name == "nt" else ("",)


def local_tool(start, folder, name):
    """A tool installed in the project, e.g. node_modules/.bin/prettier (prettier.cmd on Windows)."""
    for ext in EXTS:
        found = find_up(start, os.path.join(folder, name + ext))
        if found:
            return found
    return None


def tool(name, start):
    for folder in (os.path.join(".venv", "bin"), os.path.join(".venv", "Scripts"), os.path.join("node_modules", ".bin")):
        found = local_tool(start, folder, name)
        if found:
            return found
    return shutil.which(name)


def node_tool(start, name):
    return local_tool(start, os.path.join("node_modules", ".bin"), name)


def formatter_for(path):
    ext = os.path.splitext(path)[1].lower()
    here = os.path.dirname(path)
    if ext in PRETTIER_EXT:
        p = node_tool(here, "prettier")
        if p:
            return [p, "--write", "--log-level", "warn", path]
        b = node_tool(here, "biome")
        if b and ext in {".js", ".jsx", ".ts", ".tsx", ".json", ".css"}:
            return [b, "format", "--write", path]
    if ext == ".py":
        r = tool("ruff", here)
        if r:
            return [r, "format", "--quiet", path]
        b = tool("black", here)
        if b:
            return [b, "--quiet", path]
    if ext == ".go" and shutil.which("gofmt"):
        return ["gofmt", "-w", path]
    if ext == ".rs" and shutil.which("rustfmt"):
        return ["rustfmt", "--edition", "2021", path]
    if ext in {".sh", ".bash"} and shutil.which("shfmt"):
        return ["shfmt", "-w", path]
    return None


def linter_for(path):
    """Linter command for a file. Each linter exits 1 when it found problems."""
    ext = os.path.splitext(path)[1].lower()
    here = os.path.dirname(path)
    if ext in JS_EXT:
        e = node_tool(here, "eslint")
        if e and any(find_up(here, c) for c in ESLINT_CONFIGS):
            return [e, path]
        b = node_tool(here, "biome")
        if b:
            return [b, "lint", path]
    if ext == ".py":
        r = tool("ruff", here)
        if r:
            return [r, "check", "--quiet", path]
    if ext in {".sh", ".bash"} and shutil.which("shellcheck"):
        return ["shellcheck", "-f", "gcc", path]
    return None


def run(cmd, timeout=30):
    try:
        return subprocess.run(cmd, cwd=project_dir(), capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError):
        return None


def main():
    if defer_to_project(__file__):
        return
    cfg = load_config()
    path = (read_input().get("tool_input") or {}).get("file_path") or ""
    if not path or not os.path.isfile(path):
        return

    if cfg.get("format_on_edit", True):
        cmd = formatter_for(path)
        if cmd:
            run(cmd)

    if cfg.get("lint_on_edit", True):
        cmd = linter_for(path)
        result = run(cmd) if cmd else None
        if result is not None and result.returncode == 1:
            lines = (result.stdout + result.stderr).strip().splitlines()
            if lines:
                shown = lines[:MAX_LINES] + ([f"… {len(lines) - MAX_LINES} more lines"] if len(lines) > MAX_LINES else [])
                rel = os.path.relpath(path, project_dir())
                print(f"cct lint: {os.path.basename(cmd[0])} found problems in {rel}. Fix them before moving on:\n"
                      + "\n".join(shown), file=sys.stderr)
                sys.exit(2)


if __name__ == "__main__":
    main()
