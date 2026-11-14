"""Read and write arc journals by id, without loading them whole.

Reading:
    journal.py brief                          head, next ids, preamble, reading order, sections 2, 4 and 5
    journal.py show BSA.D247 RSA.F59 251      entries by id, from any arc (a bare id means the current arc)
    journal.py section state [-s 2]           one section (alias, number, or heading text)
    journal.py index [--since 250] [--marked] one line per entry: id, session, markers, claim
    journal.py find "Cheek" [--all-arcs]
    journal.py refs BSA.D247                  every citation: full ids in docs/notes, skills and git log; legacy forms
    journal.py verify [--all-arcs]            stale head claims, numbering gaps, duplicates, registry coverage

Writing (text on stdin, or --text, or --file; @D247 and @RSA.D139 expand to full ids):
    journal.py decision [--user]              append the next decision to the head
    journal.py finding [--source "..."]       append the next finding to the head
    journal.py amend BSA.D257 AMENDED --by @D260
    journal.py set state | append open        replace a section's body | add to a section ('#. ' numbers it)
    journal.py lift BSA.D250 --to docs/notes/building-shell-ledger.md
    journal.py open --reason "a compaction"   close the head and open the next session's journal
    journal.py open --new <slug> --title "<Arc name>" --area <area> [--record-of <doc>]
    journal.py claim <slug> <CODE>            claim an arc code on main, then merge main into this branch

Arc selection: --arc <slug or code>, else the pointer `open` and `use` write, else an error listing the arcs.

Vendored from the Piste Perfect project's Scripts/journal.py and adapted to this repo: notes live flat in docs/notes/
with the registry beside them. Front matter follows docs/notes/_schema.md, checked by scripts/notes_schema.py.
"""

from __future__ import annotations

import argparse
import datetime
import os
import re
import subprocess
import sys
from pathlib import Path

from journal_format import FormatError, MARKS, render_amendment, render_entry, render_section_body, wrap_markdown
from journal_model import (
    LIST_ITEM_NUMBER,
    NOTES_DIR,
    REGISTRY_NAME,
    Arc,
    Corpus,
    Entry,
    Journal,
    JournalError,
    RegistryRow,
    find_repo_root,
    format_registry_row,
    parse_registry,
)

POINTER = Path(".claude") / "journal-arc.txt"  # per worktree, git-ignored
REGISTRY = NOTES_DIR / REGISTRY_NAME
NOTES = NOTES_DIR.as_posix()
CLAIM_WIDTH = 140
SHORTHAND = re.compile(r"@(?:(?P<code>[A-Z]{2,5})(?P<sess>\d+)?\.)?(?P<kind>[DFQ])(?P<num>\d+)\b")


# -- plumbing -----------------------------------------------------------------------------------------------------


class Session:
    """What every command needs: the corpus, the repo root, today's date, and the arc the call names."""

    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.repo_root = Path(args.root) if args.root else find_repo_root(Path.cwd())
        self.notes_root = self.repo_root / NOTES_DIR
        self.corpus = Corpus.load(self.notes_root, Path(args.meta) if args.meta else None)
        self.date = args.date or datetime.date.today().isoformat()

    def rel(self, path: Path) -> str:
        return path.relative_to(self.repo_root).as_posix()

    def arc(self, required: bool = True) -> Arc | None:
        name = self.args.arc
        pointer = self.repo_root / POINTER
        if not name and pointer.is_file():
            name = pointer.read_text(encoding="utf-8").strip()
        if not name:
            if not required:
                return None
            arcs = sorted(self.corpus.arcs.values(), key=lambda a: a.head.stat().st_mtime, reverse=True)[:5]
            raise JournalError(f"no arc named; pass --arc or run `journal.py use <slug>`. Recent: "
                               f"{', '.join(a.slug for a in arcs)}")
        if name in self.corpus.arcs:
            return self.corpus.arcs[name]
        return self.corpus.arc_by_code(name)

    def write_pointer(self, slug: str) -> None:
        pointer = self.repo_root / POINTER
        pointer.parent.mkdir(parents=True, exist_ok=True)
        pointer.write_text(slug + "\n", encoding="utf-8")

    def text(self) -> str:
        args = self.args
        if getattr(args, "text", None) is not None:
            raw = args.text
        elif getattr(args, "file", None):
            raw = Path(args.file).read_text(encoding="utf-8-sig")
        elif sys.stdin is None or sys.stdin.isatty():
            raise JournalError("pass the text on stdin (a heredoc), with --text, or with --file")
        else:
            raw = sys.stdin.buffer.read().decode("utf-8-sig")
        return self.expand(raw)

    def expand(self, text: str) -> str:
        """@D247 -> BSA.D247 (the current arc), @RSA.D139 -> RSA.D139; an unregistered code is refused."""
        codes = {row.code for row in self.corpus.registry}

        def replace(m: re.Match) -> str:
            code = m["code"]
            if code is None:
                arc = self.arc()
                if arc.code is None:
                    raise JournalError(f"arc {arc.slug} has no registered code, so {m.group(0)} cannot expand")
                code = arc.code
            elif code not in codes:
                raise JournalError(f"{m.group(0)}: no arc is registered as {code}")
            return f"{code}{m['sess'] or ''}.{m['kind']}{m['num']}"

        return SHORTHAND.sub(replace, text)


