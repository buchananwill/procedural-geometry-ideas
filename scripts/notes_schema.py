#!/usr/bin/env python3
"""notes_schema.py -- checker and reporter for the docs/notes/ documentation protocol.

Implements the rules in the Front Matter, Types, Edges, Evidence, and Enforcement and Reports
sections of docs/notes/_schema.md.

Vendored from the Piste Perfect project's Scripts/notes_schema.py and adapted to this repo: the
notes root is docs/notes/, the areas are this repo's, the arc registry sits beside the notes, and
verified_by evidence is searched for in the workspace's TypeScript rather than under Source/.

Subcommands:
    check   [--root PATH] [--source-root PATH] [--summary]
    report  [--root PATH] [--area AREA] [--vision PATH]

A document's identity is its path relative to the notes root, with forward slashes. Every
path-valued key (part_of, depends_on, record_of, superseded_by) is resolved from the declaring
file's directory to that identity before any rule is applied.
"""

from __future__ import annotations

import argparse
import datetime
import graphlib
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from get_frontmatters import FrontMatterError, read_frontmatter

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_NOTES_ROOT = PROJECT_ROOT / "docs" / "notes"
# verified_by evidence is searched for across the workspace's own code: packages/ and apps/.
DEFAULT_SOURCE_ROOT = PROJECT_ROOT
SOURCE_SKIP_DIRS = {"node_modules", "dist", "build", "out", "coverage", "docs", "examples", "scripts", "golden"}
ARC_REGISTRY_NAME = "arc-registry.md"

TEMPLATES_DIRNAME = "_templates"

ALLOWED_KEYS = {
    "title",
    "type",
    "area",
    "status",
    "date",
    "superseded_by",
    "part_of",
    "depends_on",
    "record_of",
    "priority",
    "verified_by",
}
REQUIRED_KEYS = {"title", "type", "area", "status", "date"}

AREAS = {
    "articulation",
    "building-shell",
    "dashboard",
    "dol-system",
    "meta",
    "straight-skeleton",
    "subdivision",
}

PRIORITIES = {"high", "normal", "low"}
DEFAULT_PRIORITY = "normal"
PRIORITY_RANK = {"high": 0, "normal": 1, "low": 2}

STATUS_SETS = {
    "design-vision": {"speculative", "active", "rejected", "superseded"},
    "roadmap": {"proposed", "iterating", "approved", "completed"},
    "decision-spec": {"proposed", "iterating", "approved", "implementing", "completed"},
    "issue": {"open", "resolved"},
    "workflow": {"active", "archived"},
    "commentary": {"active", "archived"},
    "technical-reference": {"active", "archived"},
    "ledger": {"active", "archived"},
}
TYPES = set(STATUS_SETS)

# The "finished" status per type, used by the generic is_open()/is_finished() helpers.
FINISHED_STATUS = {
    "roadmap": "completed",
    "decision-spec": "completed",
    "issue": "resolved",
}

# Edges table (Notes/_schema.md, "Edges" section).
EDGE_DECLARERS = {
    "part_of": {"design-vision", "roadmap", "decision-spec", "issue"},
    "depends_on": {"roadmap", "decision-spec", "issue"},
    "record_of": {"workflow"},
    "superseded_by": {"design-vision"},
}
EDGE_TARGETS = {
    "part_of": {"design-vision", "roadmap", "decision-spec", "issue"},
    "depends_on": {"roadmap", "decision-spec", "issue"},
    "record_of": {"design-vision", "roadmap", "decision-spec", "issue"},
    "superseded_by": {"design-vision"},
}
LIST_EDGE_KEYS = {"part_of", "depends_on", "record_of"}
SCALAR_EDGE_KEYS = {"superseded_by"}

# Text file extensions searched for verified_by evidence.
SOURCE_TEXT_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


@dataclass
class Finding:
    file_id: str
    section: str
    rule: str
    message: str
    severity: str  # "error" | "warning"

    def format(self) -> str:
        return f"{self.file_id}: [{self.section}] {self.message}"


@dataclass
class Doc:
    id: str
    path: Path
    frontmatter: dict | None  # None if unparseable
    parse_error: str | None = None

    @property
    def type(self):
        if self.frontmatter is None:
            return None
        return self.frontmatter.get("type")

    @property
    def status(self):
        if self.frontmatter is None:
            return None
        return self.frontmatter.get("status")

    @property
    def area(self):
        if self.frontmatter is None:
            return None
        return self.frontmatter.get("area")

    @property
    def priority(self):
        if self.frontmatter is None:
            return DEFAULT_PRIORITY
        return self.frontmatter.get("priority", DEFAULT_PRIORITY)

    @property
    def is_underscore(self) -> bool:
        return Path(self.id).name.startswith("_")

    def edge(self, key: str) -> list:
        if self.frontmatter is None:
            return []
        value = self.frontmatter.get(key)
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return [value]

    def is_finished(self) -> bool:
        """True if this document's status is the 'done' state for its type.

        Types without a finished state (design-vision, workflow, commentary,
        technical-reference) are never "finished" in the requires-graph sense.
        """
        finished = FINISHED_STATUS.get(self.type)
        return finished is not None and self.status == finished

    def is_open(self) -> bool:
        """True for roadmap/decision-spec/issue documents that are not yet finished."""
        if self.type not in FINISHED_STATUS:
            return False
        return not self.is_finished()


