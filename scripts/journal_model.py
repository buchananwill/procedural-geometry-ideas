"""Parse arc journals under docs/notes/ into sections and numbered entries, and resolve project-wide ids.

Vendored from the Piste Perfect project's Scripts/journal_model.py and adapted to this repo: notes live flat in
docs/notes/, which also holds the arc registry and the id table.

An arc is the set of files `<slug>-journal-NN.md` in one directory; the highest NN is the head. A journal splits into
level-2 sections. Inside a section headed Decisions, Findings or Questions, a column-0 line that opens with an entry id
starts an entry, which runs to the next entry, the next column-0 heading, or the section's end.

Entry layouts read (every one occurs in the corpus):

    - **459. Claim.** rest          312. **Claim.** rest         - F54. **Claim.** rest
    **53 — Claim** rest             - **F1 — Claim** rest        - **N7-1. Claim.** (block ids)
    - **MB.D474. Claim.** rest      (a lifted entry, carrying its full id)

Ids are project-wide: `{CODE}.{D|F|Q}{n}`, where the arc's CODE comes from docs/notes/arc-registry.md and n is the
entry's own number. The located form `{CODE}{session}.{D|F|Q}{n}` names the session too. Legacy entries whose own
label cannot give a unique id are mapped by docs/notes/journal-ids.csv, written once by journal_migrate.py.
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from pathlib import Path

NOTES_DIR = Path("docs") / "notes"  # relative to the repo root
REGISTRY_NAME = "arc-registry.md"
ID_TABLE_NAME = "journal-ids.csv"

JOURNAL_NAME = re.compile(r"^(?P<slug>.+?)-journal(?:-(?P<n>\d+))?\.md$")
HEADING2 = re.compile(r"^## (?P<title>.+?)\s*$")
COLUMN0_HEADING = re.compile(r"^#{1,6} ")
FENCE = re.compile(r"^\s*(```|~~~)")
ENTRY_SECTION = re.compile(r"^(?:\d+[a-z]?\.\s*)?(?P<name>decisions|findings|questions)\b", re.IGNORECASE)
SECTION_KIND = {"decisions": "D", "findings": "F", "questions": "Q"}

# The id: a block id (N7-1, F-N7-1) or a whitelisted prefix with a number. Separator: '.' or a spaced dash.
_LEGACY_ID = r"(?P<prefix>(?:F-)?[A-Z]\d+-|CF|C|F|Q|)(?P<num>\d+)"
_SEP = r"(?:\.|\s+[—–])"
# Bold before the id, or bold (optionally struck) right after it: a nested list item has neither.
ENTRY_BOLD_FIRST = re.compile(rf"^(?:- )?\*\*{_LEGACY_ID}{_SEP}(?:\*\*)?\s")
ENTRY_BOLD_AFTER = re.compile(rf"^(?:- )?{_LEGACY_ID}{_SEP}\s+(?:~~)?\*\*")
FULL_ID_HEADING = re.compile(r"^(?:- )?\*\*(?P<code>[A-Z]{2,5})(?P<sess>\d+)?\.(?P<kind>[DFQ])(?P<num>\d+)\.\s")
ANY_ID_START = re.compile(rf"^(?:- )?(?:\*\*)?(?P<prefix>[A-Z][A-Z0-9-]*?)(?P<num>\d+){_SEP}")

FULL_ID = re.compile(r"^(?P<code>[A-Z]{2,5})(?P<sess>\d+)?\.(?P<kind>[DFQ])(?P<num>\d+)$")
BARE_ID = re.compile(r"^(?P<prefix>CF|C|F|Q|D|)(?P<num>\d+)$")
LIST_ITEM_NUMBER = re.compile(r"^(?P<n>\d+)\. ")  # a top-level ordered-list item
PREAMBLE_D_START = re.compile(r"[Dd]ecisions continue at \**[A-Z]*(?P<n>\d+)")
PREAMBLE_F_START = re.compile(r"[Ff]indings (?:continue )?at \**[A-Z]*F(?P<n>\d+)")
# A hand-closed journal says where numbering continues in its successor, which is not where its own entries start.
PREAMBLE_HAND_CLOSED = re.compile(r"no longer the head")
MARKER = re.compile(
    r"\b(?P<mark>STRUCK AND REVERSED|SUPERSEDED|AMENDED|WITHDRAWN|STRUCK|REVERSED|DISPROVED|LIFTED)\b"
    r"(?:[^.\n]{0,24}?\bby\s+(?:the user|(?:decision|finding)\s+(?P<by>[A-Z]{0,5}\.?[A-Z]?\d+)))?"
)
DEAD_MARKS = {"STRUCK AND REVERSED", "SUPERSEDED", "WITHDRAWN", "STRUCK", "REVERSED", "DISPROVED"}

SECTION_ALIASES = {
    "reading": "reading order",
    "charter": "1.",
    "state": "2.",
    "manual": "3.",
    "next": "4.",
    "open": "5.",
    "decisions": "decisions",
    "findings": "findings",
}


class JournalError(Exception):
    """A request the journal tools cannot satisfy; the message says what to do instead."""


def kind_of_prefix(prefix: str) -> str | None:
    """The kind an id prefix names on its own, or None for a bare number, whose kind needs context."""
    if prefix.startswith("F-"):
        return "F"
    if re.fullmatch(r"[A-Z]\d+-", prefix):
        return "D"
    return {"C": "D", "F": "F", "CF": "F", "Q": "Q"}.get(prefix)


@dataclass
class Section:
    title: str
    start: int  # index of the heading line
    end: int  # exclusive: the next level-2 heading, or end of file

    @property
    def kind(self) -> str | None:
        """'D', 'F' or 'Q' for an entry section, None for any other."""
        m = ENTRY_SECTION.match(self.title)
        return SECTION_KIND[m["name"].lower()] if m else None


@dataclass
class Entry:
    journal: "Journal"
    prefix: str
    number: int
    kind: str  # 'D', 'F' or 'Q'
    section_kind: str
    start: int
    end: int  # exclusive, trailing blank lines excluded
    occurrence: int = 1  # how many times this label has occurred in this file, counting this one
    full_id: str | None = None  # set when the heading itself carries a full id (a lifted entry)

    @property
    def label(self) -> str:
        """The id as written: '459', 'F97', 'C165', 'N7-1'."""
        return f"{self.prefix}{self.number}"

    @property
    def is_block(self) -> bool:
        return self.prefix.endswith("-")

    @property
    def lines(self) -> list[str]:
        return self.journal.lines[self.start : self.end]

    def claim(self) -> str:
        """The entry's bold operative claim, joined onto one line."""
        first_para: list[str] = []
        for i, line in enumerate(self.lines):
            stripped = line.strip()
            if i > 0 and (not stripped or re.match(r"^(?:[-*+]|\d+\.)\s", stripped)):
                break
            first_para.append(stripped)
        text = " ".join(first_para)
        text = re.sub(r"^- ", "", text)
        ident = re.escape(self.full_id) if self.full_id else re.escape(self.label)
        text = re.sub(rf"^(?:\*\*)?{ident}(?:\.|\s+[—–])\s*(?:~~)?(?:\*\*)?", "", text)
        end = text.find("**")
        return (text[:end] if end != -1 else text).strip(" ~")

    def markers(self) -> list[str]:
        """Every amendment marker in the entry, e.g. 'AMENDED by 467'."""
        found = []
        for m in MARKER.finditer("\n".join(self.lines)):
            label = m["mark"]
            if m["by"]:
                label += f" by {m['by']}"
            elif "the user" in m.group(0):
                label += " by the user"
            found.append(label)
        if any("~~" in line for line in self.lines[:1]):
            found.append("STRUCK")
        return found

    def is_dead(self) -> bool:
        return any(m.split(" by ")[0] in DEAD_MARKS for m in self.markers())