def claim_line(s: Session, arc: Arc, entry: Entry, full: bool) -> str:
    claim = entry.claim()
    if not full and len(claim) > CLAIM_WIDTH:
        claim = claim[: CLAIM_WIDTH - 1].rstrip() + "…"
    marks = entry.markers()
    tag = f" [{'; '.join(marks)}]" if marks else ""
    return f"{s.corpus.canonical_id(entry, arc):>10}  s{entry.journal.session:<3}{tag} {claim}"


def insert_at_section_end(journal: Journal, start: int, end: int, new_lines: list[str], blank_before: bool) -> int:
    """Insert before the section's trailing blank lines; return the first inserted line's index."""
    k = end
    while k > start + 1 and not journal.lines[k - 1].strip():
        k -= 1
    lead = [""] if (k == start + 1 or blank_before) else []
    tail = [""] if end < len(journal.lines) else []
    journal.lines[k:end] = lead + new_lines + tail
    journal.invalidate()
    return k + len(lead)


def report_write(s: Session, what: str, path: Path, first_index: int, count: int) -> None:
    print(f"{what} -> {s.rel(path)}:{first_index + 1}-{first_index + count}")


# -- reading ------------------------------------------------------------------------------------------------------


def cmd_brief(s: Session) -> int:
    arc = s.arc()
    journals = arc.load_all()
    head = journals[-1]
    nums = s.corpus.numbering(arc)
    code = arc.code or "?"
    print(f"arc {arc.slug} ({code}): head is session {head.session}, {s.rel(head.path)}")
    print(f"next ids: {code}.D{nums.next_decision}, {code}.F{nums.next_finding}")
    start, end = head.preamble_range()
    print("\n".join(head.lines[start:end]).rstrip())
    for name in ["reading", *s.args.sections.split(",")]:
        section = head.section(name.strip())
        print()
        print("\n".join(head.lines[section.start : section.end]).rstrip())
    return 0


def cmd_show(s: Session) -> int:
    default = s.arc(required=False)
    missing = 0
    for token in s.args.ids:
        try:
            found = s.corpus.resolve(token, default)
        except JournalError as exc:
            print(f"{token}: {exc}")
            missing += 1
            continue
        if isinstance(found[0], Path):
            path, index = found
            lines = path.read_text(encoding="utf-8").splitlines()
            end = index + 1
            while end < len(lines) and (lines[end].startswith((" ", "\t")) or not lines[end].strip()):
                end += 1
            while end > index + 1 and not lines[end - 1].strip():
                end -= 1
            print(f"== {token} (lifted: {s.rel(path)}:{index + 1}) ==")
            print("\n".join(lines[index:end]))
            continue
        arc, entry = found
        canonical = s.corpus.canonical_id(entry, arc)
        print(f"== {s.corpus.located_id(entry, arc)} = {canonical} ({entry.journal.path.name}:{entry.start + 1}) ==")
        print("\n".join(entry.lines))
    return 1 if missing else 0


def cmd_section(s: Session) -> int:
    journal = s.arc().load_session(s.args.session)
    section = journal.section(s.args.name)
    print(f"== session {journal.session} ({journal.path.name}:{section.start + 1}) ==")
    print("\n".join(journal.lines[section.start : section.end]).rstrip())
    return 0


def cmd_index(s: Session) -> int:
    arc = s.arc()
    journals = arc.load_all()
    if s.args.session is not None:
        shown = [j for j in journals if j.session == s.args.session]
    elif s.args.all or s.args.since:
        shown = journals
    else:
        shown = journals[-1:]
    since = s.corpus.normalise(s.args.since, arc) if s.args.since else None
    for journal in shown:
        for entry in sorted(journal.entries(), key=lambda e: (e.kind, e.number)):
            if s.args.kind and entry.kind != s.args.kind:
                continue
            if since and (entry.kind != since[3] or entry.number < since[4]):
                continue
            if s.args.marked and not entry.markers():
                continue
            print(claim_line(s, arc, entry, s.args.full))
    return 0


def cmd_find(s: Session) -> int:
    arcs = list(s.corpus.arcs.values()) if s.args.all_arcs else [s.arc()]
    flags = 0 if s.args.case else re.IGNORECASE
    pattern = re.compile(s.args.pattern if s.args.regex else re.escape(s.args.pattern), flags)
    hits = 0
    for arc in arcs:
        journals = arc.load_all()
        if s.args.session is not None:
            journals = [j for j in journals if j.session == s.args.session]
        for journal in reversed(journals):
            covered: set[int] = set()
            for entry in journal.entries():
                covered.update(range(entry.start, entry.end))
                text = " ".join(line.strip() for line in entry.lines)
                if not (m := pattern.search(text)):
                    continue
                lo, hi = max(0, m.start() - 60), min(len(text), m.end() + 60)
                print(claim_line(s, arc, entry, False))
                print(f"            …{text[lo:hi]}…")
                hits += 1
                if hits >= s.args.limit:
                    return 0
            for section in journal.sections():
                if section.kind is not None:
                    continue
                for i in range(section.start, section.end):
                    if i not in covered and pattern.search(journal.lines[i]):
                        line = journal.lines[i].strip()[:CLAIM_WIDTH]
                        print(f"  {arc.code or arc.slug}{journal.session} '{section.title}' :{i + 1}  {line}")
                        hits += 1
                        if hits >= s.args.limit:
                            return 0
    if hits == 0:
        print("no match")
    return 0