def to_doc_id(base_dir: Path, raw_path: str, notes_root: Path) -> str:
    """Resolve a path-valued front matter key to a document identity.

    Identity is the path relative to notes_root with forward slashes, resolved lexically
    (no filesystem access) from the declaring file's directory.
    """
    combined = (base_dir / raw_path)
    parts: list[str] = []
    for part in combined.parts:
        if part == ".":
            continue
        if part == "..":
            if parts:
                parts.pop()
            continue
        parts.append(part)
    normalized = Path(*parts) if parts else Path(".")
    try:
        rel = normalized.relative_to(notes_root)
    except ValueError:
        # Outside the notes root entirely -- return a sentinel that will never match a doc id.
        return "OUTSIDE_NOTES:" + str(normalized)
    return str(rel).replace("\\", "/")


def load_corpus(notes_root: Path) -> tuple[dict[str, Doc], list[Finding]]:
    docs: dict[str, Doc] = {}
    findings: list[Finding] = []

    for path in sorted(notes_root.rglob("*.md")):
        rel_parts = path.relative_to(notes_root).parts
        if TEMPLATES_DIRNAME in rel_parts:
            continue
        doc_id = str(path.relative_to(notes_root)).replace("\\", "/")
        try:
            fm = read_frontmatter(path)
        except FrontMatterError as exc:
            docs[doc_id] = Doc(id=doc_id, path=path, frontmatter=None, parse_error=str(exc))
            findings.append(
                Finding(
                    doc_id,
                    "Front Matter",
                    "parse-error",
                    f"front matter could not be parsed: {exc.reason}",
                    "error",
                )
            )
            continue
        if fm is None:
            docs[doc_id] = Doc(id=doc_id, path=path, frontmatter=None, parse_error="missing")
            findings.append(
                Finding(
                    doc_id,
                    "Front Matter",
                    "missing-frontmatter",
                    "no YAML front matter block found",
                    "error",
                )
            )
            continue
        docs[doc_id] = Doc(id=doc_id, path=path, frontmatter=fm)

    return docs, findings


def _source_corpus(source_root: Path) -> str:
    """Every source file's repo-relative path and text, so a filter may be a test's name or its file's path."""
    chunks = []
    for directory, subdirs, files in os.walk(source_root):
        subdirs[:] = [d for d in subdirs if d not in SOURCE_SKIP_DIRS and not d.startswith(".")]
        for name in files:
            path = Path(directory) / name
            if path.suffix.lower() not in SOURCE_TEXT_EXTENSIONS:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            chunks.append(path.relative_to(source_root).as_posix())
            chunks.append(text)
    return "\n".join(chunks)


def check_front_matter(doc: Doc, findings: list[Finding]) -> None:
    fm = doc.frontmatter
    if fm is None:
        return

    unknown = set(fm.keys()) - ALLOWED_KEYS
    for key in sorted(unknown):
        findings.append(
            Finding(doc.id, "Front Matter", "unknown-key", f"unknown front matter key '{key}'", "error")
        )

    missing = REQUIRED_KEYS - set(fm.keys())
    for key in sorted(missing):
        findings.append(
            Finding(doc.id, "Front Matter", "missing-key", f"missing required key '{key}'", "error")
        )

    doc_type = fm.get("type")
    if doc_type is not None and doc_type not in TYPES:
        findings.append(
            Finding(doc.id, "Types", "bad-type", f"unknown type '{doc_type}'", "error")
        )

    area = fm.get("area")
    if area is not None and area not in AREAS:
        findings.append(
            Finding(doc.id, "Front Matter", "bad-area", f"unknown area '{area}'", "error")
        )

    if "priority" in fm and fm["priority"] not in PRIORITIES:
        findings.append(
            Finding(
                doc.id,
                "Front Matter",
                "bad-priority",
                f"priority '{fm['priority']}' is not one of {sorted(PRIORITIES)}",
                "error",
            )
        )

    for key in LIST_EDGE_KEYS:
        if key in fm and not isinstance(fm[key], list):
            findings.append(
                Finding(doc.id, "Front Matter", "bad-value-type", f"'{key}' must be a list", "error")
            )
    for key in SCALAR_EDGE_KEYS:
        if key in fm and not isinstance(fm[key], str):
            findings.append(
                Finding(doc.id, "Front Matter", "bad-value-type", f"'{key}' must be a single path string", "error")
            )


