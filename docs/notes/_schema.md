---
title: "Documentation Schema and Conventions"
type: technical-reference
area: meta
status: active
date: 2026-11-13
---

# Documentation Schema and Conventions

This document is the protocol for everything in `docs/notes/`: what each type of document is for, the front matter it
carries, how documents link into a graph of work, who may change which status, and what is kept or deleted once work
has shipped. The step-by-step procedures that apply these rules are the
[notes-protocol skill](../../.claude/skills/notes-protocol/SKILL.md).

It is the Piste Perfect project's `Notes/_schema.md`, adopted here on 2026-11-13 with three changes: this repo's
areas, a flat directory in place of area folders and their indices, and evidence that names TypeScript tests.

## Front Matter

Every markdown file under `docs/notes/` carries YAML front matter, and `check` rejects any key outside this set:

```yaml
---
title: "Human-readable document title"                     # required
type: design-vision                                          # required; see Types
area: building-shell                                         # required; see Areas
status: active                                               # required; the set depends on type
date: YYYY-MM-DD                                             # required; authored or last major revision
superseded_by: ./new-vision.md                               # only on a superseded design-vision
part_of: [roadmap-or-vision.md]                              # this document is a component of those
depends_on: [some-decisions.md]                              # these must finish before this can start
record_of: [some-decisions.md]                               # only on an arc journal
priority: high                                               # optional: high | normal | low (default normal)
verified_by: [apps/building-shell/tests/gable-rise.test.ts]  # required on a completed spec / resolved issue
---
```

Every path-valued key is written relative to the file that declares it.

**Areas** — `articulation | building-shell | dashboard | dol-system | meta | straight-skeleton | subdivision`. Pick the
dominant system area when a document spans several; the area is also the domain axis of every report. The set lives in
`AREAS` in [notes_schema.py](../../scripts/notes_schema.py), and a new area is added there and here in one change.

## Types

Each type has a role and its own status set. A value that appears in two sets names the same stage in both.

| Type | Role | Status set |
|---|---|---|
| `design-vision` | Where the work should arrive | `speculative \| active \| rejected \| superseded` |
| `roadmap` | The route from here to a vision | `proposed \| iterating \| approved \| completed` |
| `decision-spec` | What is needed to traverse one step | `proposed \| iterating \| approved \| implementing \| completed` |
| `issue` | A known unknown that needs fixing | `open \| resolved` |
| `workflow` | Session records and implementation plans | `active \| archived` |
| `ledger` | Decisions and findings lifted from journals, curated by area | `active \| archived` |
| `commentary` | Logs, observations, tombstones for failed ideas | `active \| archived` |
| `technical-reference` | Derivations, algorithms, measurements | `active \| archived` |

A file whose name begins with `_` (this schema) takes `status: active` whatever its type.

### design-vision

Open-ended ideation at any zoom level, from the whole library down to one key feature. A vision uses the domain's
language with few or no code references, argues "why" — aesthetically as well as functionally — as well as "what", and
carries no chronological or topological ordering.

- `speculative` — not yet chosen for pursuit. Only a speculative vision may be `part_of` a speculative vision.
- `active` — the user has ruled it worth narrowing into roadmaps and specs. A vision becomes active *before* anything
  is attached below it.
- `rejected` — the user has ruled against it. Deleted soon after, unless it is worth keeping as a tombstone for an idea
  likely to be proposed again.
- `superseded` — a fresh approach to the same feature has been started as the vision named by `superseded_by`. Kept
  while comparing the two is useful, then deleted. This is the only type that uses `superseded`.

A wish-list item worth tracking against the code is written as its own small vision, `part_of` the vision that lists
it. A wish that exists only as a line of prose inside a vision has no status of its own and appears in no report.

### roadmap

The local topology to navigate to reach a vision: it sequences features within the vision without going into the
detail of a spec on any of them. A roadmap is `part_of` at least one `active` vision, and its body is an ordered list
of numbered nodes.