def cmd_refs(s: Session) -> int:
    default = s.arc(required=False)
    code, _, _, kind, number = s.corpus.normalise(s.args.id, default)
    try:
        found = s.corpus.resolve(s.args.id, default)
    except JournalError as exc:
        print(f"note: {exc}; citations are still listed")
        found = None
    canonical = f"{code}.{kind}{number}"
    full = re.compile(rf"\b{code}(?:\d+)?\.{kind}{number}\b")
    roots = [s.notes_root, s.repo_root / ".claude" / "skills"]
    count = 0
    print(f"== exact: {canonical} and its located forms ==")
    for root in roots:
        for path in sorted(root.rglob("*.md")) if root.is_dir() else []:
            for i, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
                if full.search(line):
                    print(f"  {s.rel(path)}:{i + 1}  {line.strip()[:CLAIM_WIDTH]}")
                    count += 1
    log = subprocess.run(["git", "log", "--all", "--format=%h %s"], cwd=s.repo_root, capture_output=True,
                         text=True, encoding="utf-8")
    for line in log.stdout.splitlines() if log.returncode == 0 else []:
        if full.search(line):
            print(f"  git {line[:CLAIM_WIDTH]}")
            count += 1
    if found is not None and isinstance(found[0], Path):
        print(f"{count} exact; {canonical} is a lifted entry, so no legacy form applies")
        return 0
    arc = found[0] if found else s.corpus.arc_by_code(code)
    entry = found[1] if found else None
    if entry is not None:
        prefix, number = entry.prefix, entry.number
    else:
        nums = s.corpus.numbering(arc)
        prefix = nums.decision_prefix if kind == "D" else (nums.finding_prefix if kind == "F" else "Q")
    label = f"{prefix}{number}"
    # A prefixed label such as C165 is distinctive enough to search every journal; a bare number is not.
    journals = arc.load_all()
    if prefix in ("C", "CF"):
        journals = [j for a in s.corpus.arcs.values() for j in a.load_all()]
    print(f"== approximate: legacy forms of {label} ({'every arc' if prefix in ('C', 'CF') else arc.slug}) ==")
    approx = 0
    for journal, i, line in legacy_citations(journals, kind, prefix, number, entry):
        print(f"  {s.rel(journal.path)}:{i + 1}  {line.strip()[:CLAIM_WIDTH]}")
        approx += 1
    print(f"{count} exact, {approx} approximate")
    return 0


def legacy_citations(journals: list[Journal], kind: str, prefix: str, n: int, entry: Entry | None):
    """Lines that cite an entry in an old form, skipping the entry itself. A pattern match, not a resolution."""
    ranged = None
    if prefix:
        single = re.compile(rf"\b{re.escape(prefix)}{n}\b")
    elif kind == "D":
        single = re.compile(rf"\bdecisions?\b[^.;\n]{{0,40}}?(?<![\d.]){n}\b(?!\.\d)")
        ranged = re.compile(r"\bdecisions?\s+(\d+)\s*(?:to|-|–)\s*(\d+)")
    else:
        single = re.compile(rf"\bfindings?\b[^.;\n]{{0,40}}?(?<![\d.]){n}\b")
    for journal in journals:
        own = range(entry.start, entry.end) if entry is not None and journal is entry.journal else range(0)
        for i, line in enumerate(journal.lines):
            if i in own:
                continue
            if single.search(line) or (ranged and any(int(a) <= n <= int(b) for a, b in ranged.findall(line))):
                yield journal, i, line


