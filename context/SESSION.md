# RunProduce - Session State
Last updated: 2026-09-14 · Branch: `u6-supabase-schema`

## HARD RULE: Daniel's production Supabase project is off-limits
- **No U6 work touches Daniel's production Supabase project.** Every connection string, MCP target and deploy script defaults to the **dev** project.
- **Dev project ref: `zlvjmaorlxrjnuxhykuh`.** It is the only target of the `supabase` server in `.mcp.json`. It may be reset, wiped and rebuilt freely: migrations, tests and experiments all run there.
- **CI's database job** runs against a CI-only project or a throwaway branch of dev. Never dev directly, never production.
- **Production is first touched in U11**, deliberately, in one clean migration of the final schema.
- **Do not use the claude.ai Supabase connector** (`mcp__claude_ai_Supabase__*`) for this project. It is account-wide, and it lists unrelated projects.

## U6 environment (target confirmed by the user 2026-09-14)
- **U6 dev target: "Run Produce dev", ref `zlvjmaorlxrjnuxhykuh`, `https://zlvjmaorlxrjnuxhykuh.supabase.co`.** Reached only through the `supabase` server in `.mcp.json`. It is the only project U6 work ever touches.
- **HARD RULE:** no U6 operation (planning query, schema change, migration, test, seed, experiment) touches any other project. That covers `trevis-app`, `Fuel-track`, any future staging or demo project, Daniel's production project, and any future production project.
- **Scoping.** The server URL carries `project_ref=zlvjmaorlxrjnuxhykuh`, so the server has no tools to list or create projects, and a project added to the account later stays invisible to it. The account-wide claude.ai connector (`mcp__claude_ai_Supabase`, org "Trevis App": it sees `trevis-app` and `Fuel-track`, not dev) is **denied** in `.claude/settings.json`.
- **STANDING RULE: the MCP is read-only unless a migration is actively being applied.** `.mcp.json` carries `read_only=true` by default. To apply a migration:
  1. Remove `&read_only=true` from the URL and reconnect `supabase` in `/mcp`.
  2. Apply exactly the reviewed migration(s), nothing else.
  3. Restore `&read_only=true`, reconnect, and verify: `select current_setting('transaction_read_only')` reads `on`, and `apply_migration` is no longer offered. If either check fails, stop and report.
  - A write window never stays open across a planning step, a commit or the end of a session. `.mcp.json` is never committed without `read_only=true`.
  - Before any MCP call, check that the URL still reads `project_ref=zlvjmaorlxrjnuxhykuh`.
- **Read-only is NOT yet confirmed in effect (last checked at the end of chunk 3, 2026-09-14).** The live connection still predates the URL change: `transaction_read_only` = `off`, user `postgres`. At the end of chunk 3 the session's tool list still offered `apply_migration`, `create_branch` and `deploy_edge_function`. **No MCP calls until the user reconnects `supabase` in `/mcp` and the step-3 check passes.** "No writes attempted" is true; "read-only is holding" is not yet.
- **Writes so far: none.** Dev has 0 migrations and 0 `public` tables. Every MCP call in this session was read-only by nature: `get_project_url`, `list_tables`, `list_migrations`, and one `SELECT` of settings. No MCP call was made during chunks 3 or 4.

## What this is
A decision console for Daniel, a broiler farmer, that turns his daily batch records into feed, cost, cash and harvest figures. Its headline job is telling him how many birds to place next and when, under three named strategies.

## Architecture, one paragraph
npm monorepo: a pure TypeScript engine (`packages/engine`) behind a Next.js app on Netlify, with Supabase for storage (U6, not built). The engine has no I/O, no `Date.now()`, and `asOf` is always a parameter. Money is `bigint` cents and weight is integer grams. An unknown value returns a typed `MissingInput`, never a guess. Golden fixtures are the client contract, and changing one needs an AD. Full detail: `architecture.md`.

