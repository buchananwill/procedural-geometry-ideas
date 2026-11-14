"""One-time migration: draft the arc registry and the id table for every extant journal entry.

    python journal_migrate.py <repo>/docs/notes --out <dir> [--date YYYY-MM-DD]

Reads docs/notes/ only. Writes <dir>/docs/notes/arc-registry.md, <dir>/docs/notes/journal-ids.csv and
<dir>/journal-id-exceptions.md, the list the user reviews before either file lands.

Canonical ids keep each entry's own number. The exceptions are the entries that cannot: a number repeated within an
arc (the first occurrence keeps it, later ones take the next free number) and block ids (N7-1), which take the next
free numbers of their kind.
"""

from __future__ import annotations

import argparse
import csv
import datetime
import re
import sys
from pathlib import Path

from journal_model import (
    ID_TABLE_NAME,
    NOTES_DIR,
    REGISTRY_NAME,
    Arc,
    Entry,
    RegistryRow,
    discover_arcs,
    format_registry_row,
    parse_registry,
)

REGISTRY_HEAD = """---
title: "Arc Code Registry"
type: technical-reference
area: meta
status: active
date: {date}
---

# Arc Code Registry

Every journal arc's project-wide code. An entry's id is `{{CODE}}.{{D|F|Q}}{{n}}`, for example `BSA.D247`; `BSA2.D247`
names the session as well. Rows are only ever added: a closed arc keeps its row, so its code is never reissued. A new
arc claims its code with `journal.py claim`, which merges the row into `main` before the arc's first journal opens.

| Code | Slug | Directory | Claimed | Status |
|---|---|---|---|---|
"""


def initials(slug: str) -> str:
    return "".join(word[0] for word in slug.split("-") if word).upper()[:5]


def assign_codes(slugs: list[str], registered: dict[str, str]) -> tuple[dict[str, str], list[str]]:
    """Registered slugs keep their codes; the rest take initials, lengthened past any code already taken."""
    codes: dict[str, str] = dict(registered)
    notes: list[str] = []
    for slug in sorted(s for s in slugs if s not in registered):
        code = initials(slug)
        if code in codes.values():
            words = slug.split("-")
            for extra in words[-1][1:]:
                candidate = (code + extra.upper())[:5]
                if candidate not in codes.values():
                    notes.append(f"{slug}: initials {code} taken by "
                                 f"{next(s for s, c in codes.items() if c == code)}; given {candidate}")
                    code = candidate
                    break
        codes[slug] = code
    return codes, notes


def front_matter_value(path: Path, key: str) -> str | None:
    for line in path.read_text(encoding="utf-8").splitlines()[:20]:
        if line.startswith(f"{key}:"):
            return line.split(":", 1)[1].strip().strip('"')
    return None