@dataclass
class ParseContext:
    """Arc-level state the entry rules need: which numbers are taken, and how the arc numbers its findings."""

    has_f_prefix: bool = True
    seen: set[tuple[str, int]] = field(default_factory=set)
    last: dict[str, int] = field(default_factory=dict)
    dropped: list[tuple[Path, int, str]] = field(default_factory=list)  # nested-list lines refused as entries
    ignored: list[tuple[Path, int, str]] = field(default_factory=list)  # id-like lines with a prefix not whitelisted


@dataclass
class Journal:
    path: Path
    slug: str
    session: int
    lines: list[str]
    newline: str = "\n"
    final_newline: bool = True
    _sections: list[Section] | None = field(default=None, repr=False)
    _entries: list[Entry] | None = field(default=None, repr=False)

    @classmethod
    def load(cls, path: Path) -> "Journal":
        m = JOURNAL_NAME.match(path.name)
        slug, session = (m["slug"], int(m["n"] or 1)) if m else (path.stem, 0)
        raw = path.read_bytes().decode("utf-8")
        if raw.startswith("\ufeff"):
            raise JournalError(f"{path} carries a BOM; remove it before using the journal tools")
        newline = "\r\n" if "\r\n" in raw else "\n"
        final_newline = raw.endswith(newline)
        body = raw[: -len(newline)] if final_newline else raw
        return cls(path, slug, session, body.split(newline), newline, final_newline)

    def save(self) -> None:
        text = self.newline.join(self.lines)
        if self.final_newline:
            text += self.newline
        self.path.write_bytes(text.encode("utf-8"))
        self.invalidate()

    def invalidate(self) -> None:
        self._sections = None
        self._entries = None

    # -- structure ---------------------------------------------------------------------------------------------

    def sections(self) -> list[Section]:
        if self._sections is not None:
            return self._sections
        heads: list[tuple[int, str]] = []
        in_fence = False
        for i, line in enumerate(self.lines):
            if FENCE.match(line):
                in_fence = not in_fence
                continue
            if not in_fence and (m := HEADING2.match(line)):
                heads.append((i, m["title"]))
        self._sections = [
            Section(title, start, heads[k + 1][0] if k + 1 < len(heads) else len(self.lines))
            for k, (start, title) in enumerate(heads)
        ]
        return self._sections

    def preamble_range(self) -> tuple[int, int]:
        """Lines after the H1 title and before the first level-2 heading."""
        first_h2 = self.sections()[0].start if self.sections() else len(self.lines)
        h1 = next((i for i in range(first_h2) if self.lines[i].startswith("# ")), None)
        if h1 is None:
            raise JournalError(f"{self.path.name} has no '# ' title line before its first section")
        return h1 + 1, first_h2

    def preamble_text(self) -> str:
        try:
            start, end = self.preamble_range()
        except JournalError:
            return ""
        return " ".join(line.strip() for line in self.lines[start:end])

    def section(self, name: str) -> Section:
        """Resolve a section by alias (state, next, open...), by number (2), or by a heading substring."""
        key = SECTION_ALIASES.get(name.lower(), name.lower())
        if key.isdigit():
            key = f"{key}."
        candidates = [s for s in self.sections() if s.title.lower().startswith(key)]
        if not candidates:
            candidates = [s for s in self.sections() if key in s.title.lower()]
        if len(candidates) != 1:
            titles = ", ".join(f"'{s.title}'" for s in self.sections())
            what = "matches no section" if not candidates else "matches several sections"
            raise JournalError(f"'{name}' {what} in {self.path.name}; its sections are {titles}")
        return candidates[0]

    def entry_section(self, kind: str) -> Section:
        """The section new entries of this kind are appended to: the last one of its kind."""
        matches = [s for s in self.sections() if s.kind == kind]
        if not matches:
            name = {"D": "Decisions", "F": "Findings", "Q": "Questions"}[kind]
            raise JournalError(f"{self.path.name} has no '## {name}' section")
        return matches[-1]

    def entries(self, ctx: ParseContext | None = None) -> list[Entry]:
        if self._entries is None:
            if ctx is None:
                ctx = ParseContext(has_f_prefix=arc_has_f_prefix([self]))
            self._entries = parse_entries(self, ctx)
        return self._entries


