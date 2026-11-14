"""Extract YAML front matter from all markdown files in docs/notes/ and output as JSON.

This module is the one shared front matter reader for the notes tooling, vendored from the Piste
Perfect project's Scripts/get_frontmatters.py. It needs PyYAML. It parses front matter
with ``yaml.safe_load`` so list-valued keys (``part_of``, ``depends_on``, ``record_of``) come back
as real lists, and it normalizes YAML dates to ISO strings so JSON output for existing flat fields
is unchanged for current consumers.
"""

import argparse
import datetime
import json
import sys
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
NOTES_DIR = PROJECT_ROOT / "docs" / "notes"


class FrontMatterError(Exception):
    """Raised when a file's front matter block exists but cannot be parsed as YAML."""

    def __init__(self, filepath: Path, reason: str):
        self.filepath = filepath
        self.reason = reason
        super().__init__(f"{filepath}: {reason}")


def _normalize_value(value):
    """Recursively convert YAML date/datetime values to ISO date strings."""
    if isinstance(value, datetime.datetime):
        return value.date().isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, list):
        return [_normalize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _normalize_value(item) for key, item in value.items()}
    return value


def _split_frontmatter_block(text: str) -> str | None:
    """Return the raw text between the opening and closing '---' fences, or None if absent."""
    if not text.startswith("---"):
        return None
    end = text.find("---", 3)
    if end == -1:
        return None
    return text[3:end]


def read_frontmatter(filepath: Path) -> dict | None:
    """Read and parse a markdown file's YAML front matter.

    Returns the parsed front matter as a dict, or None if the file has no front matter block
    at all (does not start with a '---' fence, or the fence is never closed).

    Raises FrontMatterError if a front matter block is present but is not valid YAML, or does
    not parse to a mapping.
    """
    try:
        text = filepath.read_text(encoding="utf-8").lstrip("\ufeff")
    except (OSError, UnicodeDecodeError) as exc:
        raise FrontMatterError(filepath, f"could not read file: {exc}") from exc

    block = _split_frontmatter_block(text)
    if block is None:
        return None

    try:
        data = yaml.safe_load(block)
    except yaml.YAMLError as exc:
        raise FrontMatterError(filepath, f"invalid YAML: {exc}") from exc

    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise FrontMatterError(filepath, "front matter did not parse to a mapping")

    return _normalize_value(data)


def extract_frontmatter(filepath: Path) -> dict | None:
    """Best-effort front matter extraction for the CLI: None for missing or unparseable YAML.

    This preserves the historical behavior of this script's CLI output (a JSON null for any
    file that doesn't yield usable front matter). Callers that need to distinguish "no front
    matter" from "malformed YAML" should call read_frontmatter() directly.
    """
    try:
        return read_frontmatter(filepath)
    except FrontMatterError:
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Extract YAML front matter from markdown files in docs/notes/."
    )
    parser.add_argument(
        "--subdir",
        default="",
        help="Sub-directory within docs/notes/ to search (e.g. 'debriefs')",
    )
    args = parser.parse_args()

    search_dir = NOTES_DIR / args.subdir
    if not search_dir.is_dir():
        print(f"Error: directory not found at {search_dir}", file=sys.stderr)
        sys.exit(1)

    results = {}
    for filepath in sorted(search_dir.rglob("*.md")):
        rel = str(filepath.relative_to(NOTES_DIR)).replace("\\", "/")
        fm = extract_frontmatter(filepath)
        results[rel] = fm

    json.dump(results, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
