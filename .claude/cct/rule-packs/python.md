---
paths:
  - "**/*.py"
  - "**/pyproject.toml"
---

# Python

<!-- cct rule pack: /setup copies this into .claude/rules/, fills the specifics and narrows the paths. -->

## Project specifics
- Version: {{PYTHON_VERSION}} · package manager: {{PY_PACKAGE_MANAGER}} (run tools through it, e.g. `uv run pytest`)
- Formatter/linter: {{PY_TOOLS}} · type checker: {{PY_TYPECHECKER}}

## Always
- Type-hint all public functions and methods. Prefer `X | None` over `Optional[X]` on 3.10+.
- Use `pathlib.Path` for paths, f-strings for formatting, `logging` instead of `print` in library code.
- Catch specific exceptions; never use bare `except:`. Re-raise with `raise … from err` to keep the cause.
- No mutable default arguments (`def f(x=[])`). Use `None` and create the value inside.
- Use `dataclasses` or the project's model library (pydantic, attrs) for structured data, not loose dicts.
- Close resources with `with`. Never leave files, sockets or DB sessions open.
- Imports: standard library, third-party, local, in that order, with absolute imports inside the package.
- Tests use pytest style: plain `assert`, fixtures over setup methods, `tmp_path` for files, `monkeypatch` for env vars.
- Add dependencies through the package manager (`uv add`, `poetry add`), never by editing lockfiles by hand.