def arc_has_f_prefix(journals: list[Journal]) -> bool:
    pattern = re.compile(rf"^(?:- )?(?:\*\*)?C?F\d+{_SEP}")
    return any(pattern.match(line) for j in journals for line in j.lines)


def parse_entries(journal: Journal, ctx: ParseContext) -> list[Entry]:
    """Find the entries of one journal, in file order, applying the arc-level rules in `ctx`.

    - Kind comes from the id prefix. A bare number is a decision, except in a Findings section of an arc that numbers
      its findings bare, or where it continues the arc's finding series.
    - A bare number below the preamble's "Decisions continue at N", or one already taken in the arc that does not
      follow the previous entry, is a nested list item, not an entry.
    """
    preamble = journal.preamble_text()
    if PREAMBLE_HAND_CLOSED.search(preamble):
        preamble = ""
    d_start = int(m["n"]) if (m := PREAMBLE_D_START.search(preamble)) else None
    f_start = int(m["n"]) if (m := PREAMBLE_F_START.search(preamble)) else None
    entries: list[Entry] = []
    labels: dict[str, int] = {}
    for section in journal.sections():
        if section.kind is None:
            continue
        starts: list[tuple[int, Entry]] = []
        boundaries: list[int] = []
        last_in_section: dict[str, int] = {}
        in_fence = False
        for i in range(section.start + 1, section.end):
            line = journal.lines[i]
            if FENCE.match(line):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            if COLUMN0_HEADING.match(line):
                boundaries.append(i)
                continue
            entry = _entry_at(journal, section, i, line, ctx, d_start, f_start, last_in_section)
            if entry is not None:
                starts.append((i, entry))
        for k, (start, entry) in enumerate(starts):
            end = starts[k + 1][0] if k + 1 < len(starts) else section.end
            end = min([end, *[b for b in boundaries if b > start]])
            while end > start + 1 and not journal.lines[end - 1].strip():
                end -= 1
            entry.end = end
            labels[entry.label] = labels.get(entry.label, 0) + 1
            entry.occurrence = labels[entry.label]
            entries.append(entry)
    return entries


