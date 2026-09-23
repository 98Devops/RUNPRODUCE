# RunProduce - Session State
Last updated: 2026-09-23 (chunk 7 red phase committed; implementation not started) · Branch: `u6-supabase-schema`

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
- ~~**Read-only is NOT yet confirmed in effect.**~~ **CONFIRMED 2026-09-15** after the user re-authenticated: `SELECT 1` ok; `transaction_read_only` = `on` as `supabase_read_only_user`; `CREATE TABLE _readonly_test` rejected (25006); no `apply_migration` tool offered. Earlier note: At the end of chunk 3 the live connection predated the URL change (`transaction_read_only` = `off`, user `postgres`; `apply_migration` offered). **Re-checked 2026-09-14 after chunk 5 approval:** `claude mcp list` shows `supabase` (URL with `project_ref=zlvjmaorlxrjnuxhykuh&read_only=true`) as **"Needs authentication"**, so no `supabase` tools are loaded and the check could not run. The claude.ai Supabase connector shows connected; it is denied and was not used.
- **PRE-FLIGHT GATE before any migration runs. The user handles this step (2026-09-14); make no MCP call for it.** The check: no `apply_migration` in the tool list; `CREATE TABLE _readonly_test (id int)` rejected; `SELECT 1` succeeds and `transaction_read_only` reads `on`. No schema code from any chunk until the user reports it passed and planning has ended.
- **Writes on dev: 6 migrations, 2026-09-15** (chunk 5, versions listed under In progress), in one write window the user opened. The user restores `read_only=true` out of band; **a new session verifies read-only (the check in step 3) before any MCP call.** No other write has touched dev. **2026-09-23: dev was not touched at all (read or write) by the user's instruction, until they verify read-only on both sides.** The one read made at session start (`list_migrations`, before the read-only check completed) showed the six canonical migrations and no drift; see the discipline note in `progress-tracker.md`.

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
- **U6 chunk 5 shipped, 2026-09-15:** 6 migrations applied to dev, DB suite 50/50 locally.
- **Daniel's answers 2026-09-15:** AD-96 (over 1.3 kg dressed pays less, ~$3.50; not built, OQ-41), AD-97 (bulk buyer no cap), AD-98 (delivery always abattoir).
- **Status:** engine 348 unit tests; golden 11 written / 11 passing / 1 held; lint clean. `apps/web` unit suite 49 red and `tsc` red on 9 enum exports, by design (chunk 7 red phase). DB suite 35 red / 37 green of 72, by design.