def check_status(doc: Doc, findings: list[Finding]) -> None:
    fm = doc.frontmatter
    if fm is None:
        return
    doc_type = fm.get("type")
    status = fm.get("status")
    if status is None or doc_type not in STATUS_SETS:
        return

    if doc.is_underscore:
        if status != "active":
            findings.append(
                Finding(
                    doc.id,
                    "Types",
                    "underscore-not-active",
                    f"filename begins with '_' so status must be 'active', found '{status}'",
                    "error",
                )
            )
        return

    valid = STATUS_SETS[doc_type]
    if status not in valid:
        findings.append(
            Finding(
                doc.id,
                "Types",
                "bad-status",
                f"status '{status}' is not valid for type '{doc_type}' (expected one of {sorted(valid)})",
                "error",
            )
        )


def check_superseded_by(doc: Doc, docs: dict[str, Doc], findings: list[Finding]) -> None:
    fm = doc.frontmatter
    if fm is None:
        return
    doc_type = fm.get("type")
    status = fm.get("status")
    has_superseded_by = "superseded_by" in fm

    is_superseded_vision = doc_type == "design-vision" and status == "superseded"

    if is_superseded_vision and not has_superseded_by:
        findings.append(
            Finding(
                doc.id,
                "Types",
                "superseded-missing-target",
                "a superseded design-vision requires 'superseded_by'",
                "error",
            )
        )
    if has_superseded_by and not is_superseded_vision:
        findings.append(
            Finding(
                doc.id,
                "Edges",
                "superseded-by-misplaced",
                "'superseded_by' may only be declared on a superseded design-vision",
                "error",
            )
        )


def check_edges_structure(doc: Doc, docs: dict[str, Doc], notes_root: Path, findings: list[Finding]) -> None:
    fm = doc.frontmatter
    if fm is None:
        return
    doc_type = fm.get("type")

    for key in ("part_of", "depends_on", "record_of", "superseded_by"):
        if key not in fm:
            continue
        values = doc.edge(key)

        declarers = EDGE_DECLARERS[key]
        if doc_type is not None and doc_type not in declarers:
            findings.append(
                Finding(
                    doc.id,
                    "Edges",
                    "bad-declarer",
                    f"'{key}' may only be declared by {sorted(declarers)}, not '{doc_type}'",
                    "error",
                )
            )

        for raw_target in values:
            if not isinstance(raw_target, str):
                continue
            target_id = to_doc_id(doc.path.parent, raw_target, notes_root)
            target_doc = docs.get(target_id)
            if target_doc is None:
                findings.append(
                    Finding(
                        doc.id,
                        "Front Matter",
                        "path-does-not-resolve",
                        f"'{key}' path '{raw_target}' does not resolve to a document (resolved to '{target_id}')",
                        "error",
                    )
                )
                continue

            targets_allowed = EDGE_TARGETS[key]
            if target_doc.type is not None and target_doc.type not in targets_allowed:
                findings.append(
                    Finding(
                        doc.id,
                        "Edges",
                        "bad-target-type",
                        f"'{key}' names '{target_id}' of type '{target_doc.type}', expected one of {sorted(targets_allowed)}",
                        "error",
                    )
                )

            if target_doc.type == "design-vision" and target_doc.status == "superseded":
                findings.append(
                    Finding(
                        doc.id,
                        "Edges",
                        "targets-superseded-vision",
                        f"'{key}' names '{target_id}', a superseded design-vision",
                        "error",
                    )
                )


def check_type_specific_rules(doc: Doc, docs: dict[str, Doc], notes_root: Path, findings: list[Finding]) -> None:
    fm = doc.frontmatter
    if fm is None:
        return
    doc_type = fm.get("type")
    status = fm.get("status")

    if doc_type == "design-vision" and status == "speculative":
        for raw_target in doc.edge("part_of"):
            if not isinstance(raw_target, str):
                continue
            target_id = to_doc_id(doc.path.parent, raw_target, notes_root)
            target_doc = docs.get(target_id)
            if target_doc is None or target_doc.type != "design-vision":
                continue
            if target_doc.status != "speculative":
                findings.append(
                    Finding(
                        doc.id,
                        "Types",
                        "speculative-part-of-non-speculative",
                        f"a speculative vision may only be part_of a speculative vision; '{target_id}' is '{target_doc.status}'",
                        "error",
                    )
                )

    if doc_type == "roadmap":
        part_of_targets = []
        for raw_target in doc.edge("part_of"):
            if not isinstance(raw_target, str):
                continue
            target_id = to_doc_id(doc.path.parent, raw_target, notes_root)
            part_of_targets.append(docs.get(target_id))
        has_active_vision = any(
            t is not None and t.type == "design-vision" and t.status == "active" for t in part_of_targets
        )
        if not has_active_vision:
            findings.append(
                Finding(
                    doc.id,
                    "Types",
                    "roadmap-not-part-of-active-vision",
                    "a roadmap must be part_of at least one active design-vision",
                    "error",
                )
            )