def _entry_at(journal, section, i, line, ctx, d_start, f_start, last_in_section) -> Entry | None:
    if m := FULL_ID_HEADING.match(line):
        entry = Entry(journal, "", int(m["num"]), m["kind"], section.kind, i, i + 1)
        entry.full_id = f"{m['code']}.{m['kind']}{m['num']}"
        return entry
    m = ENTRY_BOLD_FIRST.match(line) or ENTRY_BOLD_AFTER.match(line)
    if not m:
        if (other := ANY_ID_START.match(line)) and kind_of_prefix(other["prefix"]) is None and other["prefix"]:
            if not re.fullmatch(r"[A-Z]+\.", other["prefix"]) and "**" in line[:12]:
                ctx.ignored.append((journal.path, i + 1, line.strip()[:100]))
        return None
    prefix, num = m["prefix"], int(m["num"])
    kind = kind_of_prefix(prefix)
    if kind is None:  # a bare number
        if section.kind == "F" and (not ctx.has_f_prefix or num == ctx.last.get("F", 0) + 1):
            kind = "F"
        elif section.kind == "Q":
            kind = "Q"
        else:
            kind = "D"
        bound = d_start if kind == "D" else f_start
        follows = num == last_in_section.get(kind, num - 1) + 1
        if (bound is not None and num < bound) or ((kind, num) in ctx.seen and not follows):
            ctx.dropped.append((journal.path, i + 1, line.strip()[:100]))
            return None
    ctx.seen.add((kind, num))
    if not prefix.endswith("-"):
        ctx.last[kind] = num
    last_in_section[kind] = num
    return Entry(journal, prefix, num, kind, section.kind, i, i + 1)


# -- arcs ---------------------------------------------------------------------------------------------------------


@dataclass
class Arc:
    slug: str
    journals: list[Path]  # ascending session order
    code: str | None = None
    _loaded: list[Journal] | None = field(default=None, repr=False)
    context: ParseContext | None = field(default=None, repr=False)

    @property
    def head(self) -> Path:
        return self.journals[-1]

    def load_all(self) -> list[Journal]:
        if self._loaded is None:
            loaded = [Journal.load(p) for p in self.journals]
            self.context = ParseContext(has_f_prefix=arc_has_f_prefix(loaded))
            for journal in loaded:
                journal.entries(self.context)
            self._loaded = loaded
        return self._loaded

    def reload(self) -> list[Journal]:
        self._loaded = None
        return self.load_all()

    def load_head(self) -> Journal:
        return self.load_all()[-1]

    def load_session(self, session: int | None) -> Journal:
        journals = self.load_all()
        if session is None:
            return journals[-1]
        for journal in journals:
            if journal.session == session:
                return journal
        raise JournalError(f"arc '{self.slug}' has no session {session}")

    def entries(self) -> list[Entry]:
        return [e for j in self.load_all() for e in j.entries()]


def discover_arcs(notes_root: Path) -> dict[str, Arc]:
    grouped: dict[str, list[tuple[int, Path]]] = {}
    for path in notes_root.rglob("*-journal*.md"):
        if "_templates" in path.parts:
            continue
        if m := JOURNAL_NAME.match(path.name):
            grouped.setdefault(m["slug"], []).append((int(m["n"] or 1), path))
    return {slug: Arc(slug, [p for _, p in sorted(items)]) for slug, items in grouped.items()}


