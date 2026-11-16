#!/usr/bin/env python3
"""Claude Code PostToolUse hook: validate docs/notes/ whenever an agent edits a note.

Fires only when tool_name is Write or Edit and tool_input.file_path is a .md file under this
repo's docs/notes/ folder (see docs/notes/_schema.md, "Enforcement and Reports"). It then runs
scripts/notes_schema.py's check over the *whole* corpus -- not just the edited file -- because
deleting or re-typing one document can break edges declared in another. On any error it exits 2
and writes the errors to stderr, so Claude Code hands them back to the agent that made the edit.
It is a no-op for every other tool or file.

Vendored from the Piste Perfect project. Registered in .claude/settings.json.
"""

import json
import sys
from pathlib import Path

# .claude/hooks/check-notes-schema.py -> repo root is two levels up from .claude/hooks/.
REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"
NOTES_ROOT = REPO_ROOT / "docs" / "notes"
SOURCE_ROOT = REPO_ROOT


def _is_markdown_under_notes(file_path_str: str) -> bool:
    """Robustly decide whether file_path_str names a .md file under REPO_ROOT/docs/notes.

    Resolves relative paths against REPO_ROOT, and compares path components
    case-insensitively so this holds on case-insensitive Windows checkouts regardless of
    slash direction or the casing the tool call happened to use.
    """
    if not file_path_str:
        return False

    candidate = Path(file_path_str)
    if not candidate.is_absolute():
        candidate = REPO_ROOT / candidate
    try:
        candidate = candidate.resolve()
    except OSError:
        return False

    if candidate.suffix.lower() != ".md":
        return False

    try:
        notes_resolved = NOTES_ROOT.resolve()
    except OSError:
        return False

    cand_parts = candidate.parts
    notes_parts = notes_resolved.parts
    if len(cand_parts) <= len(notes_parts):
        # Must be strictly *under* docs/notes/, not the folder itself.
        return False
    return all(a.lower() == b.lower() for a, b in zip(cand_parts[: len(notes_parts)], notes_parts))


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return 0

    if payload.get("tool_name") not in ("Write", "Edit"):
        return 0

    tool_input = payload.get("tool_input") or {}
    file_path = tool_input.get("file_path", "")
    if not _is_markdown_under_notes(file_path):
        return 0

    sys.path.insert(0, str(SCRIPTS_DIR))
    try:
        import notes_schema
    except ImportError as exc:
        # Fail open: a broken import shouldn't block the agent's edit.
        print(f"check-notes-schema hook: could not import notes_schema.py: {exc}", file=sys.stderr)
        return 0

    findings = notes_schema.run_check(NOTES_ROOT, SOURCE_ROOT)
    errors = [f for f in findings if f.severity == "error"]
    if not errors:
        return 0

    for finding in sorted(findings, key=lambda f: (f.file_id, f.severity, f.rule)):
        prefix = "ERROR" if finding.severity == "error" else "WARNING"
        print(f"{prefix}: {finding.format()}", file=sys.stderr)
    print(f"\n{len(errors)} error(s) found against docs/notes/_schema.md.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