def cmd_verify(s: Session) -> int:
    arcs = list(s.corpus.arcs.values()) if s.args.all_arcs else [s.arc()]
    totals = {"stale heads": 0, "gaps": 0, "duplicates": 0, "unregistered": 0, "stale table rows": 0}
    for arc in sorted(arcs, key=lambda a: a.slug):
        journals = arc.load_all()
        problems: list[str] = []
        if arc.code is None:
            problems.append("not in the arc registry")
            totals["unregistered"] += 1
        for journal in journals[:-1]:
            if "**This is the head of the thread" in journal.preamble_text():
                problems.append(f"{journal.path.name} still claims to be the head")
                totals["stale heads"] += 1
        by_kind: dict[str, dict[int, list[Entry]]] = {}
        for entry in arc.entries():
            if not entry.is_block and entry.full_id is None:
                by_kind.setdefault(entry.kind, {}).setdefault(entry.number, []).append(entry)
        for kind, numbers in sorted(by_kind.items()):
            present = sorted(numbers)
            gaps = [n for n in range(present[0], present[-1] + 1) if n not in numbers]
            if gaps:
                problems.append(f"{kind} gaps: {compress(gaps)}")
                totals["gaps"] += len(gaps)
            for number, hits in sorted(numbers.items()):
                if len(hits) > 1 and len({s.corpus.canonical_id(e, arc) for e in hits}) < len(hits):
                    where = ", ".join(s.corpus.located_id(e, arc) for e in hits)
                    problems.append(f"{kind}{number} unresolved duplicate: {where}")
                    totals["duplicates"] += 1
        for canonical, (file, label, occurrence) in s.corpus.table.by_id.items():
            if canonical.split(".")[0] != arc.code:
                continue
            if not any(s.corpus.rel(e.journal.path) == file and e.label == label and e.occurrence == occurrence
                       for e in arc.entries()):
                problems.append(f"table row {canonical} -> {file} {label} #{occurrence} no longer resolves")
                totals["stale table rows"] += 1
        if problems:
            print(f"{arc.code or '?'} {arc.slug}:")
            for problem in problems:
                print(f"  {problem}")
    print("; ".join(f"{v} {k}" for k, v in totals.items()))
    return 0


def compress(numbers: list[int]) -> str:
    runs: list[str] = []
    start = prev = numbers[0]
    for n in numbers[1:] + [None]:
        if n is not None and n == prev + 1:
            prev = n
            continue
        runs.append(str(start) if start == prev else f"{start}-{prev}")
        if n is not None:
            start = prev = n
    return ", ".join(runs)


# -- writing ------------------------------------------------------------------------------------------------------


def cmd_entry(s: Session, kind: str) -> int:
    arc = s.arc()
    journals = arc.load_all()
    head = journals[-1]
    nums = s.corpus.numbering(arc)
    entry_id = nums.decision_id() if kind == "D" else nums.finding_id()
    attribution = f"The user, {s.date}: " if getattr(s.args, "user", False) else None
    lines = render_entry(entry_id, s.text(), attribution, getattr(s.args, "source", None))
    section = head.entry_section(kind)
    first = insert_at_section_end(head, section.start, section.end, lines, blank_before=False)
    head.save()
    number = nums.next_decision if kind == "D" else nums.next_finding
    report_write(s, f"{arc.code or '?'}.{kind}{number}", head.path, first, len(lines))
    return 0


def cmd_amend(s: Session) -> int:
    arc, entry = journal_entry(s, s.args.id)
    by_label = None
    if s.args.by_user:
        by_label = f"the user, {s.date}"
    elif s.args.by:
        code, sess, _, kind, number = s.corpus.normalise(s.expand(s.args.by), arc)
        by_label = f"{'finding' if kind == 'F' else 'decision'} {code}{sess or ''}.{kind}{number}"
    lines = render_amendment(s.args.mark, by_label, s.text())
    journal = entry.journal
    journal.lines[entry.end : entry.end] = lines
    journal.save()
    report_write(s, f"{s.args.mark} on {s.corpus.canonical_id(entry, arc)}", journal.path, entry.end, len(lines))
    return 0


def journal_entry(s: Session, token: str) -> tuple[Arc, Entry]:
    found = s.corpus.resolve(token, s.arc(required=False))
    if isinstance(found[0], Path):
        raise JournalError(f"{token} lives in {s.rel(found[0])}, outside the journals; edit it there")
    return found


def cmd_set(s: Session) -> int:
    journal = s.arc().load_session(s.args.session)
    section = journal.section(s.args.name)
    if section.kind is not None:
        raise JournalError("decisions and findings are append-only; use `decision`, `finding` or `amend`")
    lines = render_section_body(s.text())
    tail = [""] if section.end < len(journal.lines) else []
    journal.lines[section.start + 1 : section.end] = [""] + lines + tail
    journal.save()
    report_write(s, f"section '{section.title}' replaced", journal.path, section.start + 2, len(lines))
    return 0


def cmd_append(s: Session) -> int:
    journal = s.arc().load_session(s.args.session)
    section = journal.section(s.args.name)
    if section.kind is not None:
        raise JournalError("decisions and findings are appended with `decision` or `finding`")
    text = s.text()
    if text.lstrip().startswith("#. "):
        numbers = [int(m["n"]) for line in journal.lines[section.start : section.end]
                   if (m := LIST_ITEM_NUMBER.match(line))]
        text = text.lstrip().replace("#. ", f"{max(numbers, default=0) + 1}. ", 1)
    lines = render_section_body(text)
    body = [line for line in journal.lines[section.start + 1 : section.end] if line.strip()]
    item = re.compile(r"^\s*(?:[-*+]|\d+\.)\s")
    continues_list = bool(body) and bool(item.match(lines[0])) and bool(item.match(body[-1]) or
                                                                       body[-1].startswith(" "))
    first = insert_at_section_end(journal, section.start, section.end, lines, blank_before=not continues_list)
    journal.save()
    report_write(s, f"appended to '{section.title}'", journal.path, first, len(lines))
    return 0


