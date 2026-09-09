# RunProduce — Application Building Context

## Read these first, in order

Read all of the following before implementing or making any
architectural decision:

1. `context/project-overview.md` — product definition, goals, features, scope
2. `context/CONTEXT.md` — the shared language. Read before writing any
   identifier.
3. `context/architecture.md` — system structure, boundaries, storage model, invariants
4. `context/ui-context.md` — theme, design dials, typography, component conventions
5. `context/code-standards.md` — implementation rules and conventions
6. `context/ai-workflow-rules.md` — workflow, TDD discipline, scoping, delivery
7. `context/progress-tracker.md` — current phase, completed work, next steps
8. `context/current-issues.md` — open questions, known bugs, blocked work
9. `context/skills.md` — which skill owns which phase
10. `context/ui-build-playbook.md` — UI clone/variation/polish process (UI units only)
11. `context/card-system-and-decision-ux.md` — card specs + which UX psychology principles we adopt and which we reject (UI units only)

`context/deferred-motion-assets.md` is parked work — do not read or act
on it during U1–U11.

**Or just run `/orient`**, which does the above in the right order and
reports where the work stands.

## Skills

Full detail and repo setup: **`context/skills.md`**.

| Phase | Skill |
|---|---|
| Start of every session | `orient` |
| Resolving an assumption before building on it | `grill-me` |
| Spec → plan → TDD → build | `superpowers` (plugin) |
| UI craft | `impeccable` — **`ui-context.md` §0 governs; `DESIGN.md` holds token values** |
| UI audit gates | `/impeccable audit` (craft) + `web-design-guidelines` (accessibility) |

That is the whole set. Nothing else is installed, and nothing overlaps.
`superpowers` owns the build loop end to end.

**Before U5 (the allocation optimiser), run `/grill-me`** on the open
questions in `context/current-issues.md`. Two of them block
correctness. An optimiser fed a wrong mortality curve is still wrong,
and looks authoritative while being so.

## The three rules that override everything

1. **The engine is pure.** `packages/engine` has no I/O, no database,
   no `Date.now()`, no `Math.random()`. `asOf` is always an explicit
   parameter. This is what makes the system testable and what lets the
   same code run on server and client.

2. **Money is `bigint` cents. Weights are integer grams.** Never a
   float. Convert to display units only at the presentation boundary.

3. **Never invent a number the client has not given us.** If a value is
   unknown, the engine returns a typed `MissingInput` result and the UI
   says what is missing. A blank is always better than a confident wrong
   number. See `context/current-issues.md`.

## Deployment

Netlify. Next.js via `@netlify/plugin-nextjs`. Scheduled work runs as
Netlify Scheduled Functions, never inside a request handler.

## Keeping context in sync

Update `context/progress-tracker.md` after each meaningful
implementation change.

Update `context/current-issues.md` whenever a question is answered, a
new blocker appears, or an assumption is calibrated against real data.

If implementation changes the architecture, scope, or standards
documented in the context files, update the relevant file before
continuing.
