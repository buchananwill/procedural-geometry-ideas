"""Render journal text in the house layout: entries numbered by the tool, markdown hard-wrapped at 120 columns.

The author writes plain markdown with one logical line per paragraph or bullet; pre-wrapped input is rejoined first,
so either works. Fenced code and table rows pass through untouched.
"""

from __future__ import annotations

import re

WIDTH = 120

LIST_ITEM = re.compile(r"^(?P<indent> *)(?P<marker>(?:[-*+]|\d+\.) )(?P<text>.*)$")
FENCE = re.compile(r"^\s*(```|~~~)")
# A wrapped continuation line must not open with a token markdown would read as a new block.
BLOCK_OPENER = re.compile(r"^(?:[-*+>]|\d+[.)]|#{1,6})$")
# A word, keeping any `code span` inside it whole even when the span holds spaces.
TOKEN = re.compile(r"(?:[^\s`]*`[^`]*`)+[^\s`]*|\S+")
MARKS = ("AMENDED", "SUPERSEDED", "WITHDRAWN", "STRUCK AND REVERSED", "REVERSED", "DISPROVED")


class FormatError(Exception):
    pass


def _greedy(words: list[str], first_prefix: str, rest_prefix: str, width: int) -> list[str]:
    lines: list[list[str]] = [[]]
    prefixes = [first_prefix]
    used = len(first_prefix)
    for word in words:
        line = lines[-1]
        need = len(word) + (1 if line else 0)
        if line and used + need > width:
            carried: list[str] = []
            if BLOCK_OPENER.match(word) and len(line) > 1:
                carried.append(line.pop())
            lines.append(carried + [word])
            prefixes.append(rest_prefix)
            used = len(rest_prefix) + len(" ".join(lines[-1]))
        else:
            line.append(word)
            used += need
    return [p + " ".join(ws) for p, ws in zip(prefixes, lines)]


def wrap_markdown(lines: list[str], width: int = WIDTH) -> list[str]:
    """Rejoin pre-wrapped paragraphs and bullets, then hard-wrap each with a hanging indent under its marker."""
    blocks: list[tuple[str, ...]] = []  # ('raw', line) | ('blank',) | ('para', first_prefix, hang, text)
    in_fence = False
    for raw in lines:
        line = raw.rstrip()
        if FENCE.match(line):
            in_fence = not in_fence
            blocks.append(("raw", line))
            continue
        if in_fence or line.lstrip().startswith(("|", "#", "<")):
            blocks.append(("raw", line))
            continue
        if not line.strip():
            blocks.append(("blank",))
            continue
        item = LIST_ITEM.match(line)
        if item:
            prefix = item["indent"] + item["marker"]
            blocks.append(("para", prefix, " " * len(prefix), item["text"].strip()))
            continue
        indent = len(line) - len(line.lstrip())
        prev = blocks[-1] if blocks else None
        if prev and prev[0] == "para" and indent >= len(prev[2]):
            blocks[-1] = ("para", prev[1], prev[2], prev[3] + " " + line.strip())
            continue
        lead = " " * indent
        blocks.append(("para", lead, lead, line.strip()))

    out: list[str] = []
    for block in blocks:
        if block[0] == "raw":
            out.append(block[1])
        elif block[0] == "blank":
            out.append("")
        else:
            _, first_prefix, hang, text = block
            out.extend(_greedy(TOKEN.findall(text), first_prefix, hang, width))
    return out


def body_lines(text: str) -> list[str]:
    """Split authored text into lines, dropping leading and trailing blank lines."""
    lines = text.replace("\r\n", "\n").split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines:
        raise FormatError("the entry is empty")
    return lines


def render_entry(entry_id: str, text: str, attribution: str | None = None, source: str | None = None) -> list[str]:
    """Number an authored entry and nest its body under it.

    The first line is the operative claim. If it opens with a bold span, the id goes inside that span; otherwise the
    whole first line is made bold. `attribution` (e.g. 'The user, 2026-11-07: ') opens the bold claim, and `source`
    (e.g. 'a read-only diagnosis delegate, 2026-11-07') follows it in parentheses.
    """
    lines = body_lines(text)
    first = lines[0].strip()
    lead = f"{entry_id}. {attribution or ''}"
    if first.startswith("**"):
        if first.find("**", 2) == -1:
            raise FormatError("the first line opens a bold span it never closes")
        first = "**" + lead + first[2:]
    elif "**" in first:
        raise FormatError("start the first line with the bold claim (**Claim.** rest), or use no bold at all")
    else:
        first = f"**{lead}{first}**"
    if source:
        close = first.find("**", 2) + 2
        first = f"{first[:close]} ({source}){first[close:]}"
    nested = ["- " + first] + [("  " + line) if line.strip() else "" for line in lines[1:]]
    return wrap_markdown(nested)


def render_amendment(mark: str, by_label: str | None, note: str) -> list[str]:
    """A sub-bullet such as '  - **AMENDED by decision 467:** item 3's spec is deferred.'"""
    if mark not in MARKS:
        raise FormatError(f"mark must be one of {', '.join(MARKS)}")
    head = mark + (f" by {by_label}" if by_label else "")
    note_lines = body_lines(note)
    nested = [f"  - **{head}:** {note_lines[0].strip()}"] + [
        ("    " + line) if line.strip() else "" for line in note_lines[1:]
    ]
    return wrap_markdown(nested)


def render_section_body(text: str) -> list[str]:
    return wrap_markdown(body_lines(text))
