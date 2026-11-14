"""Tests for the journal tools: python -m unittest test_journal (from this directory)."""

from __future__ import annotations

import csv
import io
import subprocess
import sys
import tempfile
import textwrap
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import journal
import journal_migrate
from journal_format import FormatError, render_amendment, render_entry, wrap_markdown
from journal_model import Journal, ParseContext, numbering, parse_entries

HOUSE_ENTRY = """\
- **466. F98 routes decision 461's roof work through two specs, both `proposed` for the user.**
  - **(C) is rewritten to take items 1 and 2.** As written it cannot hold them: its decision 6 keeps every roof, and
    it never touches the ridge. The lead's proposals for the rewrite:
    - **A Ring contained in a lower Ring's envelope yields no roof of its own,** tested against the lower Ring's own
      composed roof. So the roof stage solves Rings lower first.
  - Neither spec is implemented without the user's approval.
  - **AMENDED by decision 467:** item 3's spec is deferred; only (C)'s rewrite goes ahead."""

FRONT = """\
---
title: "Test Arc: Session {n} Journal"
type: workflow
status: active
---

# Test Arc: Session {n} Journal

{preamble}

## Reading order for a fresh context

1. Read §2 of the previous session.

## 1. The arc's charter

Build the thing.

## 2. State as at bootstrap

- Measured at `abc`.

## 3. Operational manual

Nothing yet.

## 4. Next work

- Do the next thing, then revisit decision 4.

## 5. Open items

1. **First item.**
   - detail
2. **Second item.**
"""

SESSION_1 = FRONT.format(n=1, preamble="**This is the head of the thread**, the arc's first session.") + """
## 6. An interview (decision 1)

1. **Not an entry: this section is not an entry section.**

## Decisions

1. **An old-layout decision.** Its body.
2. **SUPERSEDED by decision 5.** Another.
   - nested
1. **A nested list item that repeats 1.**
**4 — A dash-layout decision.** Body.
### A group heading
Orphan text under the heading.

## Findings

- F1. **An old-layout finding.** Body.
- **F2 — A dash finding.**
3. **A bare number continuing the finding series.**
- **I3. A prefix outside the whitelist.**
"""

SESSION_2 = FRONT.format(n=2, preamble=(
    "**This is the head of the thread**, continuing [session 1](test-arc-journal-01.md). Decisions continue at 5 "
    "and findings at F4.")) + """
## Decisions

- **5. A new-layout decision,** with a tail.
  - a sub-bullet
- **F4. A finding filed under decisions.**
- **4. Below the declared start, so a nested item.**

## Findings

- **F5. A new-layout finding.**
- **F2. A finding number repeated from session 1.**
"""

BLOCK_ARC = """\
---
title: "Block Arc: Session 1 Journal"
type: workflow
status: active
---

# Block Arc: Session 1 Journal

**This is the head of the thread**, the arc's first session.

## Decisions

- **N7-1. A block decision.**
- **N7-2. Another block decision.**

## Findings

- **F-N7-1. A block finding.**
"""

REGISTRY = """\
---
title: "Arc Code Registry"
type: technical-reference
status: active
---

# Arc Code Registry

| Code | Slug | Directory | Claimed | Status |
|---|---|---|---|---|
| TA | test-arc | . | 2026-11-01 | active |
| BK | blk-arc | . | 2026-10-01 | active |
| NW | new-work | . | 2026-11-07 | active |
"""

# A hand-closed first session and a head whose bold claim runs on, as this repo's building-shell arc wrote them.
HAND_1 = """\
---
title: "Hand Arc: Session 1 Journal"
type: workflow
status: active
---

# Hand arc: session 1 journal

**This is no longer the head of the thread**: the head is [session 2](./hand-arc-journal-02.md), where decisions
continue at 43 and findings at F2.

## Decisions

41. **A decision below the successor's start.**
42. **Another.**

## Findings

- F1. **A finding.**
"""

HAND_2 = """\
---
title: "Hand Arc: Session 2 Journal"
type: workflow
status: active
---

# Hand arc: session 2 journal

**This is the head of the thread until session 3 opens its own journal**, continuing
[session 1](./hand-arc-journal.md).

## 2. State as at bootstrap

- Measured.

## Decisions

43. **A third.**

## Findings
"""


def make_repo(root: Path) -> Path:
    meta = root / "docs" / "notes"
    meta.mkdir(parents=True)
    for name, text in [("test-arc-journal-01.md", SESSION_1), ("test-arc-journal-02.md", SESSION_2),
                       ("blk-arc-journal-01.md", BLOCK_ARC), ("arc-registry.md", REGISTRY)]:
        (meta / name).write_text(text, encoding="utf-8", newline="\n")
    return meta