- The node order is an estimate made from the starting point. It guides the order specs are drafted in without binding
  it; the only binding order is `depends_on` between specs, and a node thought to come later is specified earlier
  whenever the work shows other nodes need it to be concrete first. An arc lead that goes out of order records why in
  its journal and leaves the roadmap's text as it stands.
- Roadmaps are optional. A spec may be `part_of` a vision directly — the usual shape for revising a system the user
  knows well. A roadmap is the usual shape for a large new feature, and it is what sustains autonomous work: it tells an
  arc lead which node to draft a spec for next.
- `completed` is the user's ruling that every node has been traversed.

### decision-spec

The cognitive work that narrows a vision, or one roadmap node, to a deliverable set of criteria: types and logical
constraints on their behaviour, as testable statements about one unit of work. It fixes "what" and bounds "how", in the
anatomy the `planning-session` skill defines. A spec written for a roadmap node names that node in its intent
paragraph. Aim for 100–200 lines; above about 500 the approver cannot review it with confidence, so split it and
approve the parts that are ready.

- `proposed` — written, not yet read by anyone with approval authority.
- `iterating` — an approver has read it and changes are outstanding. A spec that is not ready to execute stays here.
- `approved` — accepted, and nobody has started implementing it.
- `implementing` — a session is building it now.
- `completed` — the implementation has merged.

A completed spec is kept indefinitely. It is the most concise record of what the code was supposed to do when it was
written, and the place to start when asking why the code has its shape; it holds everything the code does not explain
by itself, with an upstream thread back to the vision.

A spec replaced by another spec, or ruled a dead end, is deleted, and its referrers are repaired in the same change.
If its idea is likely to be proposed again, a concise `commentary` records why it failed.

### issue

A design document that exists because an unknown unknown has become a known unknown — the negative feedback loop that
shadows the visions. It carries reproduction detail. An issue whose fix needs a design conflict resolved gets a spec
`part_of` it; one that needs only an implementation pass is fixed directly. An issue's filename begins with `ISSUE-`;
a file whose name begins with `ISSUE-` is always of type `issue`.

- `open` — until its fix has merged.
- `resolved` — from then on.

### workflow, commentary, technical-reference

- An **arc journal** is a `workflow` with a `record_of` list, and is the record of exactly one session. Its arc has a
  code in [the arc registry](./arc-registry.md), and its entries are cited project-wide as `{CODE}.{D|F|Q}{n}`.
  It is set to `archived` once every document its `record_of` names is finished, and kept: its ids stay citable.
- A **delegate's debrief** is a `workflow`, kept under `debriefs/` as the record of one task.
- An **implementation plan** is a `workflow`, deleted once its work has merged. A delegate's plan is returned to its
  arc lead rather than committed.
- A **findings document** — measurements and the probes behind them — is a `technical-reference`.
- `archived` means the text is no longer current and is kept as a record.

### ledger

A curated document of the decisions and findings worth keeping beyond their arc, lifted with `journal.py lift`. Each
entry sits under its project-wide id with an origin line, so every citation of it resolves without re-linking. One
per area, at `docs/notes/<area>-ledger.md`. A ledger entry may be promoted into a skill when the user rules it worth
the stronger measure.

## Edges

| Key | Declared by | May name |
|---|---|---|
| `part_of` | vision, roadmap, spec, issue | vision, roadmap, spec, issue |
| `depends_on` | roadmap, spec, issue | roadmap, spec, issue |
| `record_of` | arc journal | vision, roadmap, spec, issue |
| `superseded_by` | superseded vision | vision |

- `part_of` is declared on the component, never on the whole, so spinning a spec off an arc touches only the new file.
  A document may be `part_of` several documents, and nesting depth is unbounded.
- No edge may name a `superseded` vision: an edge that did is re-pointed at the vision named by its `superseded_by`.
- `record_of` is many-to-many: a journal may record several documents, and a document's journals are listed in
  filename order, the last being the head.