def check_completed_components(docs: dict[str, Doc], notes_root: Path, findings: list[Finding]) -> None:
    """A completed roadmap/spec or resolved issue may not have a component spec that isn't completed."""
    # Build reverse index: parent_id -> [component docs that declare part_of parent_id]
    components_of: dict[str, list[Doc]] = {}
    for doc in docs.values():
        for raw_target in doc.edge("part_of"):
            if not isinstance(raw_target, str):
                continue
            target_id = to_doc_id(doc.path.parent, raw_target, notes_root)
            components_of.setdefault(target_id, []).append(doc)

    for doc in docs.values():
        if doc.frontmatter is None:
            continue
        if not (doc.type in ("roadmap", "decision-spec") and doc.status == "completed") and not (
            doc.type == "issue" and doc.status == "resolved"
        ):
            continue
        for component in components_of.get(doc.id, []):
            if component.type != "decision-spec":
                continue
            if component.status != "completed":
                findings.append(
                    Finding(
                        doc.id,
                        "Enforcement and Reports",
                        "unfinished-component",
                        f"is {doc.status} but its component spec '{component.id}' is '{component.status}', not completed",
                        "error",
                    )
                )


def check_verified_by(doc: Doc, source_text_getter, findings: list[Finding]) -> None:
    fm = doc.frontmatter
    if fm is None:
        return
    needs_verified_by = (doc.type == "decision-spec" and doc.status == "completed") or (
        doc.type == "issue" and doc.status == "resolved"
    )
    if not needs_verified_by:
        return

    if "verified_by" not in fm:
        findings.append(
            Finding(
                doc.id,
                "Evidence",
                "verified-by-missing",
                f"a {doc.status} {doc.type} requires 'verified_by' ('[]' is allowed)",
                "error",
            )
        )
        return

    filters = fm["verified_by"]
    if not isinstance(filters, list):
        findings.append(
            Finding(doc.id, "Evidence", "verified-by-not-list", "'verified_by' must be a list", "error")
        )
        return

    source_text = source_text_getter()
    for filt in filters:
        if not isinstance(filt, str):
            continue
        if filt not in source_text:
            findings.append(
                Finding(
                    doc.id,
                    "Evidence",
                    "verified-by-not-found",
                    f"verified_by filter '{filt}' is neither a source file's path nor text in one",
                    "error",
                )
            )


def check_issue_filename(doc: Doc, findings: list[Finding]) -> None:
    fm = doc.frontmatter
    if fm is None:
        return
    filename = Path(doc.id).name
    is_issue_type = fm.get("type") == "issue"
    is_issue_named = filename.startswith("ISSUE-")
    if is_issue_named and not is_issue_type:
        findings.append(
            Finding(
                doc.id,
                "Enforcement and Reports",
                "issue-filename-wrong-type",
                "filename begins with 'ISSUE-' but type is not 'issue'",
                "error",
            )
        )
    if is_issue_type and not is_issue_named:
        findings.append(
            Finding(
                doc.id,
                "Enforcement and Reports",
                "issue-type-wrong-filename",
                "type is 'issue' but filename does not begin with 'ISSUE-'",
                "error",
            )
        )


def check_warnings(doc: Doc, docs: dict[str, Doc], notes_root: Path, findings: list[Finding]) -> None:
    fm = doc.frontmatter
    if fm is None:
        return

    if doc.type == "decision-spec" and doc.status == "implementing":
        for raw_target in doc.edge("depends_on"):
            if not isinstance(raw_target, str):
                continue
            target_id = to_doc_id(doc.path.parent, raw_target, notes_root)
            target_doc = docs.get(target_id)
            if target_doc is not None and target_doc.is_open():
                findings.append(
                    Finding(
                        doc.id,
                        "Enforcement and Reports",
                        "implementing-with-unfinished-dependency",
                        f"is implementing but depends_on '{target_id}' which is not finished",
                        "warning",
                    )
                )

    if doc.type == "decision-spec":
        try:
            line_count = len(doc.path.read_text(encoding="utf-8").splitlines())
        except OSError:
            line_count = 0
        if line_count > 500:
            findings.append(
                Finding(
                    doc.id,
                    "Enforcement and Reports",
                    "spec-too-long",
                    f"decision-spec is {line_count} lines, over the 500-line review threshold",
                    "warning",
                )
            )


def build_requires_graph(docs: dict[str, Doc], notes_root: Path) -> dict[str, set[str]]:
    """requires[A] = set of B such that A "requires" B in the DAG rule sense.

    X depends_on Y contributes X->Y. C part_of P contributes P->C.
    """
    requires: dict[str, set[str]] = {doc_id: set() for doc_id in docs}
    for doc in docs.values():
        for raw_target in doc.edge("depends_on"):
            if not isinstance(raw_target, str):
                continue
            target_id = to_doc_id(doc.path.parent, raw_target, notes_root)
            if target_id in docs:
                requires[doc.id].add(target_id)
        for raw_target in doc.edge("part_of"):
            if not isinstance(raw_target, str):
                continue
            target_id = to_doc_id(doc.path.parent, raw_target, notes_root)
            if target_id in docs:
                # C part_of P -> P requires C
                requires.setdefault(target_id, set()).add(doc.id)
    return requires