def cmd_lift(s: Session) -> int:
    arc, entry = journal_entry(s, s.args.id)
    canonical = s.corpus.canonical_id(entry, arc)
    if entry.is_dead() and not s.args.force:
        raise JournalError(f"{canonical} is marked {'; '.join(entry.markers())}; lifting would promote a reversed "
                           "entry. Pass --force if that is the intent")
    target = (s.repo_root / s.args.to).resolve()
    if s.notes_root.resolve() not in target.parents:
        raise JournalError(f"--to must name a file under {NOTES}/")
    lifted = lifted_lines(entry, canonical, os.path.relpath(entry.journal.path, target.parent).replace("\\", "/"),
                          s.date)
    if target.exists():
        text = target.read_bytes().decode("utf-8")
        newline = "\r\n" if "\r\n" in text else "\n"
        body = text.rstrip("\r\n").split(newline)
        start = len(body) + 1
        target.write_bytes((newline.join(body + [""] + lifted) + newline).encode("utf-8"))
    else:
        title = target.stem.replace("-", " ").title()
        area = next((line.split(":", 1)[1].strip() for line in entry.journal.lines[:12]
                     if line.startswith("area:")), "meta")
        skeleton = ["---", f'title: "{title}"', "type: ledger", f"area: {area}", "status: active",
                    f"date: {s.date}", "---", "", f"# {title}", "",
                    "Decisions and findings lifted from arc journals, each under its project-wide id.", "",
                    "## Entries", ""]
        start = len(skeleton)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(("\n".join(skeleton + lifted) + "\n").encode("utf-8"))
    link = os.path.relpath(target, entry.journal.path.parent).replace("\\", "/")
    stub = [entry.lines[0]] + wrap_markdown([f"  - **LIFTED to [{target.name}]({link}) on {s.date}** as "
                                             f"{canonical}; the full entry lives there."])
    journal = entry.journal
    journal.lines[entry.start : entry.end] = stub
    journal.save()
    print(f"{canonical} lifted -> {s.rel(target)}:{start + 1}; stub left at {journal.path.name}:{entry.start + 1}")
    return 0


def lifted_lines(entry: Entry, canonical: str, origin_link: str, date: str) -> list[str]:
    """The entry under a full-id heading, its body nested two spaces, with an origin line."""
    from journal_model import ENTRY_BOLD_AFTER, ENTRY_BOLD_FIRST

    first = entry.lines[0]
    after = ENTRY_BOLD_AFTER.match(first)
    before = ENTRY_BOLD_FIRST.match(first)
    if after:  # `312. **Claim.**`: the match consumed the opening bold
        heading = f"- **{canonical}. {first[after.end():].lstrip()}"
    elif before and before.group(0).count("**") >= 2:  # `**312.** Claim`: the bold closed on the id
        heading = f"- **{canonical}.** {first[before.end():].lstrip()}"
    elif before:  # `- **459. Claim.**` or `**53 — Claim**`
        heading = f"- **{canonical}. {first[before.end():].lstrip()}"
    else:  # a full-id heading or an unrecognised first line
        heading = f"- **{canonical}.** {first.lstrip('- ').lstrip()}"
    body = entry.lines[1:]
    indents = [len(l) - len(l.lstrip()) for l in body if l.strip()]
    shift = 2 - min(indents, default=2)
    nested = [(" " * shift + l if shift >= 0 else l[-shift:]) if l.strip() else "" for l in body]
    origin = f"  - *Origin:* [session {entry.journal.session}]({origin_link}), lifted {date}."
    return [heading, origin, *nested]


# The bold span may run on, as in "**This is the head of the thread until session 3 opens its own journal**".
HEAD_CLAIM = re.compile(r"\*\*This is the head of the thread[^*]*\*\*,\s+continuing")
SESSION_N = re.compile(r"(?i)\b(session) \d+")


