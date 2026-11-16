---
name: journal
description: >
  Read and write session journals (docs/notes/<slug>-journal-NN.md) and cite any decision or finding by its
  project-wide id, through scripts/journal.py. Use for every journal operation: bootstrapping from a journal,
  looking up or citing a decision or finding (BSA.D247, RSA.F59), recording a decision, finding or amendment,
  updating a journal section, opening the next session's journal or a new arc, claiming an arc code, lifting an
  entry into a ledger, and auditing a journal chain. Use alongside the arc-lead skill, which says what to record;
  this skill says how. Do NOT use for specs, issues or visions, which follow notes-protocol.
---

# Journals

`python scripts/journal.py <command>`, from anywhere in the repo. Every write prints one line naming the file and
lines it touched, and never echoes the text. Every read prints only the slice asked for.

The tool is vendored from the Piste Perfect project (`Scripts/journal.py` there) and adapted to this repo. Its tests
run with `python -m unittest test_journal` from `scripts/`.

## Ids

- **An entry's id is `{CODE}.{D|F|Q}{n}`**: `BSA.D247` is decision 247 of the arc whose code is `BSA`. The arc codes
  are in [arc-registry.md](../../../docs/notes/arc-registry.md): `BSA` is building-shell-arc and `RSA` is
  recursive-subdivision-arc.
- **`BSA2.D247` is the same entry with its session named.** It is needed only where a number repeats inside an arc,
  and `show` and `verify` say when. Neither arc has a repeat as of 2026-11-13.
- **Text written through the script cites with shorthand:** `@D247` expands to the current arc's `BSA.D247`, and
  `@RSA.D139` to itself. The file always holds the full id, so `grep BSA.D247` and `git log --grep BSA.D247` find
  every citation.
- **Entries written before the registry** keep their own labels in their files (`247.`, `F83`, `**139 —`), and the
  script reads them. Prose written before the registry cites them as "decision 247"; `refs` finds those forms and
  marks them approximate.
- **Ids from the Piste Perfect project** (`MB.D525`, `MBU…`) belong to that project's registry. This script neither
  resolves nor expands them: write them out in full, never as `@MB.D525`.
- There is no id table (`docs/notes/journal-ids.csv`) because no entry needed renumbering. If `verify` ever reports
  an unresolved duplicate, `scripts/journal_migrate.py` drafts one for the user's review.

## Reading

| Need | Command |
|---|---|
| Bootstrap a session | `brief` (head path, next ids, preamble, reading order, §2 §4 §5) |
| One or more entries, any arc | `show BSA.D247 RSA.F59 251` (a bare id means the current arc) |
| One section | `section manual -s 1` (aliases: reading, charter, state, manual, next, open) |
| A catalogue of claims | `index` (head), `index --all`, `index --since BSA.D250`, `index --marked` (amended or struck) |
| A phrase | `find "Cheek"`, or `find "..." --all-arcs` for the whole project |
| Who cites an entry | `refs BSA.D247`: exact ids in docs/notes, skills and git log, then legacy forms, marked approximate |
| The chain's health | `verify`, or `verify --all-arcs` |

A journal is never read whole: `show`, `section` and `find` cover every lookup.

## Writing

Text goes on stdin (a Bash heredoc), with `--text` for one line, or with `--file` after a Write. Write one line per
paragraph or bullet; the script wraps at 120 columns. The first line is the claim: open it with a bold span
(`**Claim.** rest`), or write it plain and the whole line becomes bold.

```bash
python scripts/journal.py decision --user <<'EOF'
**the Cell-laying clash is fixed next,** ahead of the corner sliver of @F83.
- Its reproducer is the one @D247 names.
EOF
```

| Act | Command |
|---|---|
| A decision | `decision`, with `--user` for the user's ruling (dated today) |
| A finding | `finding --source "a read-only diagnosis delegate, 2026-11-13"` |
| Amend, supersede, withdraw, strike, disprove | `amend BSA.D257 AMENDED --by @D260 --text "why"`, or `--by-user` |
| Replace a section | `set state`, `set next`, `set reading` |
| Add to a section | `append open --text "#. **Item.**"` (`#.` takes the list's next number) |

- Decisions and findings only grow: an entry is changed by an amendment where it stands, never by rewriting it.
- The script numbers every entry, and the number is the arc's maximum plus one over every journal.
- New entries are written `- **260. Claim.** rest`. Older entries in the same arc read `247. **Claim.** rest`; both
  parse, and the older ones are left as they are.

## Sessions and arcs

- **Next session:** `open --reason "a compaction"`. It writes the new journal (§1, §3, §4 and §5 carried, §2 marked
  "Not yet measured", a fresh reading order), marks the old head "Superseded as head by", points this worktree at
  the arc, and runs the notes check on the two files. Then measure the state and `set state`. A new file takes its predecessor's number width
  (`-journal-03.md` after `-journal-02.md`).
- **A new arc** needs a code on `main` before its first journal:
  1. `claim <slug> <CODE> --trailer "<each commit trailer line>"`. It refuses a code already in the registry, closed
     arcs included. Otherwise it merges the registry row into `main` through `docs/claim-arc-<slug>` and merges
     `main` back into the current branch. When the index holds staged changes, or `git switch main` is refused, it
     leaves the tree as it found it, prints the commands, and the user says where the claim merges. It needs the
     registry to be on `main` already.
  2. `open --new <slug> --title "<Arc name>" --area <area> [--record-of <doc>]`. The areas are in
     [_schema.md](../../../docs/notes/_schema.md).
- `use <slug>` sets this worktree's default arc (kept in `.claude/journal-arc.txt`, git-ignored); `--arc <slug or
  code>` overrides it for one call.

## Lifting into a ledger

An entry worth keeping beyond its arc moves to a curated document:

```
python scripts/journal.py lift BSA.D250 --to docs/notes/building-shell-ledger.md
```

- The entry, with its amendments, lands under its full id with an origin line, and the journal keeps a stub naming
  where it went. Every citation still resolves: `show` finds a full-id heading anywhere under `docs/notes/` first.
- An entry marked superseded, struck, withdrawn or disproved needs `--force`, so a reversed ruling is promoted only on
  purpose.
- Promotion from a ledger into a skill is the user's call.

## When the script refuses

Each refusal says what to do instead. An error naming an ambiguous id lists its located forms: pick one.
