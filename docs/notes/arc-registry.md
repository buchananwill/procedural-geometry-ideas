---
title: "Arc Code Registry"
type: technical-reference
area: meta
status: active
date: 2026-11-13
---

# Arc Code Registry

Every journal arc's project-wide code. An entry's id is `{CODE}.{D|F|Q}{n}`, for example `BSA.D247`; `BSA2.D247`
names the session as well. Rows are only ever added: a closed arc keeps its row, so its code is never reissued. A new
arc claims its code with `journal.py claim`, which merges the row into `main` before the arc's first journal opens.

The Directory column is relative to `docs/notes/`; `.` is that directory itself. `RSA` is the code the Piste Perfect
project's registry already gives the recursive-subdivision arc, whose journals it mirrors.

| Code | Slug | Directory | Claimed | Status |
|---|---|---|---|---|
| RSA | recursive-subdivision-arc | . | 2026-08-17 | active |
| BSA | building-shell-arc | . | 2026-11-07 | active |