def check_cycles(docs: dict[str, Doc], notes_root: Path, findings: list[Finding]) -> dict[str, set[str]]:
    requires = build_requires_graph(docs, notes_root)
    # TopologicalSorter's graph argument maps a node to its predecessors; `requires[A]` (the set
    # of B such that A requires B, i.e. B must finish before A) is exactly that mapping.
    ts = graphlib.TopologicalSorter(requires)
    try:
        list(ts.static_order())
    except graphlib.CycleError as exc:
        cycle = exc.args[1]
        cycle_str = " -> ".join(cycle)
        # Attribute the finding to the first node in the reported cycle.
        findings.append(
            Finding(
                cycle[0] if cycle else "?",
                "Edges",
                "cycle",
                f"the requires graph has a cycle: {cycle_str}",
                "error",
            )
        )
    return requires


def check_arc_registry(notes_root: Path, findings: list[Finding]) -> None:
    """Every arc code and slug appears once in docs/notes/arc-registry.md."""
    path = notes_root / ARC_REGISTRY_NAME
    if not path.is_file():
        return
    seen_codes: dict[str, str] = {}
    seen_slugs: set[str] = set()
    row = re.compile(r"^\|\s*([A-Z]{2,5})\s*\|\s*([a-z0-9-]+)\s*\|")
    for line in path.read_text(encoding="utf-8").splitlines():
        if not (m := row.match(line)):
            continue
        code, slug = m.groups()
        if code in seen_codes:
            findings.append(
                Finding(
                    ARC_REGISTRY_NAME,
                    "Registry",
                    "duplicate-code",
                    f"code {code} is claimed by both {seen_codes[code]} and {slug}",
                    "error",
                )
            )
        if slug in seen_slugs:
            findings.append(
                Finding(ARC_REGISTRY_NAME, "Registry", "duplicate-slug", f"arc {slug} holds two codes", "error")
            )
        seen_codes.setdefault(code, slug)
        seen_slugs.add(slug)


def run_check(notes_root: Path, source_root: Path) -> list[Finding]:
    docs, findings = load_corpus(notes_root)
    check_arc_registry(notes_root, findings)

    for doc in docs.values():
        check_front_matter(doc, findings)
        check_status(doc, findings)
        check_superseded_by(doc, docs, findings)
        check_edges_structure(doc, docs, notes_root, findings)
        check_type_specific_rules(doc, docs, notes_root, findings)
        check_issue_filename(doc, findings)
        check_warnings(doc, docs, notes_root, findings)

    check_completed_components(docs, notes_root, findings)
    check_cycles(docs, notes_root, findings)

    source_cache: dict[str, str] = {}

    def get_source_text() -> str:
        if "text" not in source_cache:
            source_cache["text"] = _source_corpus(source_root)
        return source_cache["text"]

    for doc in docs.values():
        check_verified_by(doc, get_source_text, findings)

    return findings


def print_findings(findings: list[Finding], summary: bool) -> None:
    errors = [f for f in findings if f.severity == "error"]
    warnings = [f for f in findings if f.severity == "warning"]

    if summary:
        counts: dict[str, int] = {}
        for f in findings:
            key = f"[{f.section}] {f.rule} ({f.severity})"
            counts[key] = counts.get(key, 0) + 1
        for key in sorted(counts):
            print(f"{counts[key]:5d}  {key}")
        print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
        return

    for f in sorted(findings, key=lambda x: (x.file_id, x.severity, x.rule)):
        prefix = "ERROR" if f.severity == "error" else "WARNING"
        print(f"{prefix}: {f.format()}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")


def cmd_check(args: argparse.Namespace) -> int:
    notes_root = Path(args.root).resolve() if args.root else DEFAULT_NOTES_ROOT
    source_root = Path(args.source_root).resolve() if args.source_root else DEFAULT_SOURCE_ROOT
    findings = run_check(notes_root, source_root)
    print_findings(findings, args.summary)
    has_errors = any(f.severity == "error" for f in findings)
    return 1 if has_errors else 0


# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------


def journal_docs(docs: dict[str, Doc]) -> list[Doc]:
    return [d for d in docs.values() if d.frontmatter is not None and d.type == "workflow" and "record_of" in d.frontmatter]


def journals_for(doc_id: str, docs: dict[str, Doc], notes_root: Path) -> list[Doc]:
    """Journals recording doc_id, sorted by filename (i.e. doc id) order."""
    result = []
    for j in journal_docs(docs):
        for raw_target in j.edge("record_of"):
            if not isinstance(raw_target, str):
                continue
            target_id = to_doc_id(j.path.parent, raw_target, notes_root)
            if target_id == doc_id:
                result.append(j)
                break
    return sorted(result, key=lambda d: d.id)