@dataclass
class Numbering:
    decision_prefix: str
    finding_prefix: str
    next_decision: int
    next_finding: int
    last_decision: int
    last_finding: int

    def decision_id(self) -> str:
        return f"{self.decision_prefix}{self.next_decision}"

    def finding_id(self) -> str:
        return f"{self.finding_prefix}{self.next_finding}"


def numbering(journals: list[Journal]) -> Numbering:
    """Maxima per kind over every entry in the arc, whatever section holds it; each prefix by majority."""
    entries = [e for j in journals for e in j.entries() if not e.is_block and e.full_id is None]

    def majority(kind: str, default: str) -> str:
        counts: dict[str, int] = {}
        for e in entries:
            if e.kind == kind:
                counts[e.prefix] = counts.get(e.prefix, 0) + 1
        return max(counts, key=counts.get) if counts else default

    last_d = max((e.number for e in entries if e.kind == "D"), default=0)
    last_f = max((e.number for e in entries if e.kind == "F"), default=0)
    return Numbering(majority("D", ""), majority("F", "F"), last_d + 1, last_f + 1, last_d, last_f)


def find_repo_root(start: Path) -> Path:
    for candidate in [start, *start.parents]:
        if (candidate / NOTES_DIR).is_dir():
            return candidate
    raise JournalError(f"no {NOTES_DIR.as_posix()}/ found at or above {start}; pass --root")


# -- registry and id table ----------------------------------------------------------------------------------------

REGISTRY_ROW = re.compile(r"^\|\s*(?P<code>[A-Z]{2,5})\s*\|\s*(?P<slug>[a-z0-9-]+)\s*\|\s*(?P<dir>[^|]*?)\s*\|"
                          r"\s*(?P<date>[^|]*?)\s*\|\s*(?P<status>[a-z]+)\s*\|\s*$")


@dataclass
class RegistryRow:
    code: str
    slug: str
    directory: str
    claimed: str
    status: str


def parse_registry(text: str) -> list[RegistryRow]:
    return [
        RegistryRow(m["code"], m["slug"], m["dir"], m["date"], m["status"])
        for line in text.splitlines()
        if (m := REGISTRY_ROW.match(line))
    ]


def format_registry_row(row: RegistryRow) -> str:
    return f"| {row.code} | {row.slug} | {row.directory} | {row.claimed} | {row.status} |"


@dataclass
class IdTable:
    """Canonical id <-> (file relative to docs/notes, legacy label, occurrence of that label in the file)."""

    by_id: dict[str, tuple[str, str, int]] = field(default_factory=dict)
    by_location: dict[tuple[str, str, int], str] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> "IdTable":
        table = cls()
        if not path.is_file():
            return table
        with path.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                location = (row["file"], row["label"], int(row["occurrence"]))
                table.by_id[row["id"]] = location
                table.by_location[location] = row["id"]
        return table