## Completed
- **U1** Scaffold: monorepo, money, breed-curve seed, types, golden runner, CI.
- **U2** M1 production + M2 costing. Fixtures 1-4, 12, 13.
- **U3** M3 feed liability. Fixtures 5, 9.
- **U4** M4 harvest optimiser + pre-merge review wave. Fixtures 7, 10, 11.
- **U5 M5a** Cash calendar (`cash.ts`), standalone and not wired into `computeDecision`.
- **U5 M5b Tasks 1-8** Allocation enumeration, scoring, tie-break, place-nothing, `computeAllocation`.
- **Daniel's six answers** wired as AD-52 to AD-57. Band refusal made consistent (AD-58).
- **Pre-merge review fix wave** (2026-09-14): 5 findings fixed + 3 minors; rest logged as TD-4.
- **U6 Task 0** shared refusal list (TD-4 #8, AD-60).
- **Status:** 348 unit tests. Golden 11 written / 11 passing / 1 held. Lint, typecheck, build clean.

## In progress
**U6**, planning. Spec: `context/plans/u6-supabase-schema.md`. No schema code yet.
- **Task 0 done:** one shared refusal list, `missingInputsFor` in `refusals.ts` (TD-4 #8, AD-60).
- **Chunk 1** (framing, dev project): drafted.
- **Chunk 2** (parameters, opening cash, D4-D8): approved, AD-61 to AD-67.
- **Chunk 3** (parameter tables, D9-D12): **approved 2026-09-14**, AD-68 to AD-72.
  - D9 `create_parameter_set` in one transaction (AD-68). D10 `revision`, amends D7 (AD-69). D11 breed curves immutable, pinned by the batch (AD-70). D12 `bag_kg` on `feed_prices`, amends D6 (AD-71).
  - The approval named "D9-D15" and enums `overhead_line_type` / `contract_type` / `timing_basis`; mapped in the spec and in AD-63. If it was meant for a different draft, revert AD-68 to AD-72.
  - **T-RT1** (overhead round trip, test-first) plus an exhaustive `timing` check that throws in `cash.ts` (AD-72). Not built.
  - **AD-63** names every governed constraint; any value change is engine + schema in one commit.
  - `gate_price_cents_per_bird` **stays** (live field). The confirmed "orphaned key" is `mortality_history`: delete it from `MissingInputKey`, TDD, in the build.
- **Chunk 4** (recorded facts, D13-D19): **drafted, awaiting sign-off.** Batches as identity + placement fact; corrections append (`supersedes_id`, `voided`, `current_*` views, idempotency key); integrity in deferred triggers; dates and grams stored; part bags recordable; forward sales orders stored; payments, receipts, facilities, expenses, offal deferred. Proposed OQ-32 (shared collection across batches) and OQ-33 (booked bulk runs), not yet logged.
- **Chunks 5-8** to come: access, repositories, seed, build order.

## Blockers
| Blocker | Blocks | Who resolves |
|---|---|---|
| OQ-25: engine holds no opening cash balance | M5b Task 9, wiring `decision.allocation` (getter throws) | Us, U6. Design approved (D8, AD-67); not built |
| OQ-26: Cover Fast can't answer structurally (candidates have no forecast sales) | 1 of 3 modes | Us, via M6 |
| OQ-31: Build Reserve pinned null for the same reason (AD-59) | 1 of 3 modes. Only Maximum Growth answers | Us, via M6 |
| OQ-29: `computeAllocation` takes 20.8 s at 5k birds, ~2 min at 30k | **U9, hard.** Needs a design answer, not "consider performance" | Us: profile first |
| OQ-8: fixture 6 chick price ($0.85 vs $1.00) | Golden completeness hold | Daniel |
| OQ-10: fixture 8 was blocked on OQ-2, now answered | Golden completeness hold | Us: attempt it |
| OQ-17: dressing yield ~62% is unmeasured | Accuracy of the bulk harvest day (0.8 pt from flipping) | Daniel (~20 paired weights) |
| OQ-21 (client half): part-bag draw rounding | Pricing a part-bag draw; refused today | Daniel |
| OQ-15 / OQ-19: labour and electricity scaling; overhead payment dates assumed | Accuracy at 30k birds; overhead cash dates | Daniel |
| Not built: revenue, profit, margin, break-even (M6) | Any answer Daniel can act on | Us |

## Load-bearing decisions
- **AD-29:** unbuilt modules are getters that throw `NotImplementedError`, and the golden runner holds them rather than failing.
- **AD-31:** the 14-day inter-batch gap is a hard constraint on enumeration.
- **AD-35 / AD-42:** three modes (Cover Fast, Maximum Growth as leveraged rollover, Build Reserve). No Auto mode.
- **AD-43:** three integer scalars. The reserve floor filters candidates and is never folded into a score.
- **AD-44:** tie-break is earliest date, then smaller size, with ties reported.
- **AD-52:** feed is priced per bag ($30.60 / $29.60 / $28.60). Fixture 1 is $7,698.06.
- **AD-53:** placement step is 1 bird, so nothing rounds a recommendation. This is the cause of OQ-29.
- **AD-55 / AD-57:** bulk net = the buyer's own contract on the `SalesOrder` minus 10c abattoir and 10c transport.
- **AD-56:** each overhead line is paid on its own cadence. A MONTHLY line is split across months, never repeated.
- **AD-58:** past the top band, both planning and sales refuse. Bulk hold cost is blank from day 34.
- **AD-59:** Build Reserve scores null until a candidate has forecast sales; ranking on costs alone picked a 1-bird batch.
- **AD-60:** one refusal list (`refusals.ts`) for decision, calendar and allocation; fixture 13's wording follows it.

Full log: `progress-tracker.md` § Architecture Decisions.

## Files a new session should read, in order
1. `context/SESSION.md` (this file).
2. `context/CONTEXT.md`: only if writing or renaming an identifier.
3. `context/current-issues.md`: only if touching a blocker above. Read that OQ's entry, not the whole file (2.2k lines).
4. `context/progress-tracker.md`: only if you need an AD's full reasoning or a unit's history. Grep `**AD-NN`.
5. `context/architecture.md` + `code-standards.md`: only if changing engine structure or starting a new module.
6. `context/plans/u5-allocation-optimiser.md`: only if resuming M5b Task 9.
7. `context/ai-workflow-rules.md` + `skills.md`: only if starting a new unit.
8. `context/ui-context.md`, `ui-build-playbook.md`, `card-system-and-decision-ux.md`: only for UI units (U7-U11). For U9, read the OQ-29 section first.

## Recommended next action
Get sign-off on chunk 4 (facts, D13-D19). On approval: log ADs, add its constraints to AD-63, log OQ-32/33 in `current-issues.md`. Then draft chunk 5 (access). The user must reconnect `supabase` in `/mcp` and pass the step-3 read-only check before any MCP call. Update this file when planning ends, before any schema code.

## Maintaining this file
- Update at the end of every unit, and on any commit that changes state a future session needs.
- When SESSION.md disagrees with another file, whichever was updated more recently against reality wins. SESSION.md is updated per-commit; other files can go stale between updates. Fix whichever is behind.
- Keep under ~5k tokens. When it grows, move older detail to where it belongs (ADs to `progress-tracker.md`, blockers to `current-issues.md`) and leave a pointer.