def components_index(docs: dict[str, Doc], notes_root: Path) -> dict[str, list[Doc]]:
    """parent_id -> list of docs that declare part_of parent_id."""
    index: dict[str, list[Doc]] = {}
    for doc in docs.values():
        for raw_target in doc.edge("part_of"):
            if not isinstance(raw_target, str):
                continue
            target_id = to_doc_id(doc.path.parent, raw_target, notes_root)
            index.setdefault(target_id, []).append(doc)
    return index


def downstream_counts(docs: dict[str, Doc], requires: dict[str, set[str]]) -> dict[str, int]:
    """downstream_count[D] = number of open roadmap/spec/issue docs that transitively require D."""
    # Reverse graph: reverse[B] = set of A such that A requires B directly.
    reverse: dict[str, set[str]] = {doc_id: set() for doc_id in docs}
    for a, deps in requires.items():
        for b in deps:
            reverse.setdefault(b, set()).add(a)

    counts: dict[str, int] = {}
    for doc_id in docs:
        seen: set[str] = set()
        stack = list(reverse.get(doc_id, ()))
        while stack:
            node = stack.pop()
            if node in seen:
                continue
            seen.add(node)
            stack.extend(reverse.get(node, ()))
        open_ancestors = {n for n in seen if docs[n].is_open()}
        counts[doc_id] = len(open_ancestors)
    return counts


def rank_key(doc: Doc, downstream: dict[str, int]):
    return (PRIORITY_RANK.get(doc.priority, PRIORITY_RANK[DEFAULT_PRIORITY]), -downstream.get(doc.id, 0))


def longest_open_chain(docs: dict[str, Doc], requires: dict[str, set[str]], area: str | None = None) -> list[str]:
    """Longest chain of open roadmap/spec/issue docs in the requires graph, counted in documents."""
    open_ids = {
        doc_id
        for doc_id, doc in docs.items()
        if doc.is_open() and (area is None or doc.area == area)
    }
    sub_edges = {a: {b for b in requires.get(a, ()) if b in open_ids} for a in open_ids}

    memo: dict[str, list[str]] = {}

    def chain_from(node: str, stack: frozenset[str]) -> list[str]:
        if node in memo:
            return memo[node]
        if node in stack:
            return [node]  # guard against cycles that check should already have rejected
        best: list[str] = [node]
        for nxt in sub_edges.get(node, ()):
            candidate = [node] + chain_from(nxt, stack | {node})
            if len(candidate) > len(best):
                best = candidate
        memo[node] = best
        return best

    best_overall: list[str] = []
    for node in sorted(open_ids):
        candidate = chain_from(node, frozenset())
        if len(candidate) > len(best_overall):
            best_overall = candidate
    return best_overall


def build_frontier(docs: dict[str, Doc], requires: dict[str, set[str]], comps: dict[str, list[Doc]]) -> list[Doc]:
    result = []
    for doc in docs.values():
        if doc.type != "decision-spec" or doc.status != "approved":
            continue
        deps = requires.get(doc.id, set())
        unblocked = all(docs[d].is_finished() for d in deps if d in docs)
        has_open_component = any(c.is_open() for c in comps.get(doc.id, []))
        if unblocked and not has_open_component:
            result.append(doc)
    return result


def implementing_view(docs: dict[str, Doc], notes_root: Path) -> list[tuple[Doc, Doc | None]]:
    result = []
    for doc in docs.values():
        if doc.type != "decision-spec" or doc.status != "implementing":
            continue
        js = journals_for(doc.id, docs, notes_root)
        head = js[-1] if js else None
        result.append((doc, head))
    return result


def design_frontier(docs: dict[str, Doc], requires: dict[str, set[str]], comps: dict[str, list[Doc]]):
    proposed_iterating = [
        d for d in docs.values() if d.type in ("roadmap", "decision-spec") and d.status in ("proposed", "iterating")
    ]
    speculative_visions = [d for d in docs.values() if d.type == "design-vision" and d.status == "speculative"]
    active_visions_empty = [
        d
        for d in docs.values()
        if d.type == "design-vision" and d.status == "active" and not comps.get(d.id)
    ]
    exhausted_anchors = []
    for d in docs.values():
        if not (
            (d.type == "design-vision" and d.status == "active") or (d.type == "roadmap" and d.status == "approved")
        ):
            continue
        specs = [c for c in comps.get(d.id, []) if c.type == "decision-spec"]
        if specs and all(s.is_finished() for s in specs):
            exhausted_anchors.append(d)
    open_issues_no_spec = []
    for d in docs.values():
        if d.type != "issue" or d.status != "open":
            continue
        linking_specs = [c for c in comps.get(d.id, []) if c.type == "decision-spec"]
        if not linking_specs:
            open_issues_no_spec.append(d)
    blocked_approved_specs = []
    for d in docs.values():
        if d.type != "decision-spec" or d.status != "approved":
            continue
        for dep_id in requires.get(d.id, set()):
            dep = docs.get(dep_id)
            if dep is not None and dep.status in ("proposed", "iterating"):
                blocked_approved_specs.append(d)
                break
    return {
        "proposed_iterating": proposed_iterating,
        "speculative_visions": speculative_visions,
        "active_visions_empty": active_visions_empty,
        "exhausted_anchors": exhausted_anchors,
        "open_issues_no_spec": open_issues_no_spec,
        "blocked_approved_specs": blocked_approved_specs,
    }


