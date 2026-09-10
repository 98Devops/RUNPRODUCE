# AI Workflow Rules

## Approach — the superpowers loop

This project uses the **superpowers** skill. Every unit of work follows
its loop. Do not skip to code.

### 1. Understand before building
When a new unit starts, do not jump into implementation. Step back and
establish what is actually being built, and why, against
`project-overview.md`. If the context files do not define it, it is not
defined — add it to `current-issues.md` rather than inventing it.

### 2. Produce a spec, reviewed in chunks
Write a short spec for the unit. **Present it in chunks short enough to
actually read** — a few hundred words at a time — and get sign-off on
each before moving on. Do not dump a wall of specification and ask for
blanket approval.

The spec states: what the unit does, its inputs and outputs, which
golden fixtures or flows verify it, and what is explicitly out of scope.

### 3. Implementation plan
Once the spec is signed off, write a plan clear enough for **an
enthusiastic junior engineer with poor taste, no judgement, no project
context, and an aversion to testing** to follow correctly. Every step
names its file, its test, and its verification.

The plan enforces:
- **True red/green TDD** — failing test first, always
- **YAGNI** — build only what a fixture or documented flow requires
- **DRY** — extract on the third repetition, not the second

### 4. Execute on "go"
Only after explicit approval, run the subagent-driven implementation:
work through each task, inspect and review the output, and continue.
Long autonomous runs are fine **provided the plan is not deviated
from**. If the plan turns out to be wrong, stop and revise the plan —
do not improvise around it.

### 5. Close the loop
Update `progress-tracker.md` and
`current-issues.md`. For UI units, run the `web-design-guidelines`
audit before marking done.

### Before U5 — grill the assumptions
The allocation optimiser depends on the mortality model (OQ-1), the
objective function (OQ-3) and the gate pricing basis (OQ-4). All three
are currently assumed. **Run `/grill-me` on them before writing U5**,
Anything you cannot answer during that grilling is a real question to
send the client in writing.

## Skills

Five vendored skills plus the superpowers plugin. Lanes and repo setup:
**`context/skills.md`**.

`orient` starts every session. `grill-me` resolves assumptions before
they are built on. `superpowers` owns spec → plan → build.
`impeccable` and `web-design-guidelines` apply to UI units only —
invoking them during engine units wastes context. Run
`/impeccable init` once before U7, seeded from the context pack.

Nothing overlaps. Do not install `to-spec`, `implement` or `tdd` —
superpowers covers that ground. `design-taste-frontend-v1` was removed
when impeccable was added; they do the same job and impeccable does it
better.

## Spec-driven development

Build this project incrementally using a spec-driven workflow. The
files in `context/` define what to build, how to build it, and the
current state of progress. Always implement against these specs — do
not infer or invent behaviour from scratch.

**Engine before interface.** The calculation engine is built and
verified against golden fixtures before any screen is written. A wrong
number behind a beautiful screen is worse than no screen at all.

**Golden fixtures are the contract.** They encode the client's real
spreadsheet output. When a fixture fails, the implementation is wrong —
not the fixture. Fixtures change only when the client's business logic
changes, and the change is recorded in `progress-tracker.md` under
Architecture Decisions.

## Build order

Do not reorder. Each unit depends on the one before it.

| Unit | Scope | Verified by |
|---|---|---|
| **U1** | Monorepo scaffold, types, seed `breed_curve.json`, 13 golden fixtures written and failing | 13 red tests, `npm run build` passes |
| **U2** | M1 production + M2 costing | Fixtures 1–4, 12 green |
| **U3** | M3 feed liability | Fixtures 5, 9 green |
| **U4** | M4 harvest optimiser | Fixtures 7, 8, 10, 11 green |
| **U5** | M5 allocation + M6 recommendations. **Hardest unit.** | Fixtures 6, 13 green |
| **U6** | Supabase schema, RLS, repositories | Integration tests on constraints |
| **U7** | Daily capture screen | Timed under 60s on a real phone |
| **U8** | Feed and sales ledger screens | Manual walkthrough of flows 3, 5, 6 |
| **U9** | Decision console | All 13 questions answerable in under 2 min |
| **U10** | Scenario sliders | Full recalculation under 200 ms |
| **U11** | Alerts, CSV export, Netlify deploy | Deployed and seeded |