- **The DAG rule.** `part_of` and `depends_on` together form one "requires" graph, which must be acyclic. `X
  depends_on Y` contributes X→Y ("X cannot start until Y is finished"); `C part_of P` contributes P→C ("P cannot finish
  until C is finished"). If spec `A` is `part_of` spec `B` and also `depends_on` `B`, the cycle B→A→B means neither can
  ever finish, and `check` rejects it.

## Evidence

`verified_by` lists what exercises a spec's decisions or an issue's fix. Each entry is either a test file's path from
the repo root (`apps/building-shell/tests/gable-rise.test.ts`) or text that occurs in the workspace's source, such as
a `describe` name. It is required on every `completed` spec and every `resolved` issue; `verified_by: []` records that
the work was verified by inspection and has no automated test. The session that finishes the work writes it in the
same edit.

An audit treats `status` as a claim and `verified_by` as its evidence. An audit that finds code implementing a spec
that is not `completed` corrects the status and adds `verified_by` in the same session, rather than reporting the spec
as unbuilt.

## Who Moves What

- Only the user moves a vision to `active`, `rejected` or `superseded`, and only the user moves a roadmap to
  `completed`.
- Only the user moves a roadmap or spec to `approved`, with one exception: an arc lead may approve a spec that traverses
  a node of an `approved` roadmap, and records that approval as a numbered decision in its journal.
- The session that starts implementing a spec moves it to `implementing`; the session that merges the implementation
  moves it to `completed`, with `verified_by`, in the same commit as the merge.
- Status is read from whichever branch you are on, and reaches `main` by merge, like the code it describes.

## Enforcement and Reports

`python scripts/notes_schema.py check` validates every covered file and the graph, printing every error and exiting
non-zero on any; `--summary` prints counts by rule. Beyond the key, vocabulary and edge rules above, it rejects: an
`issue` whose filename does not begin with `ISSUE-`, or the reverse; a cycle; anything but a speculative vision
`part_of` a speculative vision; a roadmap not `part_of` an active vision; a completed roadmap or spec, or resolved
issue, with a component spec that is not completed; a missing `verified_by`; a `verified_by` entry found nowhere in the
workspace's source; and an arc code or slug that appears twice in the registry. It warns on an `implementing` spec with
an unfinished dependency, and on a spec over 500 lines.

A `PostToolUse` hook, [check-notes-schema.py](../../.claude/hooks/check-notes-schema.py), registered in
[.claude/settings.json](../../.claude/settings.json), runs the check after every agent edit under `docs/notes/` and
hands the errors back to that agent. A script that writes notes, such as `journal.py`, runs the check on its own.

The corpus was migrated to this schema on 2026-11-13. Each spec's status was set by an audit of the code, the
debriefs and the journals, and the notes written before the journals were classified and mostly archived.

`python scripts/notes_schema.py report [--area <area>] [--vision <path>]` prints to stdout:

- **Build frontier** — approved specs that are unblocked and have no open component: what agents can take up now.
- **Implementing** — specs being built, each with its head journal.
- **Design frontier** — proposed and iterating roadmaps and specs; speculative visions; active visions with nothing
  below them yet; exhausted anchors (active visions and approved roadmaps whose specs have all completed); open issues
  with no spec; and approved specs blocked on a dependency that is still proposed or iterating.
- **Runway** — per area, the build-frontier count beside the implementing count.
- **Critical path** — the longest chain of open roadmaps, specs and issues, overall and per area. Ranking uses
  `priority` first, then the downstream count: how many open documents transitively require the one being ranked.
- **Arcs** — every document a journal records, with its type, journals and the statuses of the specs below it.
- **Vision tree** (`--vision`) — the tree below one vision, with each status and a count per status.
- **Stale status** — implementing specs with no journal dated in the last 14 days.

## Layout

`docs/notes/` is flat, with `debriefs/` for delegates' debriefs. There are no area folders and no index files: the
area is a front-matter key, and `report --area` lists an area's work. This file is the single source of truth for
documentation conventions.