def runway_view(docs: dict[str, Doc], requires, comps) -> dict[str, tuple[int, int]]:
    frontier = build_frontier(docs, requires, comps)
    implementing = [d for d in docs.values() if d.type == "decision-spec" and d.status == "implementing"]
    areas = sorted({d.area for d in docs.values() if d.area})
    out = {}
    for a in areas:
        f_count = len([d for d in frontier if d.area == a])
        i_count = len([d for d in implementing if d.area == a])
        out[a] = (f_count, i_count)
    return out


def arcs_view(docs: dict[str, Doc], notes_root: Path, comps):
    result = []
    for j in journal_docs(docs):
        for raw_target in j.edge("record_of"):
            if not isinstance(raw_target, str):
                continue
            target_id = to_doc_id(j.path.parent, raw_target, notes_root)
            target = docs.get(target_id)
            if target is None:
                continue
            result.append((target, j))
    grouped: dict[str, dict] = {}
    for target, j in result:
        entry = grouped.setdefault(target.id, {"doc": target, "journals": []})
        entry["journals"].append(j)
    for entry in grouped.values():
        entry["journals"].sort(key=lambda d: d.id)
        entry["specs"] = [c for c in comps.get(entry["doc"].id, []) if c.type == "decision-spec"]
    return grouped


def vision_tree(docs: dict[str, Doc], comps, vision_id: str):
    root = docs.get(vision_id)
    if root is None:
        return None, {}

    counts: dict[str, int] = {}

    def walk(doc: Doc, depth: int, lines: list[str]):
        status_key = f"{doc.type}:{doc.status}"
        counts[status_key] = counts.get(status_key, 0) + 1
        lines.append("  " * depth + f"- {doc.id} ({doc.type}, {doc.status})")
        for child in sorted(comps.get(doc.id, []), key=lambda d: d.id):
            walk(child, depth + 1, lines)

    lines: list[str] = []
    walk(root, 0, lines)
    return lines, counts


def stale_status(docs: dict[str, Doc], notes_root: Path, today: datetime.date):
    result = []
    for d in docs.values():
        if d.type != "decision-spec" or d.status != "implementing":
            continue
        js = journals_for(d.id, docs, notes_root)
        freshest = None
        for j in js:
            date_str = j.frontmatter.get("date") if j.frontmatter else None
            if not date_str:
                continue
            try:
                jd = datetime.date.fromisoformat(date_str)
            except ValueError:
                continue
            if freshest is None or jd > freshest:
                freshest = jd
        if freshest is None or (today - freshest).days > 14:
            result.append(d)
    return result