def cmd_open(s: Session) -> int:
    if s.args.new:
        return open_new_arc(s)
    arc = s.arc()
    if arc.code is None:
        raise JournalError(f"arc {arc.slug} is not in the arc registry; claim a code first: "
                           f"journal.py claim {arc.slug} <CODE>")
    journals = arc.load_all()
    old = journals[-1]
    nums = s.corpus.numbering(arc)
    digits = len(re.search(r"-journal-(\d+)\.md$", old.path.name)[1]) if "-journal-" in old.path.name else 2
    new_session = old.session + 1
    new_path = old.path.with_name(f"{arc.slug}-journal-{new_session:0{digits}d}.md")
    if new_path.exists():
        raise JournalError(f"{new_path.name} already exists")
    code = arc.code

    fm_end = old.lines.index("---", 1)
    front = []
    for line in old.lines[: fm_end + 1]:
        if line.startswith("title:"):
            line = SESSION_N.sub(rf"\1 {new_session}", line)
        elif line.startswith("date:"):
            line = f"date: {s.date}"
        elif line.startswith("status:"):
            line = "status: active"
        front.append(line)
    pre_start, _ = old.preamble_range()
    title = SESSION_N.sub(rf"\1 {new_session}", old.lines[pre_start - 1])
    preamble = wrap_markdown([
        f"**This is the head of the thread**, continuing [session {old.session}](./{old.path.name}). Decisions "
        f"continue at {nums.decision_id()} and findings at {nums.finding_id()}, cited project-wide as "
        f"{code}.D{nums.next_decision} and {code}.F{nums.next_finding}."
    ])

    body: list[str] = []
    for section in old.sections():
        body += [old.lines[section.start], ""]
        if section.kind is not None:
            continue
        if section.title.startswith("2."):
            body += wrap_markdown([f"**Not yet measured.** Session {old.session}'s §2 is the last measured state; "
                                   "re-measure, then replace this with `journal.py set state`."])
        elif section.title.lower().startswith("reading order"):
            body += default_reading_order()
        else:
            content = old.lines[section.start + 1 : section.end]
            while content and not content[0].strip():
                content.pop(0)
            while content and not content[-1].strip():
                content.pop()
            body += content
        body.append("")
    while body and not body[-1].strip():
        body.pop()

    new = Journal(new_path, arc.slug, new_session, front + ["", title, ""] + preamble + [""] + body, old.newline)
    new.save()
    closed = close_head(old, new_session, new_path.name, s.args.reason, s.date, nums)
    s.write_pointer(arc.slug)
    print(f"opened {s.rel(new_path)} (session {new_session}); next ids {code}.D{nums.next_decision}, "
          f"{code}.F{nums.next_finding}")
    print(f"closed {s.rel(old.path)} as head" if closed else
          f"warning: {old.path.name} has no '**This is the head of the thread**' sentence; mark it closed by hand")
    return run_schema_check(s, [old.path, new_path])


def default_reading_order() -> list[str]:
    return wrap_markdown([
        "1. §2, §4 and §5 below, then §3 for the operational manual.",
        "2. Earlier decisions and findings only where this journal cites them, each with `journal.py show <id>`. "
        "**Do not read any journal end to end**, this one included.",
    ])


def close_head(old: Journal, new_session: int, new_name: str, reason: str, date: str, nums) -> bool:
    p_start, p_end = old.preamble_range()
    i = p_start
    while i < p_end:
        if not old.lines[i].strip():
            i += 1
            continue
        j = i
        while j < p_end and old.lines[j].strip():
            j += 1
        paragraph = " ".join(line.strip() for line in old.lines[i:j])
        if HEAD_CLAIM.search(paragraph):
            replacement = (f"**Superseded as head by [session {new_session}](./{new_name}),** closed at {reason} on "
                           f"{date} with decision {nums.decision_prefix}{nums.last_decision} and finding "
                           f"{nums.finding_prefix}{nums.last_finding}. Continues")
            old.lines[i:j] = wrap_markdown([HEAD_CLAIM.sub(replacement, paragraph, count=1)])
            old.save()
            return True
        i = j
    return False


def open_new_arc(s: Session) -> int:
    slug = s.args.new
    if slug in s.corpus.arcs:
        raise JournalError(f"arc {slug} already has journals; open its next session with plain `open`")
    row = next((r for r in s.corpus.registry if r.slug == slug), None)
    if row is None:
        raise JournalError(f"arc {slug} is not in the arc registry; claim a code first: journal.py claim {slug} <CODE>")
    if not (s.args.title and s.args.area):
        raise JournalError("a new arc needs --title and --area")
    directory = s.notes_root / (s.args.dir or row.directory or ".")
    path = directory / f"{slug}-journal-01.md"
    record_of = ", ".join(s.args.record_of or [])
    lines = ["---", f'title: "{s.args.title}: Session 1 Journal"', "type: workflow", f"area: {s.args.area}",
             "status: active", f"date: {s.date}", f"record_of: [{record_of}]", "---", "",
             f"# {s.args.title}: Session 1 Journal", ""]
    lines += wrap_markdown([f"**This is the head of the thread**, the arc's first session. Decisions start at 1 and "
                            f"findings at F1, cited project-wide as {row.code}.D1 and {row.code}.F1."])
    lines += ["", "## Reading order for a fresh context", "", *default_reading_order(), ""]
    for heading in ["## 1. The arc's charter", "## 2. State as at bootstrap", "## 3. Operational manual",
                    "## 4. Next work", "## 5. Open items"]:
        lines += [heading, "", "**Not yet written.**", ""]
    lines += ["## Decisions", "", "## Findings"]
    directory.mkdir(parents=True, exist_ok=True)
    Journal(path, slug, 1, lines).save()
    s.write_pointer(slug)
    print(f"opened {s.rel(path)} (session 1 of {slug}, code {row.code})")
    return run_schema_check(s, [path])