def canonical_ids(arc: Arc, code: str) -> tuple[list[tuple[str, Entry]], list[tuple[str, Entry, str]]]:
    """(id, entry) for every entry, and (id, entry, reason) for those whose id is not their own number."""
    entries = [e for e in arc.entries() if e.full_id is None]
    taken: set[tuple[str, int]] = set()
    pending: list[tuple[Entry, str]] = []
    result: list[tuple[str, Entry]] = []
    for entry in entries:
        key = (entry.kind, entry.number)
        if entry.is_block:
            pending.append((entry, "block id"))
        elif key in taken:
            pending.append((entry, "number repeated in the arc"))
        else:
            taken.add(key)
            result.append((f"{code}.{entry.kind}{entry.number}", entry))
    highest: dict[str, int] = {}
    for kind, number in taken:
        highest[kind] = max(highest.get(kind, 0), number)
    exceptions = []
    for entry, reason in pending:
        highest[entry.kind] = highest.get(entry.kind, 0) + 1
        canonical = f"{code}.{entry.kind}{highest[entry.kind]}"
        result.append((canonical, entry))
        exceptions.append((canonical, entry, reason))
    return result, exceptions


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("notes", help="the repo's docs/notes directory (read only)")
    parser.add_argument("--out", required=True, help="where to write the proposed files")
    parser.add_argument("--date", default=datetime.date.today().isoformat())
    args = parser.parse_args(argv)
    notes_root = Path(args.notes).resolve()
    out = Path(args.out)
    arcs = discover_arcs(notes_root)
    registry_path = notes_root / REGISTRY_NAME
    existing = parse_registry(registry_path.read_text(encoding="utf-8")) if registry_path.is_file() else []
    codes, collisions = assign_codes(list(arcs), {r.slug: r.code for r in existing})

    rows: list[RegistryRow] = [r for r in existing if r.slug not in arcs]  # claimed, no journals yet
    table: list[tuple[str, str, str, int]] = []
    renumbered: list[str] = []
    misfiled: list[str] = []
    dropped: list[str] = []
    ignored: list[str] = []
    for slug in sorted(arcs, key=lambda s: codes[s]):
        arc = arcs[slug]
        arc.code = codes[slug]
        dates = [d for p in arc.journals if (d := front_matter_value(p, "date"))] or [args.date]
        status = "closed" if front_matter_value(arc.head, "status") == "archived" else "active"
        directory = arc.head.parent.relative_to(notes_root).as_posix()
        kept = next((r for r in existing if r.slug == slug), None)
        rows.append(kept or RegistryRow(arc.code, slug, directory, min(dates) if dates else "", status))
        ids, exceptions = canonical_ids(arc, arc.code)
        for canonical, entry in ids:
            file = entry.journal.path.relative_to(notes_root).as_posix()
            table.append((canonical, file, entry.label, entry.occurrence))
            if entry.kind != entry.section_kind:
                misfiled.append(f"| {canonical} | {file}:{entry.start + 1} | `{entry.label}` | "
                                f"{entry.kind} in a {entry.section_kind} section |")
        for canonical, entry, reason in exceptions:
            file = entry.journal.path.relative_to(notes_root).as_posix()
            renumbered.append(f"| {canonical} | {file}:{entry.start + 1} | `{entry.label}` #{entry.occurrence} | "
                              f"{reason} |")
        for path, line, text in arc.context.dropped:
            dropped.append(f"| {path.relative_to(notes_root).as_posix()}:{line} | `{text[:70]}` |")
        for path, line, text in arc.context.ignored:
            ignored.append(f"| {path.relative_to(notes_root).as_posix()}:{line} | `{text[:70]}` |")

    meta = out / NOTES_DIR
    meta.mkdir(parents=True, exist_ok=True)
    registry = REGISTRY_HEAD.format(date=args.date) + "\n".join(format_registry_row(r) for r in rows) + "\n"
    (meta / REGISTRY_NAME).write_bytes(registry.encode("utf-8"))
    order = {"D": 0, "F": 1, "Q": 2}
    table.sort(key=lambda r: (r[0].split(".")[0], order[r[0].split(".")[1][0]], int(r[0].split(".")[1][1:])))
    with (meta / ID_TABLE_NAME).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["id", "file", "label", "occurrence"])
        writer.writerows(table)

    def block(title: str, intro: str, header: str, lines: list[str]) -> str:
        return f"## {title} ({len(lines)})\n\n{intro}\n\n{header}\n" + "\n".join(lines) + "\n\n"

    report = f"# Journal id migration: exceptions for review\n\nGenerated {args.date} from `{notes_root}`. "
    report += f"{len(table)} entries in {len(rows)} arcs; {len(table) - len(renumbered)} keep their own number.\n\n"
    report += block("Code collisions", "Initials that two arcs share, and the code given instead.", "",
                    [f"- {c}" for c in collisions] or ["- none"])
    report += block("Renumbered", "Each takes the next free number of its kind in its arc. Its legacy label stays "
                    "reachable by the located form, e.g. `BSA2.F54`.", "| New id | Where | Label | Why |\n|---|---|---|---|",
                    renumbered)
    report += block("Misfiled kinds", "Kind comes from the id prefix, not the section that holds the entry. These "
                    "keep their numbers.", "| Id | Where | Label | |\n|---|---|---|---|", misfiled)
    report += block("Dropped as nested-list items", "Numbered lines read as list items inside an entry, not entries: "
                    "below the session's declared start, or a number already taken that does not follow the entry "
                    "above.", "| Where | Line |\n|---|---|", dropped)
    report += block("Ignored id-like lines", "Bold lines opening with an id prefix outside the whitelist "
                    "('', C, F, CF, Q, block ids).", "| Where | Line |\n|---|---|", ignored)
    (out / "journal-id-exceptions.md").write_bytes(report.encode("utf-8"))

    print(f"{len(rows)} arcs, {len(table)} ids; renumbered {len(renumbered)}, misfiled {len(misfiled)}, "
          f"dropped {len(dropped)}, ignored {len(ignored)}, code collisions {len(collisions)}")
    for r in rows:
        print(f"  {r.code:<5} {r.slug} ({r.status})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