def run(root: Path, *argv: str, stdin: str | None = None, arc: str | None = "test-arc", meta: Path | None = None):
    out = io.StringIO()
    saved = sys.stdin
    prefix = ["--root", str(root), "--date", "2026-11-07"]
    if arc:
        prefix += ["--arc", arc]
    if meta:
        prefix += ["--meta", str(meta)]
    try:
        sys.stdin = io.TextIOWrapper(io.BytesIO((stdin or "").encode("utf-8")), encoding="utf-8")
        with redirect_stdout(out), redirect_stderr(out):
            code = journal.main(prefix + list(argv))
    finally:
        sys.stdin = saved
    return code, out.getvalue()


class RepoCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.meta = make_repo(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def journal(self, name: str) -> Journal:
        return Journal.load(self.meta / name)

    def migrate(self) -> Path:
        out = self.root / "proposed"
        with redirect_stdout(io.StringIO()):
            journal_migrate.main([str(self.meta), "--out", str(out), "--date", "2026-11-07"])
        return out / "docs" / "notes"


# -- formatting ---------------------------------------------------------------------------------------------------


class WrapTests(unittest.TestCase):
    def test_rewrap_keeps_words_and_nesting(self):
        lines = HOUSE_ENTRY.split("\n")
        wrapped = wrap_markdown(lines)
        self.assertEqual(" ".join(wrapped).split(), " ".join(lines).split())
        self.assertTrue(all(len(line) <= 120 for line in wrapped))

        def bullets(block):
            return [l[: l.index("- ") + 2] for l in block if l.lstrip().startswith("- ")]

        self.assertEqual(bullets(wrapped), bullets(lines))

    def test_rewrap_is_idempotent(self):
        once = wrap_markdown(HOUSE_ENTRY.split("\n"))
        self.assertEqual(wrap_markdown(once), once)

    def test_code_span_is_never_split(self):
        for line in wrap_markdown(["x " * 52 + "`journal.py set state` end"]):
            self.assertEqual(line.count("`") % 2, 0, line)

    def test_continuation_never_opens_a_list(self):
        for line in wrap_markdown(["word " * 22 + "see - and 1. and # here"])[1:]:
            self.assertNotRegex(line, r"^\s*(?:[-*+#]|\d+\.)\s")


class RenderTests(unittest.TestCase):
    def test_id_goes_inside_an_authored_bold_claim(self):
        self.assertEqual(render_entry("12", "**The claim.** The rest."), ["- **12. The claim.** The rest."])

    def test_plain_first_line_becomes_the_bold_claim(self):
        self.assertEqual(render_entry("F4", "A claim."), ["- **F4. A claim.**"])

    def test_attribution_and_source(self):
        lines = render_entry("5", "**Ruled.** Body.", "The user, 2026-11-07: ", "a delegate")
        self.assertEqual(lines, ["- **5. The user, 2026-11-07: Ruled.** (a delegate) Body."])

    def test_bold_later_in_the_line_is_refused(self):
        with self.assertRaises(FormatError):
            render_entry("7", "Claim with **bold** inside.")

    def test_amendment(self):
        self.assertEqual(render_amendment("AMENDED", "decision 9", "why."), ["  - **AMENDED by decision 9:** why."])


# -- parsing (survey section 2, items 1 to 9) ---------------------------------------------------------------------


class ParserTests(RepoCase):
    def arc(self):
        return journal.Corpus.load(self.meta).arcs["test-arc"]

    def test_layouts_kinds_and_fakes(self):
        s1, s2 = self.arc().load_all()
        self.assertEqual([(e.kind, e.label) for e in s1.entries()],
                         [("D", "1"), ("D", "2"), ("D", "4"), ("F", "F1"), ("F", "F2"), ("F", "3")])
        self.assertEqual([(e.kind, e.label) for e in s2.entries()],
                         [("D", "5"), ("F", "F4"), ("F", "F5"), ("F", "F2")])

    def test_dash_claim(self):
        s1 = self.arc().load_all()[0]
        self.assertEqual(s1.entries()[2].claim(), "A dash-layout decision.")

    def test_heading_ends_an_entry(self):
        s1 = self.arc().load_all()[0]
        self.assertNotIn("Orphan text under the heading.", s1.entries()[2].lines)

    def test_dropped_and_ignored_are_recorded(self):
        arc = self.arc()
        arc.load_all()
        dropped = [text for _, _, text in arc.context.dropped]
        self.assertTrue(any("repeats 1" in t for t in dropped))
        self.assertTrue(any("Below the declared start" in t for t in dropped))
        self.assertTrue(any("I3." in t for _, _, t in arc.context.ignored))

    def test_misfiled_finding_keeps_its_kind(self):
        s2 = self.arc().load_all()[1]
        self.assertEqual((s2.entries()[1].kind, s2.entries()[1].section_kind), ("F", "D"))

    def test_bare_findings_in_an_arc_without_f_prefix(self):
        path = self.meta / "plain-journal-01.md"
        path.write_text("# P\n\n## Findings\n\n1. **One.**\n2. **Two.**\n", encoding="utf-8")
        entries = parse_entries(Journal.load(path), ParseContext(has_f_prefix=False))
        self.assertEqual([e.kind for e in entries], ["F", "F"])

    def test_numbering_takes_the_maximum_over_every_section(self):
        nums = numbering(self.arc().load_all())
        self.assertEqual((nums.decision_id(), nums.finding_id()), ("6", "F6"))

    def test_block_ids(self):
        blk = journal.Corpus.load(self.meta).arcs["blk-arc"].load_all()[0]
        self.assertEqual([(e.kind, e.label) for e in blk.entries()], [("D", "N7-1"), ("D", "N7-2"), ("F", "F-N7-1")])


# -- the id table and resolution ----------------------------------------------------------------------------------


class ResolutionTests(RepoCase):
    def test_canonical_located_and_bare_forms(self):
        code, out = run(self.root, "show", "TA.D4", "TA1.D4", "4")
        self.assertEqual(code, 0, out)
        self.assertEqual(out.count("== TA1.D4 = TA.D4"), 3)

    def test_a_repeated_number_is_ambiguous_without_the_table(self):
        code, out = run(self.root, "show", "TA.F2")
        self.assertEqual(code, 1)
        self.assertIn("ambiguous; name the session: TA1.F2, TA2.F2", out)

    def test_the_table_renumbers_the_repeat(self):
        meta = self.migrate()
        code, out = run(self.root, "show", "TA.F2", "TA.F6", "TA2.F2", meta=meta)
        self.assertEqual(code, 0, out)
        self.assertIn("== TA1.F2 = TA.F2", out)
        self.assertEqual(out.count("== TA2.F2 = TA.F6"), 2)

    def test_next_numbers_clear_the_table(self):
        meta = self.migrate()
        code, out = run(self.root, "finding", "--text", "**New.**", meta=meta)
        self.assertEqual(code, 0, out)
        self.assertIn("TA.F7 ->", out)

    def test_migration_rows_and_exceptions(self):
        meta = self.migrate()
        with (meta / "journal-ids.csv").open(encoding="utf-8", newline="") as handle:
            rows = {r["id"]: (r["file"], r["label"], r["occurrence"]) for r in csv.DictReader(handle)}
        self.assertEqual(rows["TA.F6"], ("test-arc-journal-02.md", "F2", "1"))
        self.assertEqual(rows["BK.D2"], ("blk-arc-journal-01.md", "N7-2", "1"))
        self.assertEqual(rows["BK.F1"], ("blk-arc-journal-01.md", "F-N7-1", "1"))
        self.assertEqual(len(rows), 13)
        report = (meta.parent.parent / "journal-id-exceptions.md").read_text(encoding="utf-8")
        self.assertIn("## Renumbered (4)", report)
        self.assertIn("## Dropped as nested-list items (2)", report)


# -- writing ------------------------------------------------------------------------------------------------------


class WriteTests(RepoCase):
    def test_decision_expands_shorthand(self):
        code, out = run(self.root, "decision", "--user", stdin="**Ruled.** See @D4 and @BK.F1.")
        self.assertEqual(code, 0, out)
        text = (self.meta / "test-arc-journal-02.md").read_text(encoding="utf-8")
        self.assertIn("- **6. The user, 2026-11-07: Ruled.** See TA.D4 and BK.F1.", text)

    def test_unregistered_code_is_refused(self):
        code, out = run(self.root, "decision", "--text", "**X.** @ZZ.D1")
        self.assertEqual(code, 2)
        self.assertIn("no arc is registered as ZZ", out)

    def test_amend_by_full_id_lands_where_the_entry_stands(self):
        code, out = run(self.root, "amend", "TA.D1", "withdrawn", "--by", "@F4", "--text", "gone.")
        self.assertEqual(code, 0, out)
        self.assertIn("  - **WITHDRAWN by finding TA.F4:** gone.",
                      (self.meta / "test-arc-journal-01.md").read_text(encoding="utf-8"))

    def test_append_numbers_an_ordered_item(self):
        code, out = run(self.root, "append", "open", "--text", "#. **Third item.**")
        self.assertEqual(code, 0, out)
        self.assertIn("3. **Third item.**", (self.meta / "test-arc-journal-02.md").read_text(encoding="utf-8"))


class LiftTests(RepoCase):
    def test_lift_moves_the_entry_and_resolution_follows(self):
        code, out = run(self.root, "lift", "TA.D5", "--to", "docs/notes/meta-ledger.md")
        self.assertEqual(code, 0, out)
        ledger = (self.meta / "meta-ledger.md").read_text(encoding="utf-8")
        self.assertIn("- **TA.D5. A new-layout decision,** with a tail.", ledger)
        self.assertIn("  - *Origin:* [session 2](test-arc-journal-02.md), lifted 2026-11-07.", ledger)
        self.assertIn("  - a sub-bullet", ledger)
        stub = (self.meta / "test-arc-journal-02.md").read_text(encoding="utf-8")
        self.assertIn("LIFTED to [meta-ledger.md](meta-ledger.md) on 2026-11-07** as TA.D5", stub)
        self.assertNotIn("  - a sub-bullet", stub)
        code, out = run(self.root, "show", "TA.D5")
        self.assertIn("(lifted: docs/notes/meta-ledger.md", out)

    def test_a_superseded_entry_needs_force(self):
        code, out = run(self.root, "lift", "TA.D2", "--to", "docs/notes/meta-ledger.md")
        self.assertEqual(code, 2)
        self.assertIn("SUPERSEDED", out)
        code, out = run(self.root, "lift", "TA.D2", "--to", "docs/notes/meta-ledger.md", "--force")
        self.assertEqual(code, 0, out)


class ReadTests(RepoCase):
    def test_refs_exact_and_approximate(self):
        skills = self.root / ".claude" / "skills" / "x"
        skills.mkdir(parents=True)
        (skills / "SKILL.md").write_text("Cites TA.D4.\n", encoding="utf-8")
        (self.meta / "other.md").write_text("---\n---\nSee TA1.D4 here.\n", encoding="utf-8")
        code, out = run(self.root, "refs", "TA.D4")
        self.assertEqual(code, 0, out)
        self.assertIn(".claude/skills/x/SKILL.md:1", out)
        self.assertIn("docs/notes/other.md:3", out)
        self.assertIn("revisit decision 4", out)
        self.assertIn("2 exact", out)

    def test_verify(self):
        code, out = run(self.root, "verify")
        self.assertIn("test-arc-journal-01.md still claims to be the head", out)
        self.assertIn("D gaps: 3", out)
        self.assertIn("F2 unresolved duplicate: TA1.F2, TA2.F2", out)

    def test_index_prints_canonical_ids(self):
        code, out = run(self.root, "index", "--all")
        self.assertIn("TA.D4  s1", out)
        self.assertIn("[SUPERSEDED by 5]", out)


class OpenTests(RepoCase):
    def test_open_moves_the_head(self):
        code, out = run(self.root, "open", "--reason", "a compaction")
        self.assertEqual(code, 0, out)
        new = " ".join((self.meta / "test-arc-journal-03.md").read_text(encoding="utf-8").split())
        self.assertIn("Decisions continue at 6 and findings at F6, cited project-wide as TA.D6 and TA.F6.", new)
        self.assertIn("Do the next thing", new)
        self.assertIn("**Not yet measured.**", new)
        old = " ".join((self.meta / "test-arc-journal-02.md").read_text(encoding="utf-8").split())
        self.assertIn("**Superseded as head by [session 3](./test-arc-journal-03.md),** closed at a compaction", old)

    def test_open_closes_a_run_on_head_claim_and_keeps_the_title_case(self):
        (self.meta / "hand-arc-journal.md").write_text(HAND_1, encoding="utf-8", newline="\n")
        (self.meta / "hand-arc-journal-02.md").write_text(HAND_2, encoding="utf-8", newline="\n")
        with (self.meta / "arc-registry.md").open("a", encoding="utf-8", newline="\n") as handle:
            handle.write("| HA | hand-arc | . | 2026-11-01 | active |\n")
        code, out = run(self.root, "index", "--all", arc="hand-arc")
        self.assertIn("HA.D41  s1", out)  # session 1's "continue at 43" names its successor's start, not its own
        code, out = run(self.root, "open", arc="hand-arc")
        self.assertEqual(code, 0, out)
        self.assertNotIn("warning", out)
        new = (self.meta / "hand-arc-journal-03.md").read_text(encoding="utf-8")
        self.assertIn('title: "Hand Arc: Session 3 Journal"', new)
        self.assertIn("# Hand arc: session 3 journal", new)
        self.assertIn("Decisions continue at 44 and findings at F2", " ".join(new.split()))
        old = (self.meta / "hand-arc-journal-02.md").read_text(encoding="utf-8")
        self.assertIn("**Superseded as head by [session 3](./hand-arc-journal-03.md),**", old)
        code, out = run(self.root, "verify", arc="hand-arc")
        self.assertIn("0 stale heads", out)

    def test_open_refuses_an_unregistered_arc(self):
        (self.meta / "loose-journal-01.md").write_text(SESSION_1, encoding="utf-8")
        code, out = run(self.root, "open", arc="loose")
        self.assertEqual(code, 2)
        self.assertIn("claim a code first", out)

    def test_open_new_arc(self):
        code, out = run(self.root, "open", "--new", "new-work", "--title", "New Work", "--area", "meta", arc=None)
        self.assertEqual(code, 0, out)
        text = " ".join((self.meta / "new-work-journal-01.md").read_text(encoding="utf-8").split())
        self.assertIn("cited project-wide as NW.D1 and NW.F1", text)
        code, out = run(self.root, "open", "--new", "unclaimed", "--title", "U", "--area", "meta", arc=None)
        self.assertEqual(code, 2)
        self.assertIn("area: meta", (self.meta / "new-work-journal-01.md").read_text(encoding="utf-8"))


# -- claiming, in a throwaway git repo ----------------------------------------------------------------------------


def git(repo: Path, *argv: str) -> str:
    return subprocess.run(["git", *argv], cwd=repo, capture_output=True, text=True, check=True).stdout.strip()


class ClaimTests(RepoCase):
    def setUp(self):
        super().setUp()
        self.repo = self.root
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.name", "Test")
        git(self.repo, "config", "user.email", "test@example.com")
        git(self.repo, "config", "core.autocrlf", "false")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", "seed")
        git(self.repo, "switch", "-q", "-c", "feature/arc-work")

    def test_claim_merges_the_row_into_main(self):
        code, out = run(self.repo, "claim", "fresh-arc", "FA", "--dir", "meta", "--trailer", "Co-Authored-By: X",
                        arc=None)
        self.assertEqual(code, 0, out)
        self.assertIn("| FA | fresh-arc | meta | 2026-11-07 | active |",
                      git(self.repo, "show", "main:docs/notes/arc-registry.md"))
        self.assertEqual(git(self.repo, "log", "main", "-1", "--format=%s"),
                         "Merge docs/claim-arc-fresh-arc: claim arc code FA for fresh-arc")
        self.assertIn("Co-Authored-By: X", git(self.repo, "log", "main", "-1", "--format=%b"))
        self.assertEqual(git(self.repo, "branch", "--list", "docs/claim-arc-fresh-arc"), "")
        self.assertEqual(git(self.repo, "branch", "--show-current"), "feature/arc-work")
        self.assertIn("| FA |", (self.meta / "arc-registry.md").read_text(encoding="utf-8"))

    def test_a_taken_code_is_refused(self):
        code, out = run(self.repo, "claim", "other-arc", "TA", arc=None)
        self.assertEqual(code, 2)
        self.assertIn("TA is taken by test-arc", out)

    def test_main_held_elsewhere_prints_the_commands(self):
        git(self.repo, "worktree", "add", "-q", str(self.root.parent / (self.root.name + "-wt")), "main")
        try:
            code, out = run(self.repo, "claim", "fresh-arc", "FA", arc=None)
            self.assertEqual(code, 1)
            self.assertIn("git switch main was refused", out)
            self.assertIn("git merge --no-ff docs/claim-arc-fresh-arc", out)
            self.assertEqual(git(self.repo, "branch", "--show-current"), "feature/arc-work")
            self.assertEqual(git(self.repo, "branch", "--list", "docs/claim-arc-fresh-arc"), "")
            self.assertNotIn("| FA |", git(self.repo, "show", "main:docs/notes/arc-registry.md"))
            self.assertEqual(git(self.repo, "status", "--porcelain"), "")
        finally:
            git(self.repo, "worktree", "remove", "--force", str(self.root.parent / (self.root.name + "-wt")))


if __name__ == "__main__":
    unittest.main()