def run_schema_check(s: Session, paths: list[Path]) -> int:
    """The PostToolUse notes hook sees only Write and Edit, so a script write runs the check itself."""
    script = s.repo_root / "scripts" / "notes_schema.py"
    if not script.is_file():
        print("notes check: scripts/notes_schema.py not found, not run")
        return 0
    result = subprocess.run([sys.executable, str(script), "check", "--root", str(s.notes_root)],
                            capture_output=True, text=True, encoding="utf-8")
    ids = [p.relative_to(s.notes_root).as_posix() for p in paths]
    relevant = [line for line in result.stdout.splitlines() if any(i in line for i in ids)]
    if relevant:
        print("notes check, on these files:")
        print("\n".join(relevant))
        return 1
    print("notes check: no findings on these files")
    return 0


# -- claiming an arc code -----------------------------------------------------------------------------------------


def git(s: Session, *argv: str, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(["git", *argv], cwd=s.repo_root, capture_output=True, text=True, encoding="utf-8")
    if check and result.returncode != 0:
        raise JournalError(f"git {' '.join(argv)} failed: {(result.stderr or result.stdout).strip()}")
    return result


def cmd_claim(s: Session) -> int:
    slug, code = s.args.slug, s.args.code.upper()
    if not re.fullmatch(r"[A-Z]{2,5}", code):
        raise JournalError("a code is 2 to 5 capital letters")
    shown = git(s, "show", f"main:{REGISTRY.as_posix()}", check=False)
    if shown.returncode != 0:
        raise JournalError(f"main has no {REGISTRY.as_posix()}; the registry must reach main before any claim")
    rows = parse_registry(shown.stdout)
    if taken := next((r for r in rows if r.code == code), None):
        raise JournalError(f"{code} is taken by {taken.slug} ({taken.status}); codes are never reissued")
    if mine := next((r for r in rows if r.slug == slug), None):
        raise JournalError(f"{slug} already holds code {mine.code}")
    branch = git(s, "branch", "--show-current").stdout.strip()
    claim_branch = f"docs/claim-arc-{slug}"
    commands = [f"git switch -c {claim_branch} main", f"(append the row to {REGISTRY.as_posix()}, commit it)",
                "git switch main", f'git merge --no-ff {claim_branch} -m "Merge {claim_branch}: claim arc code '
                f'{code} for {slug}"', f"git branch -d {claim_branch}", f"git switch {branch or '<arc branch>'}",
                "git merge --no-edit main"]
    refusal = claim_refusal(s, branch)
    if refusal:
        print(f"refused: {refusal}. Run these where main can be checked out:")
        print("\n".join(f"  {c}" for c in commands))
        return 1
    directory = s.args.dir or "."
    row = RegistryRow(code, slug, directory, s.date, "active")
    trailers = "".join(f"\n{t}" for t in s.args.trailer or [])
    git(s, "switch", "-c", claim_branch, "main")
    try:
        path = s.repo_root / REGISTRY
        text = path.read_bytes().decode("utf-8")
        newline = "\r\n" if "\r\n" in text else "\n"
        lines = text.split(newline)
        last_row = max(i for i, line in enumerate(lines) if line.startswith("|"))
        lines.insert(last_row + 1, format_registry_row(row))
        path.write_bytes(newline.join(lines).encode("utf-8"))
        check = run_schema_check(s, [path])
        if check != 0:
            raise JournalError("the registry fails the notes check; nothing was merged")
        git(s, "add", REGISTRY.as_posix())
        git(s, "commit", "-m", f"Claim arc code {code} for {slug}" + (f"\n{trailers}" if trailers else ""))
        switched = git(s, "switch", "main", check=False)
        if switched.returncode != 0:
            # A refused `git switch main` means stop. Undo the cut branch and leave everything as it was.
            git(s, "switch", branch)
            git(s, "branch", "-D", claim_branch)
            print(f"stopped: git switch main was refused: {(switched.stderr or switched.stdout).strip()}")
            print(f"back on {branch}, with no claim branch and nothing changed. Ask the user where the claim should "
                  "merge, then run:")
            print("\n".join(f"  {c}" for c in commands))
            return 1
        git(s, "merge", "--no-ff", claim_branch, "-m",
            f"Merge {claim_branch}: claim arc code {code} for {slug}" + (f"\n{trailers}" if trailers else ""))
        git(s, "branch", "-d", claim_branch)
    except JournalError as exc:
        print(f"stopped: {exc}")
        print(f"now on {git(s, 'branch', '--show-current').stdout.strip()}; finish with:")
        print("\n".join(f"  {c}" for c in commands[2:]))
        return 1
    if branch and branch != "main":
        git(s, "switch", branch)
        git(s, "merge", "--no-edit", "main")
    print(f"claimed {code} for {slug} on main; merged main into {branch}")
    return 0


def claim_refusal(s: Session, branch: str) -> str | None:
    """Why the claim cannot run here, or None. Unstaged edits elsewhere are allowed: git carries them across."""
    if not branch:
        return "HEAD is detached"
    status = git(s, "status", "--porcelain", "--untracked-files=no").stdout.splitlines()
    if any(line[0] not in " ?" for line in status if line):
        return "the index holds staged changes"
    if any(line[3:].strip() == REGISTRY.as_posix() for line in status):
        return "the registry itself has uncommitted edits"
    return None


def cmd_use(s: Session) -> int:
    arc = s.corpus.arcs.get(s.args.slug)
    if arc is None:
        raise JournalError(f"no journals named {s.args.slug}-journal-NN.md")
    s.write_pointer(arc.slug)
    print(f"arc {arc.slug} ({arc.code or 'unregistered'}): head is {s.rel(arc.head)}")
    return 0


# -- entry point --------------------------------------------------------------------------------------------------


def add_text_options(p: argparse.ArgumentParser) -> None:
    p.add_argument("--text", help="the text inline, instead of stdin")
    p.add_argument("--file", help="read the text from this UTF-8 file, instead of stdin")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--arc", help="arc slug or code, e.g. building-shell-arc or BSA")
    parser.add_argument("--root", help="repo root (default: found from the working directory)")
    parser.add_argument("--meta", help=f"directory holding arc-registry.md and journal-ids.csv (default {NOTES})")
    parser.add_argument("--date", help="override today's date, YYYY-MM-DD")
    sub = parser.add_subparsers(dest="command", required=True)

    def add(name: str, func, help_text: str) -> argparse.ArgumentParser:
        p = sub.add_parser(name, help=help_text)
        p.set_defaults(func=func)
        return p

    p = add("brief", cmd_brief, "what a fresh context reads first")
    p.add_argument("--sections", default="state,next,open")
    p = add("show", cmd_show, "print entries by id")
    p.add_argument("ids", nargs="+")
    p = add("section", cmd_section, "print one section")
    p.add_argument("name")
    p.add_argument("-s", "--session", type=int)
    p = add("index", cmd_index, "one line per entry")
    p.add_argument("-s", "--session", type=int)
    p.add_argument("--all", action="store_true", help="every session, not only the head")
    p.add_argument("--since", help="entries from this id onward (every session)")
    p.add_argument("--kind", choices=["D", "F", "Q"])
    p.add_argument("--marked", action="store_true", help="only entries carrying a marker")
    p.add_argument("--full", action="store_true", help="do not truncate claims")
    p = add("find", cmd_find, "search entries and sections, newest first")
    p.add_argument("pattern")
    p.add_argument("-s", "--session", type=int)
    p.add_argument("--all-arcs", action="store_true")
    p.add_argument("--regex", action="store_true")
    p.add_argument("--case", action="store_true")
    p.add_argument("--limit", type=int, default=20)
    p = add("refs", cmd_refs, "every citation of an entry")
    p.add_argument("id")
    p = add("verify", cmd_verify, "stale heads, gaps, duplicates, registry and table coverage")
    p.add_argument("--all-arcs", action="store_true")

    p = add("decision", lambda s: cmd_entry(s, "D"), "append the next decision to the head")
    p.add_argument("--user", action="store_true", help="attribute the claim to the user, dated today")
    add_text_options(p)
    p = add("finding", lambda s: cmd_entry(s, "F"), "append the next finding to the head")
    p.add_argument("--source", help="provenance, set in parentheses after the claim")
    add_text_options(p)
    p = add("amend", cmd_amend, "mark an entry where it stands")
    p.add_argument("id")
    p.add_argument("mark", type=str.upper, choices=list(MARKS))
    who = p.add_mutually_exclusive_group()
    who.add_argument("--by", help="the entry that amends it (@D467 or a full id)")
    who.add_argument("--by-user", action="store_true")
    add_text_options(p)
    for name, func in (("set", cmd_set), ("append", cmd_append)):
        p = add(name, func, f"{name} a section's body")
        p.add_argument("name")
        p.add_argument("-s", "--session", type=int)
        add_text_options(p)
    p = add("lift", cmd_lift, "move an entry to a curated document under its full id")
    p.add_argument("id")
    p.add_argument("--to", required=True, help=f"a file under {NOTES}/, e.g. {NOTES}/building-shell-ledger.md")
    p.add_argument("--force", action="store_true", help="lift an entry marked superseded, struck or withdrawn")
    p = add("open", cmd_open, "close the head and open the next session, or open a new arc with --new")
    p.add_argument("--reason", default="the session's end")
    p.add_argument("--new", metavar="SLUG")
    p.add_argument("--dir", help=f"with --new: the directory under {NOTES}/ (default: the registry's)")
    p.add_argument("--title")
    p.add_argument("--area")
    p.add_argument("--record-of", action="append")
    p = add("claim", cmd_claim, "claim an arc code on main")
    p.add_argument("slug")
    p.add_argument("code")
    p.add_argument("--dir", help=f"the arc's directory under {NOTES}/, recorded in the registry (default '.')")
    p.add_argument("--trailer", action="append", help="a commit trailer line, repeatable")
    p = add("use", cmd_use, "set this worktree's default arc")
    p.add_argument("slug")
    return parser


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # a Windows console is cp1252, and journals carry § and →
    args = build_parser().parse_args(argv)
    try:
        return args.func(Session(args))
    except (JournalError, FormatError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