@dataclass
class Corpus:
    """Every arc, the registry that names them, and the id table that maps legacy entries."""

    notes_root: Path
    arcs: dict[str, Arc]
    registry: list[RegistryRow]
    table: IdTable

    @classmethod
    def load(cls, notes_root: Path, meta_dir: Path | None = None) -> "Corpus":
        meta = meta_dir or notes_root
        registry_path = meta / REGISTRY_NAME
        registry = parse_registry(registry_path.read_text(encoding="utf-8")) if registry_path.is_file() else []
        arcs = discover_arcs(notes_root)
        for row in registry:
            if row.slug in arcs:
                arcs[row.slug].code = row.code
        return cls(notes_root, arcs, registry, IdTable.load(meta / ID_TABLE_NAME))

    def arc_by_code(self, code: str) -> Arc:
        for arc in self.arcs.values():
            if arc.code == code:
                return arc
        known = any(row.code == code for row in self.registry)
        raise JournalError(f"arc code {code} is {'registered but has no journals here' if known else 'not registered'}")

    def rel(self, path: Path) -> str:
        return path.relative_to(self.notes_root).as_posix()

    def numbering(self, arc: Arc) -> Numbering:
        """The arc's next numbers, above both its entries' own numbers and any id the table assigned."""
        nums = numbering(arc.load_all())
        for canonical in self.table.by_id:
            code, rest = canonical.split(".")
            if code != arc.code:
                continue
            n = int(rest[1:])
            if rest[0] == "D" and n >= nums.next_decision:
                nums.next_decision, nums.last_decision = n + 1, n
            elif rest[0] == "F" and n >= nums.next_finding:
                nums.next_finding, nums.last_finding = n + 1, n
        return nums

    def canonical_id(self, entry: Entry, arc: Arc) -> str:
        if entry.full_id:
            return entry.full_id
        mapped = self.table.by_location.get((self.rel(entry.journal.path), entry.label, entry.occurrence))
        if mapped:
            return mapped
        return f"{arc.code or '?'}.{entry.kind}{entry.number}"

    def located_id(self, entry: Entry, arc: Arc) -> str:
        """The id with its session. A block id's own number repeats across blocks, so it uses the canonical one."""
        number = entry.number
        if entry.is_block:
            number = int(self.canonical_id(entry, arc).split(".")[1][1:] or 0)
        return f"{arc.code or '?'}{entry.journal.session}.{entry.kind}{number}"

    def explicit_headings(self) -> dict[str, tuple[Path, int]]:
        """Full-id entry headings outside the journals: where lifted entries live."""
        found: dict[str, tuple[Path, int]] = {}
        for path in self.notes_root.rglob("*.md"):
            if JOURNAL_NAME.match(path.name):
                continue
            for i, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
                if m := FULL_ID_HEADING.match(line):
                    found.setdefault(f"{m['code']}.{m['kind']}{m['num']}", (path, i))
        return found

    def normalise(self, token: str, default_arc: Arc | None) -> tuple[str, str | None, int | None, str, int]:
        """Read any accepted id form into (code, session or None, kind, number). Bare forms need `default_arc`."""
        token = token.strip().lstrip("@")
        if m := FULL_ID.match(token):
            return m["code"], m["sess"], None, m["kind"], int(m["num"])
        if (m := BARE_ID.match(token.upper())) and default_arc is not None:
            if default_arc.code is None:
                raise JournalError(f"arc {default_arc.slug} has no registered code")
            prefix = m["prefix"]
            kind = "D" if prefix in ("", "C", "D") else ("F" if prefix in ("F", "CF") else "Q")
            return default_arc.code, None, None, kind, int(m["num"])
        raise JournalError(f"'{token}' is not an id such as MB.D478, MB10.D478, or (with an arc) 478 or F97")

    def resolve(self, token: str, default_arc: Arc | None = None) -> tuple[Arc, Entry] | tuple[Path, int]:
        """Find an entry. Order: a full-id heading outside the journals, then the id table, then the arc's parse.

        Returns (arc, entry) for a journal entry, or (path, line index) for a lifted entry in another document.
        """
        code, session, _, kind, number = self.normalise(token, default_arc)
        arc = self.arc_by_code(code)
        if session is not None:
            journal = arc.load_session(int(session))
            hits = [e for e in journal.entries() if e.kind == kind and not e.is_block and e.number == number]
            hits += [e for e in journal.entries() if e.is_block and self.located_id(e, arc).endswith(f".{kind}{number}")]
            if not hits:
                raise JournalError(f"{token}: session {session} of {arc.slug} holds no {kind}{number}")
            return arc, hits[0]
        canonical = f"{code}.{kind}{number}"
        explicit = self.explicit_headings().get(canonical)
        if explicit:
            return explicit
        if canonical in self.table.by_id:
            file, label, occurrence = self.table.by_id[canonical]
            for journal in arc.load_all():
                if self.rel(journal.path) == file:
                    for entry in journal.entries():
                        if entry.label == label and entry.occurrence == occurrence:
                            return arc, entry
            raise JournalError(f"{canonical}: the id table points at {file} {label} #{occurrence}, which is not there")
        hits = [e for e in arc.entries() if e.kind == kind and e.number == number and not e.is_block]
        hits = [e for e in hits if self.canonical_id(e, arc) == canonical]
        if not hits:
            raise JournalError(f"{canonical} is not in arc {arc.slug}")
        if len(hits) > 1:
            where = ", ".join(self.located_id(e, arc) for e in hits)
            raise JournalError(f"{canonical} is ambiguous; name the session: {where}")
        return arc, hits[0]