**UI units (U7–U11)** additionally require: `impeccable` applied under
the `ui-context.md` §0 constraints, plus clean `/impeccable audit` and
`web-design-guidelines` passes. The full UI process — reference clone,
four parallel worktree variations, polish — is
`context/ui-build-playbook.md`.

**De-risking U5:** build the harvest decision as a static calculation
on a fixed date first, get it correct, then make it continuous. A
correct single-date recommendation is worth far more than a broken
continuous one.

## Scoping rules

- Work on one unit at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single step.
- Engine work and UI work are always separate steps. Never in the same
  session if avoidable — they need different context.

## When to split work

Split an implementation step if it combines:

- Engine calculation changes and UI changes
- Database schema changes and application logic changes
- More than one engine module
- Behaviour not clearly defined in the context files

If a change cannot be verified end to end quickly, the scope is too
broad — split it.

## Handling missing requirements

- **Do not invent product behaviour not defined in the context files.**
- **Do not invent numbers.** Several inputs are genuinely unknown —
  see `current-issues.md`. Where a value is unknown, the engine returns
  `{ kind: 'missing_input' }` naming what is missing, and the UI states
  it plainly. Never substitute a plausible default silently.
- If a requirement is ambiguous, resolve it in the relevant context
  file before implementing.
- If a requirement is missing, add it to `current-issues.md` as an open
  question before continuing.
- If an assumption must be made to keep moving, mark the parameter
  `confidence: 'assumed'` and log it in `current-issues.md`.

## Protected files

Do not modify unless explicitly instructed:

- `context/breed_curve.json` — client's real production data
- `apps/web/components/ui/*` — shadcn generated components
- `packages/engine/tests/golden/*.json` — the contract with the client
- Any third-party library internals

## Keeping docs in sync

Update the relevant context file whenever implementation changes:

| Change | Update |
|---|---|
| System boundaries, storage model, invariants | `architecture.md` |
| Feature scope, flows, success criteria | `project-overview.md` |
| Conventions, patterns, standards | `code-standards.md` |
| Colours, typography, layout | `ui-context.md` |
| Any progress at all | `progress-tracker.md` |
| A question answered or a new blocker | `current-issues.md` |

## Before moving to the next unit

1. The spec for the unit was approved in chunks before implementation
2. Every behaviour was driven by a test that failed first
3. The current unit works end to end within its defined scope
4. No invariant in `architecture.md` was violated
5. Relevant golden fixtures are green
6. **UI units only:** both `/impeccable audit` and
   `web-design-guidelines` are clean, or exceptions are logged in
   `current-issues.md`
7. `progress-tracker.md` reflects the completed work
8. `current-issues.md` reflects any new open questions
9. `npm run build` passes and the Netlify build succeeds

## Session hygiene

Context windows are the practical constraint on this build.

- Start every session by reading `CLAUDE.md`, then
  `progress-tracker.md` and `current-issues.md`. Read the other context
  files as the unit requires.
- End every session by updating `progress-tracker.md` Session Notes
  with enough detail to resume cold.
- Leave failing tests as instructions for the next session. A red test
  communicates intent more precisely than a paragraph of notes.
- Engine work is context-cheap — it needs only `types.ts` and the
  fixtures. Prefer engine sessions when context is tight.
- Do not load `ui-context.md` during engine units, or the engine specs
  during UI units. Each costs context that the other does not need.
- When a session runs long and a unit is unfinished, write the handoff
  into `progress-tracker.md` Session Notes before context runs out.
- `context/CONTEXT.md` is the shared glossary. Using its terms
  consistently reduces tokens per turn across every later session.
