---
name: notes-protocol
description: >
  The procedure for working with the docs/notes/ corpus under its schema: creating a
  design vision, roadmap, decision spec, issue or arc journal; writing or editing
  any file under docs/notes/; changing any document's status; starting or finishing
  the implementation of a spec or the fix for an issue; a journal's front matter
  or status; deleting a replaced or dead-end spec; and auditing what is
  built against what is planned. Use whenever a task touches docs/notes/ front matter
  or a document's status, and before reporting any feature as built or unbuilt.
  Do NOT use for reading notes only to answer a question about the code.
---

# Notes Protocol

The rules live in one place: [docs/notes/_schema.md](../../../docs/notes/_schema.md). **Read it before any step
below.** This skill adds no rules of its own; it gives the order of the steps, and each step names the `_schema.md`
section that governs it. If a step here and `_schema.md` disagree, `_schema.md` wins and the step is a defect to raise.

The `PostToolUse` hook runs `python scripts/notes_schema.py check` after every edit under `docs/notes/`. When it
reports errors, fix them in the same turn. Each error names the `_schema.md` section it enforces.

## Creating a document

1. Choose the type by its role — **Types**. A destination is a vision, a route is a roadmap, the criteria for one step
   are a spec, and a known defect is an issue.
2. Write the front matter with the first status of that type's set — **Front Matter**, **Types**.
3. Add `part_of` naming the vision, roadmap, spec or issue this document narrows, and `depends_on` naming anything
   that must finish first — **Edges**.

## Changing a status

1. Check that you are allowed to make this move — **Who Moves What**. Approving a roadmap or spec, and ruling a vision
   `active`, `rejected` or `superseded`, belong to the user. An arc lead may approve only a spec that traverses a node
   of an approved roadmap, and records that approval as a numbered decision in its journal.
2. Make the edit, and let the hook check it.

## Starting implementation

1. Confirm the spec is `approved` and unblocked — **Edges**.
2. Set it to `implementing` in the first commit of the work.

## Finishing implementation

1. In the same commit as the merge, set the spec to `completed` (or the issue to `resolved`) and write `verified_by`
   with the test files or test names that exercise it, or `[]` when it was verified by inspection — **Evidence**.
2. Set to `archived` any journal whose `record_of` documents are now all finished, and delete any implementation plan
   for the work — **workflow, commentary, technical-reference**.
3. Keep the spec — **decision-spec**.

## Opening a journal

1. Open it with the `journal` skill (`journal.py open`, or `claim` then `open --new` for a new arc). It writes the
   front matter and the skeleton.
2. Make sure `record_of` names the documents this session works on — **workflow, commentary, technical-reference**.
3. Follow the arc-lead skill for what the journal records.

## Deleting a spec

1. Delete it when it has been replaced by another spec or ruled a dead end — **decision-spec**.
2. Repair every edge that named it; `check` lists them.
3. If its idea is likely to be proposed again, write a short `commentary` recording why it failed.

## Auditing what is built

1. Treat every `status` as a claim — **Evidence**.
2. Start from `verified_by` on completed specs and resolved issues, and check the code.
3. When the code implements a spec that is not `completed`, set it to `completed` and add `verified_by` in the same
   session. Never report such a spec as unbuilt.
4. `python scripts/notes_schema.py report` shows the build frontier, the design frontier, runway and the critical path
   — **Enforcement and Reports**.
