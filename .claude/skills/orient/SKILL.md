---
name: orient
description: Enter the RunProduce codebase. Read the context files, establish current state, and report where the work stands. Use at the start of any session, or when asked to "orient", "get up to speed", "where are we", or "what's next".
---

# Orient

The entry routine for this repo. Run this before doing anything else in
a fresh session. It is cheap and it prevents the most expensive failure
mode: an agent that starts writing code without knowing what already
exists.

## Step 1 — Read, in this order

Always:
1. `CLAUDE.md` — the three overriding rules and the skill map
2. `context/CONTEXT.md` — the shared language. Read this before you
   write a single identifier.
3. `context/progress-tracker.md` — current phase, what's done, what's next
4. `context/current-issues.md` — open questions, known bugs, blocked work

Then, only what the unit needs:

| Working on | Also read |
|---|---|
| Engine (U1–U6) | `context/architecture.md`, `context/code-standards.md` |
| UI (U7–U11) | `context/ui-context.md` (especially §0), `context/code-standards.md` |
| Scope or feature questions | `context/project-overview.md` |
| Process questions | `context/ai-workflow-rules.md` |

**Do not read the UI context during engine work, or the engine specs
during UI work.** Context is the binding constraint on this build.

## Step 2 — Establish actual state

Do not trust the tracker alone; it can lag reality. Verify:

```bash
git log --oneline -10
npm test 2>&1 | tail -20        # which fixtures pass?
npm run build 2>&1 | tail -5
```

Then check what exists on disk:
```bash
ls packages/engine/src/ 2>/dev/null
ls packages/engine/tests/golden/ 2>/dev/null
ls apps/web/app/ 2>/dev/null
```

If the tracker and reality disagree, **reality wins**. Correct the
tracker before continuing and say that you did.

## Step 3 — Report back, briefly

Six lines, no more:

```
Phase:      <from tracker, corrected against reality>
Unit:       <current unit, e.g. U3 — feed liability>
Fixtures:   <n> passing / <n> total
Build:      passing | failing (<reason>)
Blocked:    <any OQ- blocking this unit, or "nothing">
Next:       <the single next action>
```

Then stop and wait. Do not begin implementing off the back of
orientation — the user decides what happens next.

## Step 4 — If starting a new unit

Hand off to the superpowers loop:
1. Understand what the unit is for, from `project-overview.md`
2. Write the spec, presented in readable chunks for sign-off
3. Write the implementation plan
4. Wait for "go"

If the unit is ambiguous, or the user wants to stress-test the approach
before committing, invoke **`grilling`** rather than guessing.

## Red flags — stop and raise these

- The tracker says a unit is complete but its fixtures fail
- A golden fixture was modified without a corresponding `AD-` entry
  (fixtures are the contract with the client — they change only
  deliberately)
- An engine file imports from `next`, `react`, `@supabase/*`, or uses
  `Date.now()` / `Math.random()` — invariant 1 is broken
- A money value is stored or computed as a `number` rather than
  `bigint` cents — invariant 2 is broken
- A hardcoded batch size, flock count, or price appears anywhere
- `vercel.json` exists — this project deploys to Netlify
