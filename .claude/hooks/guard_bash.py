#!/usr/bin/env python3
"""PreToolUse hook for Bash and PowerShell: blocks destructive commands and asks before risky ones.

Looks inside nested commands too: `sh -c '…'`, `eval …`, `$(…)`, backticks, `powershell -Command "…"`, `cmd /c …`.
Knows Windows paths (C:\\, $env:USERPROFILE, /c/ in Git Bash) and PowerShell commands (Remove-Item, Format-Volume…).
Level comes from cct.json "guard_level": off | standard | strict.
This is a safety net, not a sandbox: it catches common accidents, not deliberate obfuscation.
"""
import os
import re
import shlex
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cct_config import decide, defer_to_project, load_config, read_input  # noqa: E402

ALLOW, ASK, DENY = "allow", "ask", "deny"
RANK = {ALLOW: 0, ASK: 1, DENY: 2}

DANGEROUS_TARGETS = {
    "/", "/*", "~", "~/", "~/*", "$HOME", "$HOME/", "$HOME/*", "*", ".", "./", "..",
    "/home", "/usr", "/etc", "/var", "/bin", "/boot", "/lib", "/opt", "/root", "/System", "/Users",
}
FIND_DANGEROUS = DANGEROUS_TARGETS - {".", "./", "..", "*"}
WINDOWS_DANGEROUS = {  # compared lower-case, without trailing slashes
    "\\", "\\*", "~", "~\\*", "$home", "$home\\*", "$env:userprofile", "$env:homedrive", "$env:systemroot",
    "$env:windir", "$env:programfiles", "%userprofile%", "%systemroot%", "%windir%", "*", ".",
    "c:\\users", "c:\\windows", "c:\\program files", "c:\\program files (x86)", "/c/users", "/c/windows",
}
DRIVE_ROOT = re.compile(r"^(?:[a-z]:[\\/]?|/[a-z]/?)\*?$", re.I)   # C:\  C:/  C:  /c/  (Git Bash)
PROTECTED_BRANCHES = {"main", "master"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh", "fish"}
POWERSHELLS = {"powershell", "powershell.exe", "pwsh", "pwsh.exe"}
CMD = {"cmd", "cmd.exe"}
PREFIXES = {"sudo", "command", "env", "nohup", "time", "nice", "exec", "xargs", "doas", "(", "{"}
OPERATORS = {";", "&&", "||", "|", "&", "|&", ";;"}
PS_DELETE = {"remove-item", "rm", "ri", "del", "erase", "rd", "rmdir"}

DENY_PATTERNS = [
    (r"\bmkfs(\.\w+)?\b", "Formats a filesystem."),
    (r"\bdd\b[^\n]*\bof=/dev/(sd|nvme|hd|disk|mmcblk)", "Writes directly to a disk device."),
    (r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:", "Fork bomb."),
    (r"\bchmod\s+(-\w+\s+)*-R\s+(-\w+\s+)*0?777\s+/(\s|$)", "Makes the whole system world-writable."),
    (r"\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b", "Pipes a download straight into a shell. Download it, read it, then run it."),
    (r"(?i)\b(iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget)\b[^|\n]*\|\s*(iex|invoke-expression)\b",
     "Pipes a download straight into PowerShell. Download it, read it, then run it."),
    (r"(?i)\b(format-volume|clear-disk|initialize-disk|remove-partition)\b|\bdiskpart\b|\bformat(\.com)?\s+[a-z]:",
     "Formats or wipes a disk."),
    (r"\bgit\s+push\b[^\n]*(\s--force\b|\s-f\b|\s--force-with-lease\b)[^\n]*\b(main|master)\b", "Force-push to main/master."),
    (r"\bgit\s+push\b[^\n]*\b(main|master)\b[^\n]*(\s--force\b|\s-f\b)", "Force-push to main/master."),
    (r"\bgit\s+push\b[^\n]*\s\+(main|master)\b", "Force-push to main/master."),
]

ASK_PATTERNS = [
    (r"\bgit\s+reset\s+--hard\b", "Discards uncommitted changes."),
    (r"\bgit\s+clean\s+-\w*f", "Deletes untracked files."),
    (r"\bgit\s+push\b[^\n]*(\s--force\b|\s-f\b|\s--force-with-lease\b)", "Force-push rewrites remote history."),
    (r"\bgit\s+branch\s+-D\b", "Deletes a branch even if unmerged."),
    (r"\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)", "Discards all unstaged changes."),
    (r"\bsudo\b", "Runs with administrator rights."),
    (r"(?i)\bstart-process\b[^\n]*-verb\s+runas\b", "Runs with administrator rights."),
    (r"(?i)\b(drop|truncate)\s+(table|database|schema)\b", "Destroys database data."),
    (r"\b(npm|pnpm|yarn)\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgem\s+push\b", "Publishes a package."),
    (r"\b(cat|less|more|head|tail|grep)\b[^\n]*(^|[\s/])\.env(\.(?!example|sample|template)\w+)?(\s|$)", "Reads a secrets file."),
    (r"(?i)\b(get-content|gc|type|select-string)\b[^\n]*(^|[\s\\/\"'])\.env(\.(?!example|sample|template)\w+)?([\s\"']|$)",
     "Reads a secrets file."),
    (r"(?i)\b(stop-computer|restart-computer|shutdown(\.exe)?\s+/[srp])\b", "Shuts down or restarts the computer."),
    (r"(?i)\bset-executionpolicy\b", "Changes the PowerShell execution policy."),
    (r"(?i)\breg(\.exe)?\s+delete\b|\bremove-item(property)?\b[^\n]*\bhk(lm|cu|cr|u|cc):", "Deletes registry entries."),
]

STRICT_PATTERNS = [
    (r"\bgit\s+push\b", "Pushes to a remote."),
    (r"\b(npm|pnpm|yarn|bun)\s+(add|install|i)\s+[^-\s]", "Adds a dependency."),
    (r"\b(pip|pip3|uv\s+pip)\s+install\b|\buv\s+add\b|\bpoetry\s+add\b", "Adds a dependency."),
    (r"\bcargo\s+add\b|\bgo\s+get\b|\bgem\s+install\b|\bcomposer\s+require\b|\bwinget\s+install\b|\bchoco\s+install\b",
     "Adds a dependency."),
    (r"(?i)(^|[\s;&|(])(rm|remove-item|ri|del|erase|rd|rmdir)\s", "Deletes files."),
]


def worst(a, b):
    return a if RANK[a[0]] >= RANK[b[0]] else b


def is_dangerous(target, bash=True):
    t = target.strip().strip("'\"")
    if bash and (t in DANGEROUS_TARGETS or t.rstrip("/") in DANGEROUS_TARGETS):
        return True
    low = t.lower().rstrip("\\/") or t.lower()
    return bool(DRIVE_ROOT.match(t)) or low in WINDOWS_DANGEROUS or t.lower() in WINDOWS_DANGEROUS


# ---- Bash ------------------------------------------------------------------------------------------------
def segments(cmd):
    """Split a command line into simple commands (token lists), respecting quotes."""
    out = []
    for line in cmd.splitlines():
        try:
            lex = shlex.shlex(line, posix=True, punctuation_chars=";&|()")
            lex.whitespace_split = True
            tokens = list(lex)
        except ValueError:  # unbalanced quotes: fall back to a rough split
            tokens = [t for t in re.split(r"\s+", line.strip()) if t]
        current = []
        for t in tokens:
            if t in OPERATORS or t == ")":
                if current:
                    out.append(current)
                current = []
            else:
                current.append(t)
        if current:
            out.append(current)
    return out


def strip_prefixes(toks):
    while toks and (toks[0] in PREFIXES or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", toks[0])):
        toks = toks[1:]
    return toks


def check_rm(args):
    short = "".join(a[1:] for a in args if a.startswith("-") and not a.startswith("--"))
    recursive = "r" in short or "R" in short or "--recursive" in args
    targets = [a for a in args if not a.startswith("-")]
    if "--no-preserve-root" in args:
        return DENY, "Blocked by cct guard: rm --no-preserve-root."
    if recursive and any(is_dangerous(t) for t in targets):
        return DENY, "Blocked by cct guard: recursive delete of a root, home or wildcard path."
    if recursive:
        return ASK, "cct guard: recursive delete. Confirm to continue."
    return ALLOW, ""


def check_find(args):
    deletes = "-delete" in args or any(
        a in ("-exec", "-execdir", "-ok") and i + 1 < len(args) and os.path.basename(args[i + 1]) == "rm"
        for i, a in enumerate(args))
    if not deletes:
        return ALLOW, ""
    roots = []
    for a in args:
        if a.startswith("-") or a in ("(", "!"):
            break
        roots.append(a)
    # Unlike `rm -rf .`, `find . -delete` is a normal scoped cleanup, so only roots and home count here.
    if any(r.rstrip("/") in FIND_DANGEROUS or r in FIND_DANGEROUS or DRIVE_ROOT.match(r) for r in roots):
        return DENY, "Blocked by cct guard: find deleting from a root or home path."
    return ASK, "cct guard: find will delete files. Confirm to continue."


def check_git_push(args):
    if "push" not in args:
        return ALLOW, ""
    rest = args[args.index("push") + 1:]
    deleting = "--delete" in rest or "-d" in rest
    refs = [r for r in rest if not r.startswith("-")]
    deleted = [r.lstrip(":") for r in refs if r.startswith(":")] + (refs[1:] if deleting else [])
    if not deleted:
        return ALLOW, ""
    if any(r.replace("refs/heads/", "") in PROTECTED_BRANCHES for r in deleted):
        return DENY, "Blocked by cct guard: deletes the remote main/master branch."
    return ASK, "cct guard: deletes a remote branch. Confirm to continue."


def check_segment(toks):
    toks = strip_prefixes(toks)
    if not toks:
        return ALLOW, ""
    name, args = os.path.basename(toks[0]), toks[1:]
    if name == "rm":
        return check_rm(args)
    if name == "find":
        return check_find(args)
    if name == "git":
        return check_git_push(args)
    return ALLOW, ""


# ---- PowerShell / cmd ------------------------------------------------------------------------------------
def ps_segments(cmd):
    """Split a PowerShell or cmd line into token lists. Rough, but quote-aware enough for these checks."""
    out = []
    for part in re.split(r"\s*(?:;|&&|\|\||\||\r?\n)\s*", cmd):
        # Strip quotes, including stray ones left when a nested command was cut out of a Bash string.
        toks = [t.strip("'\"") for t in re.findall(r'"[^"]*"|\'[^\']*\'|\S+', part)]
        toks = [t for t in toks if t]
        if toks:
            out.append(toks)
    return out


def is_recurse_flag(flag):
    name = flag.split(":")[0]
    return (len(name) >= 2 and "-recurse".startswith(name)) or name in ("/s", "-rf", "-fr")


def check_ps_segment(toks):
    while toks and toks[0] in ("&", "."):
        toks = toks[1:]
    if not toks:
        return ALLOW, ""
    name = toks[0].lower()
    if name == "git":
        return check_git_push(toks[1:])
    if name not in PS_DELETE:
        return ALLOW, ""
    flags, targets = [], []
    for a in toks[1:]:
        if a.startswith("-") or re.match(r"^/[a-z]$", a, re.I):
            flags.append(a.lower())
        else:
            targets.append(a)
    recursive = any(is_recurse_flag(f) for f in flags if f not in ("-path", "-literalpath"))
    if recursive and any(is_dangerous(t, bash=False) for t in targets):
        return DENY, "Blocked by cct guard: recursive delete of a drive, system or home folder."
    if recursive:
        return ASK, "cct guard: recursive delete. Confirm to continue."
    return ALLOW, ""


# ---- both ------------------------------------------------------------------------------------------------
def nested(cmd, kind):
    """(command, kind) pairs hidden inside this one."""
    seg_list = [strip_prefixes(t) for t in segments(cmd)] if kind == "bash" else ps_segments(cmd)
    for toks in seg_list:
        if not toks:
            continue
        name = os.path.basename(toks[0]).lower()
        rest = toks[1:]
        if name in SHELLS:
            for i, t in enumerate(rest[:-1]):
                if re.match(r"^-[a-zA-Z]*c[a-zA-Z]*$", t):
                    yield rest[i + 1], "bash"
                    break
        elif name in POWERSHELLS:
            for i, t in enumerate(rest[:-1]):
                if t.lower() in ("-c", "-command", "-com"):
                    yield " ".join(rest[i + 1:]), "ps"
                    break
        elif name in CMD:
            for i, t in enumerate(rest[:-1]):
                if t.lower() in ("/c", "/k"):
                    yield " ".join(rest[i + 1:]), "ps"
                    break
        elif name in ("eval", "invoke-expression", "iex"):
            yield " ".join(rest), kind
    for m in re.finditer(r"\$\(([^()]*)\)|`([^`]*)`", cmd):
        if kind == "bash":
            yield m.group(1) or m.group(2) or "", "bash"
        elif m.group(1):
            yield m.group(1), "ps"


def evaluate(cmd, level, kind="bash", depth=0):
    result = (ALLOW, "")
    for pattern, reason in DENY_PATTERNS:
        if re.search(pattern, cmd):
            return DENY, f"Blocked by cct guard: {reason}"
    for toks in (segments(cmd) if kind == "bash" else ps_segments(cmd)):
        result = worst(result, check_segment(toks) if kind == "bash" else check_ps_segment(toks))
    for pattern, reason in ASK_PATTERNS:
        if re.search(pattern, cmd):
            result = worst(result, (ASK, f"cct guard: {reason} Confirm to continue."))
    if level == "strict":
        for pattern, reason in STRICT_PATTERNS:
            if re.search(pattern, cmd):
                result = worst(result, (ASK, f"cct guard (strict): {reason} Confirm to continue."))
    if depth < 3:
        for inner, inner_kind in nested(cmd, kind):
            inner = inner.strip()
            if len(inner) > 1 and inner[0] in "'\"" and inner[-1] == inner[0]:
                inner = inner[1:-1]
            inner = inner.strip("'\"")  # a stray quote left by a rough split
            if inner.strip():
                result = worst(result, evaluate(inner, level, inner_kind, depth + 1))
    return result


def main():
    if defer_to_project(__file__):
        return
    level = str(load_config().get("guard_level", "standard")).lower()
    if level == "off":
        return
    data = read_input()
    cmd = (data.get("tool_input") or {}).get("command") or ""
    if not cmd:
        return
    kind = "ps" if data.get("tool_name") == "PowerShell" else "bash"
    decision, reason = evaluate(cmd, level, kind)
    if decision != ALLOW:
        decide(decision, reason)


if __name__ == "__main__":
    main()