def render_report(notes_root: Path, area: str | None, vision: str | None) -> str:
    docs, _ = load_corpus(notes_root)
    requires = build_requires_graph(docs, notes_root)
    comps = components_index(docs, notes_root)
    downstream = downstream_counts(docs, requires)

    def filt(items):
        if area is None:
            return items
        return [d for d in items if d.area == area]

    lines = ["# Notes Report", ""]

    if vision is not None:
        vision_id = to_doc_id(notes_root, vision, notes_root)
        tree_lines, counts = vision_tree(docs, comps, vision_id)
        lines.append(f"## Vision Tree: {vision_id}")
        if tree_lines is None:
            lines.append("")
            lines.append(f"(no such document: {vision_id})")
        else:
            lines.extend(tree_lines)
            lines.append("")
            lines.append("Counts by status:")
            for key in sorted(counts):
                lines.append(f"- {key}: {counts[key]}")
        return "\n".join(lines) + "\n"

    frontier = sorted(filt(build_frontier(docs, requires, comps)), key=lambda d: rank_key(d, downstream))
    lines.append("## Build Frontier")
    for d in frontier:
        lines.append(f"- {d.id} (priority={d.priority}, downstream={downstream.get(d.id, 0)})")
    if not frontier:
        lines.append("(none)")
    lines.append("")

    impl = implementing_view(docs, notes_root)
    impl = [(d, h) for d, h in impl if area is None or d.area == area]
    impl.sort(key=lambda pair: rank_key(pair[0], downstream))
    lines.append("## Implementing")
    for d, head in impl:
        head_str = head.id if head else "(no journal)"
        lines.append(f"- {d.id} (head journal: {head_str})")
    if not impl:
        lines.append("(none)")
    lines.append("")

    frontier_data = design_frontier(docs, requires, comps)
    lines.append("## Design Frontier")
    lines.append("")
    lines.append("### Proposed and Iterating Roadmaps and Specs")
    for d in sorted(filt(frontier_data["proposed_iterating"]), key=lambda d: rank_key(d, downstream)):
        lines.append(f"- {d.id} ({d.type}, {d.status})")
    if not filt(frontier_data["proposed_iterating"]):
        lines.append("(none)")
    lines.append("")
    lines.append("### Speculative Visions")
    for d in sorted(filt(frontier_data["speculative_visions"]), key=lambda d: d.id):
        lines.append(f"- {d.id}")
    if not filt(frontier_data["speculative_visions"]):
        lines.append("(none)")
    lines.append("")
    lines.append("### Active Visions With Nothing Below")
    for d in sorted(filt(frontier_data["active_visions_empty"]), key=lambda d: d.id):
        lines.append(f"- {d.id}")
    if not filt(frontier_data["active_visions_empty"]):
        lines.append("(none)")
    lines.append("")
    lines.append("### Exhausted Anchors")
    for d in sorted(filt(frontier_data["exhausted_anchors"]), key=lambda d: d.id):
        lines.append(f"- {d.id} ({d.type})")
    if not filt(frontier_data["exhausted_anchors"]):
        lines.append("(none)")
    lines.append("")
    lines.append("### Open Issues With No Spec")
    for d in sorted(filt(frontier_data["open_issues_no_spec"]), key=lambda d: rank_key(d, downstream)):
        lines.append(f"- {d.id}")
    if not filt(frontier_data["open_issues_no_spec"]):
        lines.append("(none)")
    lines.append("")
    lines.append("### Approved Specs Blocked On a Proposed/Iterating Dependency")
    for d in sorted(filt(frontier_data["blocked_approved_specs"]), key=lambda d: rank_key(d, downstream)):
        lines.append(f"- {d.id}")
    if not filt(frontier_data["blocked_approved_specs"]):
        lines.append("(none)")
    lines.append("")

    lines.append("## Runway")
    runway = runway_view(docs, requires, comps)
    for a in sorted(runway):
        if area is not None and a != area:
            continue
        f_count, i_count = runway[a]
        lines.append(f"- {a}: build-frontier={f_count}, implementing={i_count}")
    lines.append("")

    lines.append("## Critical Path")
    if area is None:
        overall_chain = longest_open_chain(docs, requires, area=None)
        lines.append(f"- Overall ({len(overall_chain)} documents): {' -> '.join(overall_chain) if overall_chain else '(none)'}")
    areas_present = sorted({d.area for d in docs.values() if d.area and (area is None or d.area == area)})
    for a in areas_present:
        chain = longest_open_chain(docs, requires, area=a)
        lines.append(f"- {a} ({len(chain)} documents): {' -> '.join(chain) if chain else '(none)'}")
    lines.append("")

    lines.append("## Arcs")
    arcs = arcs_view(docs, notes_root, comps)
    for target_id in sorted(arcs):
        entry = arcs[target_id]
        if area is not None and entry["doc"].area != area:
            continue
        doc = entry["doc"]
        journal_ids = ", ".join(j.id for j in entry["journals"])
        spec_statuses = ", ".join(f"{s.id}={s.status}" for s in entry["specs"]) or "(none)"
        lines.append(f"- {doc.id} ({doc.type}) -- journals: {journal_ids} -- specs: {spec_statuses}")
    if not arcs:
        lines.append("(none)")
    lines.append("")

    lines.append("## Stale Status (implementing, no journal in last 14 days)")
    today = datetime.date.today()
    for d in sorted(filt(stale_status(docs, notes_root, today)), key=lambda d: d.id):
        lines.append(f"- {d.id}")
    if not filt(stale_status(docs, notes_root, today)):
        lines.append("(none)")
    lines.append("")

    return "\n".join(lines) + "\n"


def cmd_report(args: argparse.Namespace) -> int:
    notes_root = Path(args.root).resolve() if args.root else DEFAULT_NOTES_ROOT
    vision_arg = args.vision
    output = render_report(notes_root, args.area, vision_arg)
    print(output)
    return 0


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # a Windows console is cp1252, and note paths and titles are not
    parser = argparse.ArgumentParser(description="Check and report on the docs/notes/ documentation corpus.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    check_parser = subparsers.add_parser("check", help="Validate the corpus against docs/notes/_schema.md")
    check_parser.add_argument("--root", default=None, help="Notes root directory (default: <repo>/docs/notes)")
    check_parser.add_argument(
        "--source-root", default=None, help="Directory searched for verified_by evidence (default: the repo root)"
    )
    check_parser.add_argument("--summary", action="store_true", help="Print counts of errors/warnings grouped by rule")
    check_parser.set_defaults(func=cmd_check)

    report_parser = subparsers.add_parser("report", help="Print the standard report views as markdown to stdout")
    report_parser.add_argument("--root", default=None, help="Notes root directory (default: <repo>/docs/notes)")
    report_parser.add_argument("--area", default=None, help="Filter every view to one area")
    report_parser.add_argument("--vision", default=None, help="Print the vision tree for one vision (path relative to Notes root or cwd)")
    report_parser.set_defaults(func=cmd_report)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
