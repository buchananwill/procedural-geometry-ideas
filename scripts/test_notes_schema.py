#!/usr/bin/env python3
"""Tests for notes_schema.py.

Each error-class test builds a tiny fixture corpus in a temp directory and asserts that
check's underlying run_check() reports the expected rule. Vendored with notes_schema.py from the
Piste Perfect project, where every such test was convicted by mutation: the rule was disabled, the
test was seen to fail, and the rule was restored.

Run with: python -m unittest test_notes_schema (from this directory).
"""

import tempfile
import unittest
from pathlib import Path

import yaml

import notes_schema
from notes_schema import (
    build_requires_graph,
    components_index,
    design_frontier,
    downstream_counts,
    longest_open_chain,
    load_corpus,
    run_check,
    build_frontier,
)


def fm_text(data: dict, body: str = "# Body\n") -> str:
    """Render a front matter dict plus a body into full markdown text."""
    return "---\n" + yaml.safe_dump(data, sort_keys=False) + "---\n\n" + body


def base_fields(**overrides) -> dict:
    data = {
        "title": "Sample Title",
        "type": "decision-spec",
        "area": "meta",
        "status": "proposed",
        "date": "2026-01-01",
    }
    data.update(overrides)
    return data


class NotesFixtureCase(unittest.TestCase):
    """Base class providing a scratch Notes/ (and optional Source/) corpus per test."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp_path = Path(self._tmp.name)
        self.notes_root = self.tmp_path / "Notes"
        self.notes_root.mkdir()
        self.source_root = self.tmp_path / "Source"
        self.source_root.mkdir()

    def write(self, rel_path: str, content: str) -> Path:
        p = self.notes_root / rel_path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return p

    def write_source(self, rel_path: str, content: str) -> Path:
        p = self.source_root / rel_path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return p

    def check(self):
        return run_check(self.notes_root, self.source_root)

    def assertRule(self, findings, rule, severity="error", section=None):
        matches = [f for f in findings if f.rule == rule and f.severity == severity]
        if section is not None:
            matches = [f for f in matches if f.section == section]
        self.assertTrue(
            matches,
            f"expected a {severity} with rule '{rule}'"
            + (f" in section '{section}'" if section else "")
            + f", got: {[(f.section, f.rule, f.severity, f.message) for f in findings]}",
        )

    def assertNoRule(self, findings, rule):
        matches = [f for f in findings if f.rule == rule]
        self.assertFalse(matches, f"did not expect rule '{rule}', got: {matches}")


# ---------------------------------------------------------------------------
# Front Matter
# ---------------------------------------------------------------------------


class TestFrontMatterRules(NotesFixtureCase):
    def test_unknown_key(self):
        self.write("doc.md", fm_text(base_fields(nonsense_key="oops")))
        self.assertRule(self.check(), "unknown-key", section="Front Matter")

    def test_missing_key(self):
        data = base_fields()
        del data["date"]
        self.write("doc.md", fm_text(data))
        self.assertRule(self.check(), "missing-key", section="Front Matter")

    def test_bad_area(self):
        self.write("doc.md", fm_text(base_fields(area="not-a-real-area")))
        self.assertRule(self.check(), "bad-area", section="Front Matter")

    def test_bad_priority(self):
        self.write("doc.md", fm_text(base_fields(priority="urgent")))
        self.assertRule(self.check(), "bad-priority", section="Front Matter")

    def test_path_does_not_resolve(self):
        self.write(
            "doc.md",
            fm_text(base_fields(type="decision-spec", status="proposed", part_of=["nowhere.md"])),
        )
        self.assertRule(self.check(), "path-does-not-resolve", section="Front Matter")

    def test_bad_value_type(self):
        # part_of must be a list; give it a bare scalar instead.
        self.write(
            "doc.md",
            fm_text(base_fields(type="decision-spec", status="proposed", part_of="not-a-list.md")),
        )
        self.assertRule(self.check(), "bad-value-type", section="Front Matter")

    def test_parse_error(self):
        self.write("doc.md", "---\ntitle: [unclosed flow sequence\nstatus: proposed\n---\n\nBody\n")
        self.assertRule(self.check(), "parse-error", section="Front Matter")

    def test_missing_frontmatter(self):
        self.write("doc.md", "# Just a heading\n\nNo front matter at all.\n")
        self.assertRule(self.check(), "missing-frontmatter", section="Front Matter")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class TestTypeRules(NotesFixtureCase):
    def test_bad_type(self):
        self.write("doc.md", fm_text(base_fields(type="not-a-type")))
        self.assertRule(self.check(), "bad-type", section="Types")

    def test_bad_status(self):
        self.write("doc.md", fm_text(base_fields(type="design-vision", status="draft")))
        self.assertRule(self.check(), "bad-status", section="Types")

    def test_underscore_not_active(self):
        self.write(
            "_index.md",
            fm_text(base_fields(type="design-vision", status="speculative")),
        )
        self.assertRule(self.check(), "underscore-not-active", section="Types")

    def test_superseded_missing_target(self):
        self.write(
            "vision.md",
            fm_text(base_fields(type="design-vision", status="superseded")),
        )
        self.assertRule(self.check(), "superseded-missing-target", section="Types")

    def test_speculative_part_of_non_speculative(self):
        self.write(
            "active-vision.md",
            fm_text(base_fields(type="design-vision", status="active")),
        )
        self.write(
            "spec-vision.md",
            fm_text(
                base_fields(
                    type="design-vision", status="speculative", part_of=["active-vision.md"]
                )
            ),
        )
        self.assertRule(self.check(), "speculative-part-of-non-speculative", section="Types")

    def test_roadmap_not_part_of_active_vision(self):
        self.write(
            "vision.md",
            fm_text(base_fields(type="design-vision", status="speculative")),
        )
        self.write(
            "roadmap.md",
            fm_text(
                base_fields(type="roadmap", status="proposed", part_of=["vision.md"])
            ),
        )
        self.assertRule(self.check(), "roadmap-not-part-of-active-vision", section="Types")


# ---------------------------------------------------------------------------
# Edges
# ---------------------------------------------------------------------------


class TestEdgeRules(NotesFixtureCase):
    def test_superseded_by_misplaced(self):
        self.write(
            "vision-b.md",
            fm_text(base_fields(type="design-vision", status="active")),
        )
        self.write(
            "vision-a.md",
            fm_text(
                base_fields(type="design-vision", status="active", superseded_by="vision-b.md")
            ),
        )
        self.assertRule(self.check(), "superseded-by-misplaced", section="Edges")

    def test_bad_declarer(self):
        self.write(
            "roadmap.md",
            fm_text(base_fields(type="roadmap", status="proposed")),
        )
        # depends_on may only be declared by roadmap, decision-spec, issue -- not design-vision.
        self.write(
            "vision.md",
            fm_text(
                base_fields(type="design-vision", status="active", depends_on=["roadmap.md"])
            ),
        )
        self.assertRule(self.check(), "bad-declarer", section="Edges")

    def test_bad_target_type(self):
        self.write(
            "journal.md",
            fm_text(base_fields(type="workflow", status="active")),
        )
        # part_of may not name a workflow document.
        self.write(
            "roadmap.md",
            fm_text(
                base_fields(type="roadmap", status="proposed", part_of=["journal.md"])
            ),
        )
        self.assertRule(self.check(), "bad-target-type", section="Edges")

    def test_targets_superseded_vision(self):
        self.write(
            "vision-b.md",
            fm_text(base_fields(type="design-vision", status="active")),
        )
        self.write(
            "vision-a.md",
            fm_text(
                base_fields(type="design-vision", status="superseded", superseded_by="vision-b.md")
            ),
        )
        self.write(
            "roadmap.md",
            fm_text(
                base_fields(type="roadmap", status="proposed", part_of=["vision-a.md"])
            ),
        )
        self.assertRule(self.check(), "targets-superseded-vision", section="Edges")

    def test_cycle(self):
        # A part_of B and A depends_on B -> B requires A (part_of) and A requires B (depends_on).
        self.write(
            "vision.md",
            fm_text(base_fields(type="design-vision", status="active")),
        )
        self.write(
            "spec-b.md",
            fm_text(
                base_fields(
                    title="Spec B",
                    type="decision-spec",
                    status="proposed",
                    part_of=["vision.md"],
                )
            ),
        )
        self.write(
            "spec-a.md",
            fm_text(
                base_fields(
                    title="Spec A",
                    type="decision-spec",
                    status="proposed",
                    part_of=["spec-b.md"],
                    depends_on=["spec-b.md"],
                )
            ),
        )
        self.assertRule(self.check(), "cycle", section="Edges")


# ---------------------------------------------------------------------------
# Enforcement and Reports
# ---------------------------------------------------------------------------


class TestEnforcementRules(NotesFixtureCase):
    def test_unfinished_component(self):
        self.write(
            "vision.md",
            fm_text(base_fields(type="design-vision", status="active")),
        )
        self.write(
            "roadmap.md",
            fm_text(
                base_fields(
                    title="Roadmap",
                    type="roadmap",
                    status="completed",
                    part_of=["vision.md"],
                )
            ),
        )
        self.write(
            "spec.md",
            fm_text(
                base_fields(
                    title="Spec",
                    type="decision-spec",
                    status="proposed",
                    part_of=["roadmap.md"],
                )
            ),
        )
        self.assertRule(self.check(), "unfinished-component", section="Enforcement and Reports")

    def test_issue_filename_wrong_type(self):
        self.write(
            "ISSUE-something.md",
            fm_text(base_fields(title="Not really an issue", type="workflow", status="active")),
        )
        self.assertRule(self.check(), "issue-filename-wrong-type", section="Enforcement and Reports")

    def test_issue_type_wrong_filename(self):
        self.write(
            "misnamed.md",
            fm_text(base_fields(title="An issue", type="issue", status="open")),
        )
        self.assertRule(self.check(), "issue-type-wrong-filename", section="Enforcement and Reports")

    def test_warning_spec_too_long(self):
        body = "# Body\n\n" + ("Line of text.\n" * 501)
        self.write("long-spec.md", fm_text(base_fields(status="proposed"), body=body))
        self.assertRule(self.check(), "spec-too-long", severity="warning", section="Enforcement and Reports")

    def test_warning_unfinished_dependency(self):
        self.write(
            "dep-spec.md",
            fm_text(base_fields(title="Dependency", type="decision-spec", status="proposed")),
        )
        self.write(
            "impl-spec.md",
            fm_text(
                base_fields(
                    title="Implementing",
                    type="decision-spec",
                    status="implementing",
                    depends_on=["dep-spec.md"],
                )
            ),
        )
        self.assertRule(
            self.check(),
            "implementing-with-unfinished-dependency",
            severity="warning",
            section="Enforcement and Reports",
        )


# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------


class TestEvidenceRules(NotesFixtureCase):
    def test_verified_by_missing(self):
        self.write(
            "spec.md",
            fm_text(base_fields(type="decision-spec", status="completed")),
        )
        self.assertRule(self.check(), "verified-by-missing", section="Evidence")

    def test_verified_by_not_found(self):
        self.write(
            "spec.md",
            fm_text(
                base_fields(
                    type="decision-spec",
                    status="completed",
                    verified_by=["Resort.Nothing.Matches"],
                )
            ),
        )
        self.write_source("some-file.test.ts", "// nothing relevant here\n")
        self.assertRule(self.check(), "verified-by-not-found", section="Evidence")

    def test_verified_by_found_no_error(self):
        self.write(
            "spec.md",
            fm_text(
                base_fields(
                    type="decision-spec",
                    status="completed",
                    verified_by=["Resort.Meta.Sample"],
                )
            ),
        )
        self.write_source("some-file.test.ts", '"Resort.Meta.Sample"\n')
        self.assertNoRule(self.check(), "verified-by-not-found")

    def test_verified_by_may_name_a_test_file_and_skips_node_modules(self):
        self.write(
            "spec.md",
            fm_text(
                base_fields(
                    type="decision-spec",
                    status="completed",
                    verified_by=["packages/core/tests/sample.test.ts", "OnlyInNodeModules"],
                )
            ),
        )
        self.write_source("packages/core/tests/sample.test.ts", "// nothing relevant here\n")
        self.write_source("node_modules/dep/index.js", "OnlyInNodeModules\n")
        messages = [f.message for f in self.check() if f.rule == "verified-by-not-found"]
        self.assertEqual(len(messages), 1, messages)
        self.assertIn("OnlyInNodeModules", messages[0])


# ---------------------------------------------------------------------------
# Clean corpus
# ---------------------------------------------------------------------------


class TestCleanCorpus(NotesFixtureCase):
    def test_clean_corpus_has_no_errors(self):
        self.write(
            "vision.md",
            fm_text(base_fields(title="A Vision", type="design-vision", status="active")),
        )
        self.write(
            "roadmap.md",
            fm_text(
                base_fields(
                    title="A Roadmap", type="roadmap", status="proposed", part_of=["vision.md"]
                )
            ),
        )
        self.write(
            "spec-open.md",
            fm_text(
                base_fields(
                    title="Open Spec",
                    type="decision-spec",
                    status="approved",
                    part_of=["roadmap.md"],
                )
            ),
        )
        self.write(
            "spec-done.md",
            fm_text(
                base_fields(
                    title="Done Spec",
                    type="decision-spec",
                    status="completed",
                    part_of=["roadmap.md"],
                    verified_by=["Resort.Meta.Sample"],
                )
            ),
        )
        self.write(
            "ISSUE-resolved-one.md",
            fm_text(
                base_fields(
                    title="An Issue", type="issue", status="resolved", verified_by=[]
                )
            ),
        )
        self.write(
            "journal.md",
            fm_text(
                base_fields(
                    title="Arc Journal",
                    type="workflow",
                    status="active",
                    record_of=["spec-done.md"],
                )
            ),
        )
        self.write_source("some-file.test.ts", '"Resort.Meta.Sample"\n')

        findings = self.check()
        errors = [f for f in findings if f.severity == "error"]
        self.assertEqual(errors, [], f"expected a clean corpus, got: {[e.format() for e in errors]}")


# ---------------------------------------------------------------------------
# Report views
# ---------------------------------------------------------------------------


class TestReportViews(NotesFixtureCase):
    def test_build_frontier_unblocked_no_open_component(self):
        self.write(
            "vision.md",
            fm_text(base_fields(title="Vision", type="design-vision", status="active")),
        )
        self.write(
            "roadmap.md",
            fm_text(
                base_fields(
                    title="Roadmap", type="roadmap", status="proposed", part_of=["vision.md"]
                )
            ),
        )
        # Ready: approved, no dependencies, no open component.
        self.write(
            "ready-spec.md",
            fm_text(
                base_fields(
                    title="Ready Spec",
                    type="decision-spec",
                    status="approved",
                    part_of=["roadmap.md"],
                )
            ),
        )
        # Blocked: approved but depends_on an unfinished spec.
        self.write(
            "blocking-dep.md",
            fm_text(
                base_fields(title="Blocking Dependency", type="decision-spec", status="proposed")
            ),
        )
        self.write(
            "blocked-spec.md",
            fm_text(
                base_fields(
                    title="Blocked Spec",
                    type="decision-spec",
                    status="approved",
                    depends_on=["blocking-dep.md"],
                )
            ),
        )

        docs, _ = load_corpus(self.notes_root)
        requires = build_requires_graph(docs, self.notes_root)
        comps = components_index(docs, self.notes_root)
        frontier_ids = {d.id for d in build_frontier(docs, requires, comps)}

        self.assertIn("ready-spec.md", frontier_ids)
        self.assertNotIn("blocked-spec.md", frontier_ids)

    def test_design_frontier_exhausted_anchor(self):
        self.write(
            "vision.md",
            fm_text(base_fields(title="Vision", type="design-vision", status="active")),
        )
        self.write(
            "spec-done.md",
            fm_text(
                base_fields(
                    title="Done Spec",
                    type="decision-spec",
                    status="completed",
                    part_of=["vision.md"],
                    verified_by=[],
                )
            ),
        )

        docs, _ = load_corpus(self.notes_root)
        requires = build_requires_graph(docs, self.notes_root)
        comps = components_index(docs, self.notes_root)
        frontier = design_frontier(docs, requires, comps)
        anchor_ids = {d.id for d in frontier["exhausted_anchors"]}
        self.assertIn("vision.md", anchor_ids)

    def test_downstream_count_and_critical_path(self):
        # R (roadmap) requires S (spec) requires I (issue); all open.
        self.write(
            "vision.md",
            fm_text(base_fields(title="Vision", type="design-vision", status="active")),
        )
        self.write(
            "issue.md",
            fm_text(base_fields(title="Issue", type="issue", status="open")),
        )
        self.write(
            "spec.md",
            fm_text(
                base_fields(
                    title="Spec",
                    type="decision-spec",
                    status="approved",
                    depends_on=["issue.md"],
                )
            ),
        )
        self.write(
            "roadmap.md",
            fm_text(
                base_fields(
                    title="Roadmap",
                    type="roadmap",
                    status="proposed",
                    part_of=["vision.md"],
                    depends_on=["spec.md"],
                )
            ),
        )

        docs, _ = load_corpus(self.notes_root)
        requires = build_requires_graph(docs, self.notes_root)
        counts = downstream_counts(docs, requires)

        # roadmap.md and spec.md both transitively require issue.md.
        self.assertEqual(counts["issue.md"], 2)
        # roadmap.md transitively requires spec.md.
        self.assertEqual(counts["spec.md"], 1)
        self.assertEqual(counts["roadmap.md"], 0)

        chain = longest_open_chain(docs, requires, area=None)
        self.assertEqual(chain, ["roadmap.md", "spec.md", "issue.md"])


if __name__ == "__main__":
    unittest.main()