## In progress
**U6 status: chunk 5 complete; chunk 7 red phase committed (`engine_snapshot` + `loadEngineInput`), implementation next; chunk 8 planned.** Spec: `context/plans/u6-supabase-schema.md`.
- **Chunk 5 SHIPPED to dev, 2026-09-15.** Six migrations applied through the MCP. The MCP stamps its own versions, so the files were renamed to match (`eb393ee`). **These are the canonical file names:**
  - `20260915064600_access_baseline`
  - `20260915065245_parameters`
  - `20260915065409_facts`
  - `20260915065443_views`
  - `20260915065625_write_functions`
  - `20260915071004_security_definer_comments`: explicit revoke on `rls_auto_enable`, AD-88/89 comments on the 12 RPCs (`9495068`).
  - **Dev end state, verified:** 10 `facts` tables, 8 `public` tables and `private.memberships`, all with RLS on; 13 `security_invoker` views; 12 `SECURITY DEFINER` RPCs (`authenticated` yes, `anon` no); no client write grants.
  - **One platform default quarantined:** `public.rls_auto_enable()` and its `ensure_rls` event trigger (Supabase's, not ours). Only `postgres` and `service_role` can execute it. TD-6 (next week) adds the RLS-on-every-table test that excludes it by name.
  - **Advisor findings, all accounted for:** `rls_enabled_no_policy` on `private.memberships` (intended, AD-85); 12× `authenticated_security_definer_function_executable` (intended, AD-88/89, now commented in the database); 54× `unindexed_foreign_keys` and 6× `unused_index` (INFO; empty database, left until real volumes).
  - DB suite `packages/db-tests` is 50/50 on a local stack (not yet run against dev): T-DB2 as OWNER and WORKER, T-RP1 canary on 11 fixtures (mutation-checked), AD-63 drift on 14 constraints, T-RT1 part 3, T-RT2, T-RT3, T-DB1, T-DB3.
  - Integrity lock is `FOR NO KEY UPDATE` (T-DB2 found `FOR UPDATE` deadlocks).
  - Not done: T-AC1 to T-AC5, a CI DB job, TD-6.
  - T-RP1 (and T-RT2, T-RT3) now read through `loadEngineInput`; the test-local loader is deleted (2026-09-23).
- **Task 0 done:** one shared refusal list, `missingInputsFor` in `refusals.ts` (TD-4 #8, AD-60).
- **Chunk 1** (framing, dev project): drafted.
- **Chunk 2** (parameters, opening cash, D4-D8): approved, AD-61 to AD-67.
- **Chunk 3** (parameter tables, D9-D12): approved, AD-68 to AD-72. `create_parameter_set` in one transaction; `revision`; immutable breed curves pinned by the batch; `bag_kg` on `feed_prices`; T-RT1 overhead round trip. `gate_price_cents_per_bird` stays; `mortality_history` is deleted in the build.
- **AD-72** (approved): T-RT1, the overhead round trip through `create_parameter_set`, written before any code that makes it pass.
- **AD-73** (approved, scope confirmed): an unrecognised overhead `timing` **or `basis`** is refused (`'overhead_line'` in `missingInputsFor`) with a guard throw, never dated on day 1 or charged per bird. **Standing rule:** any future categorical field with a fallback path gets the same treatment by default (`code-standards.md`). Not built.
- **Chunk 4** (recorded facts, D13-D19): **approved 2026-09-14**, AD-74 to AD-80.
  - D13 / AD-74: a batch is an identity row plus placement and closure facts; status derived.
  - D14 / AD-75: corrections append (`supersedes_id`, `voided`, `client_request_id`). **The current-row filter is enforced in the database:** version tables live in a non-exposed `facts` schema as `*_versions`; the plain names in `public` are `security_invoker` views of current rows; history is `*_history`. Repositories read views only, and a test enforces it.
  - D15 / AD-76: deferred triggers enforce impossible facts (removals or sales over flock, cumulatives decreasing). "Sold more than alive" stays an engine refusal. One `SECURITY DEFINER` write function per fact.
  - D16 / AD-77: daily records store `record_date` and grams (engine kg is TD-5).
  - D17 / AD-78: a draw belongs to one batch; `bags numeric`, at most 2 decimals by CHECK (never silently rounded), part bags recordable.
  - D18 / AD-79: forward sales orders stored; no derived money; BANDED only on BULK.
  - D19 / AD-80: payments, receipts, facilities, allocations, expenses, offal deferred; cash accounts and transactions built.
- **Client questions:** never drafted or sent from here. Gaps are logged as OQs with proposed wording; the user handles Daniel. Index: `current-issues.md`, "Client questions outstanding". Logged 2026-09-14: OQ-32 to OQ-34 (chunk 5 assumptions), OQ-35 to OQ-37 (left over from the 2026-09-12 list), OQ-5 extended for chunk 6. Logged 2026-09-15: OQ-38 to OQ-40 (chunk 8 seed).
- **Chunk 5** (fact table structure): **approved 2026-09-14**, AD-81 to AD-84. Built on assumed answers OQ-32 a, OQ-33 a/b, OQ-34 a. Tests T-RT2, T-RT3, T-DB1 to T-DB3.
  - AD-81: `facts` holds identities and versions; parameter tables stay in `public`.
  - AD-82: feed grams `not null`, no default. A blank fails to save.
  - AD-83: a draw's price is required for now; the refusal is added only if "price not known yet" proves real.
  - AD-84: a daily record on the wrong date is voided and re-entered, never moved along a chain.
- **TD-5** (engine feed in kg, database in grams): deferred out of U6, **must close before U9 starts**.
- **Chunk 6** (access, D20-D24): **approved 2026-09-14**, AD-85 to AD-89.
  - D20 / AD-85: roles in `private.memberships`, checked by `private.has_role`; `my_memberships()` is for navigation, never authorisation; membership changes service-role only in U6.
  - D21 / AD-86: role matrix. **Amended:** WORKER creates daily records and corrects or voids only their own (current version's `created_by`); MANAGER and OWNER correct any. MANAGER reads settings, MANAGER places batches, WORKER reads no curve: **defaults for U6; per-org overrides may follow once OQ-5 lands.**
  - D22 / AD-87: a role sees a table whole or not at all; money-bearing tables OWNER/MANAGER only; WORKER reads `daily_records` and `capture_batches()`. Integrity triggers `SECURITY DEFINER` (amends chunk 5 / AD-76). A WORKER's engine load throws `Forbidden` in the repository layer (chunk 7), never a `MissingInput`.
  - D23 / AD-88: org from the row, author from the session; "not permitted" and "not found" are one 42501.
  - D24 / AD-89: Supabase default grants revoked; no client write grants; RLS everywhere; sign-ups off per project.
- **Chunk 7** (repositories, D25-D30): **approved 2026-09-15**, AD-90 to AD-95.
  - D25 / AD-90: one engine read is one statement, `public.engine_snapshot` (invoker, role check first, "parameter set in force" defined once).
  - D26 / AD-91: money and bags as strings; a money field arriving as a JSON number fails Zod. Amends chunk 5: `sales_orders.bands` prices as text.
  - D27 / AD-92: fixed `EngineInput` mapping; only `dayNumberFor` and grams/1000; enum runtime arrays feed Zod and AD-63's drift test.
  - D28 / AD-93: errors typed by SQLSTATE (`Forbidden`, `IntegrityRejected`, `Conflict`, `StaleCorrection`, `NoParametersInForce`, `RepositoryError`).
  - D29 / AD-94: one client factory with the project-ref guard; service role only in `admin.ts`.
  - D30 / AD-95: thin write repositories, `clientRequestId` from the caller, a no-op returns the existing id.
  - **T-RP1 is an architectural canary** (`code-standards.md`, 2026-09-15): a red means the engine and database disagree on `EngineInput`. Stop, find the divergence, fix at source; never just make it pass.
  - **RED PHASE COMMITTED, 2026-09-23 (local stack only).** Scope: `engine_snapshot` + `loadEngineInput`.
    - **Built (stubs only, bodies throw):** `apps/web/lib/repositories/{index,load-engine-input,errors}.ts`. `index.ts` is the only entry point; every test imports through it. `apps/web` now has `test`/`typecheck` scripts, a tsconfig and a vitest config.
    - **The snapshot contract:** `apps/web/tests/repositories/snapshot-fixture.ts`, with sections `batch`, `parameter_set` (+ `overhead_lines`, `planning_bulk_bands`, `feed_prices`), `curve` (+ `points`, `phases`), `daily_records`, `feed_draws`, `sales_orders` (+ `bands`), `cash` (`accounts`, `transactions`). Money and `bags` are strings; lists arrive already ordered.
    - **Unit, `apps/web/tests/repositories/`:** `load-engine-input.test.ts` (one `rpc` call; the full D27 mapping; max omitted; `{lines: []}`; `[]` bands; missing feed price refused; 2^53+1; money-as-number and non-integer money refused; bags as a number or with 3 decimals refused; 10 unknown enum values refused, per AD-73; each D28 SQLSTATE to its typed error). `enums.test.ts` (9 runtime arrays, compile-time `Same<>` against the engine unions).
    - **DB, `packages/db-tests/tests/engine-snapshot.test.ts`:** invoker, stable, `search_path=''`; `authenticated` yes, `anon` no; exactly the contract sections; the set in force (4 dates, including a same-day revision and a set after placement); the curve priced from the set in force; RP002 and `NoParametersInForce` naming the date; max omitted or present; empty lists; current rows only; facts after `asOf` kept; voided draws out; bands `null` or ordered; every money/bags value a string; 2^53+1 end to end; the cash section (current opening; unlinked transactions before placement only); access (MANAGER yes; WORKER `Forbidden` even with no set in force; a stranger and a missing batch get the same 42501).
    - **Implementation must also:** make `Forbidden` and the other typed errors *not* subclass `RepositoryError` (a test pins this); add Zod (`zod` is not installed yet); move the enum arrays out of `enum-drift.test.ts` into the repository layer and point the drift test at them (a refactor, which must stay green); write `engine_snapshot` as migration 7, applied locally only.
    - **Assumption pinned:** a snapshot failing Zod is a `RepositoryError`.
    - **Not mapped: opening cash** (no engine field until AD-67's engine side). `engine_snapshot` still returns `cash`, tested at the SQL level.
    - **Still chunk 7, not in this red phase:** T-RP4 (client factory guard), T-RP5 (import-boundary lint), D30 write repositories, `myMemberships`, T-AC1's AD-86 extension.
- **Chunk 8** (seed, D31-D36): **drafted, awaiting sign-off.** Two organisations: "Daniel's farm (dev)" with only his sourced figures (a September parameter set and the curve; no batch, since backdating to February would be a false dated fact; no cash account), and a "SYNTHETIC" organisation for hands-on use. A provenance manifest (`client` with source, or `assumed` with an owning OQ); engine constants imported, not retyped. Eight assumed values; new OQ-38 (reserve floor), OQ-39 (gate capacity), OQ-40 (cash on hand). Seed writes through the write functions as seeded users (proposed amendment to AD-88); dev only, empty target only. Tests T-SD1 to T-SD5.
- **Chunk 9** to come: build order.

## Blockers
| Blocker | Blocks | Who resolves |
|---|---|---|
| TD-7: migration 6 fails on a fresh local DB (`rls_auto_enable` is hosted-only) | `db reset --local` through migration 6; any future CI DB job | The user: guard the revoke, or a local shim. Workaround: `--version 20260915065625` |
| OQ-25: engine holds no opening cash balance | M5b Task 9, wiring `decision.allocation` (getter throws) | Us, U6. Design approved (D8, AD-67); not built |
| OQ-26: Cover Fast can't answer structurally (candidates have no forecast sales) | 1 of 3 modes | Us, via M6 |
| OQ-31: Build Reserve pinned null for the same reason (AD-59) | 1 of 3 modes. Only Maximum Growth answers | Us, via M6 |
| OQ-29: `computeAllocation` takes 20.8 s at 5k birds, ~2 min at 30k | **U9, hard.** Needs a design answer, not "consider performance" | Us: profile first |
| OQ-41: where $3.70 ends and $3.50 begins | Building AD-96's band | Daniel (logged) |
| OQ-32 / OQ-33 / OQ-34: feed shared across batches; booked bulk weight; feed before placement | Shape of U6 chunk 5 (assumed simple answers) | Daniel (logged as OQs; the user handles) |
| No CI database target | CI DB job (suite runs locally only) | Us + user: a CI project or dev branch |
| TD-5: engine feed kg vs database grams | **U9 start** | Us, before U9 |
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
- **AD-72:** the overhead round trip (T-RT1) is written before anything that makes it pass.
- **AD-73:** an unrecognised overhead value (timing or basis) is refused, never defaulted. Any future categorical field with a fallback gets the same by default.
- **AD-75:** facts append; the plain table name is a view of current rows, raw versions are unreachable through the API.
- **AD-86:** a WORKER corrects only their own daily records; the delegation rows are defaults pending OQ-5.
- **AD-87:** a role reads a table whole or not at all; permission is `Forbidden`, never a `MissingInput`.
- **AD-90:** one engine read is one `engine_snapshot` statement. **T-RP1** proves the mapping and is an architectural canary: its red is a design question, not a bug ticket.

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
**Check in with the user before implementing** (their instruction, 2026-09-23). Then take chunk 7's red phase to green: migration 7 `public.engine_snapshot` and the Zod-backed `loadEngineInput`, on the local stack only. T-RP1 green again is the proof: any red there is a canary and gets its stop-and-diagnose treatment. Dev stays untouched until the user has verified read-only mode on both sides, and TD-7 wants their decision before the next dev apply.

Session notes, not part of the recommendation: **do not batch a gate check with anything that depends on it** (discipline note, `progress-tracker.md`, 2026-09-23). Local suite: Docker Desktop running, then `npx supabase start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta,mailpit`, then **`npx supabase db reset --local --version 20260915065625`** (TD-7; add migration 7's version once it exists, still skipping 6), then `npm run test:db:local`. Local ports are now 5442x (Windows reserved 55404 to 55503). Unit: `npm test -w @runproduce/web`. On a surprising Daniel answer, reshape chunk 5 per that OQ's entry.

## Maintaining this file
- Update at the end of every unit, and on any commit that changes state a future session needs.
- When SESSION.md disagrees with another file, whichever was updated more recently against reality wins. SESSION.md is updated per-commit; other files can go stale between updates. Fix whichever is behind.
- Keep under ~5k tokens. When it grows, move older detail to where it belongs (ADs to `progress-tracker.md`, blockers to `current-issues.md`) and leave a pointer.
