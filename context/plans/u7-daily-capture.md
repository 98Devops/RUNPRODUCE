# U7 — Daily Capture

**Spec in progress.** Presented in chunks for sign-off, started 2026-09-27.
Planning only: no code, no database work, no MCP call. Nothing here waits on
Daniel. The form is built from `DailyRecord` and the chunk 5 write function
`record_daily_records`, both of which already exist. OQ-5 (who captures)
changes who gets a membership, not what the form is.

---

## Chunk 1 — Framing: what U7 builds, from what, and where it stops

**Status: approved 2026-09-27**, with one addition to D3 and the rulings below.
- **D1 done.** u6 merged into `main` (`29b6f83`), then u9 (`4132e80`). This
  branch was rebased onto `main`. `main` is green, not red: chunk 7's
  implementation (`b84d0d3`) was already on u6 when it merged.
- **D2 approved** as drafted. OQ-5 carries the note to revisit the method.
- **D3 approved, plus `feed_entry_source`** (see D3's addition).
- **D9 approved:** feed draws stay in U8.
- **`feed_entry_source` approved as the field name** (2026-09-27), with the
  deferred landing: added during U7's build, test-first, all touched surfaces
  in one commit, null meaning "not recorded" on historical rows.
- **D4 to D8 approved as drafted** (2026-09-27), **with one amendment to D5:**
  the feed phase is derived from the day number against the breed curve, never
  chosen by the worker. See D5.
- **Impeccable audit gate: deferred, not blocking.** `ui-context.md` §0 plus
  `web-design-guidelines` cover U7. Re-evaluate before the U11 deploy.
- **TD-7 and TD-10 are both closed** (2026-09-27). A fresh local reset runs every
  migration, and Netlify builds from GitHub `main`.

### What U7 is

Flow 2 in `project-overview.md`: a farm worker records one day for one batch in
under 60 seconds on a phone. It is the only fact the whole forecast grows from.
The brief is in `BUILD-KICKOFF.md` ("U7 — Daily capture"): VISUAL_DENSITY 2, one
column no wider than 480px, `text-2xl` inputs, targets of 44px or more, one
large submit, no navigation chrome, a localStorage draft, and a feed pre-fill
from the standard curve, visibly marked as a default.

### The form is `DailyRecord`, as the database stores it

| `DailyRecord` (engine) | Database row (`record_daily_records`) | On the form |
|---|---|---|
| `day_number` | `record_date` | **Date**, defaulting to today. Shown as "Day 12 · Sat 21 Mar". Never typed as a day number: the engine derives it (`dayNumberFor`) |
| `mortality_cumulative` | same | **Total dead so far.** The cumulative figure, as CONTEXT.md requires: "This is what gets entered". The last recorded total is shown beside it ("was 14 on day 11") |
| `cull_cumulative` | same | **Total culled so far.** Same rule (AD-25). See D4 |
| `feed_starter_kg` / `_grower_kg` / `_finisher_kg` | `feed_*_g`, integer grams | **Feed issued today, kg**, by type. Converted kg to g at the boundary (TD-5). All three are required, with no default (AD-82). See D5 |
| `avg_weight_g`, `weight_sample_size` | same, both or neither (DB check) | **Weighed birds today?** Collapsed by default; opening it asks for both |
| (none) | `notes` | Optional, collapsed |
| (none) | `client_request_id` | Generated once per draft, kept in the draft, so a retry after a lost response is a no-op (AD-75, D30) |

Nothing on the form is derived. Daily deaths, birds alive and FCR are the
engine's (invariant 3), and none is shown on the capture screen except the
previous cumulative totals, which are read, not computed.

### Decisions

**D1 · Where U7 is built: a branch from `main` after both open branches merge.**
U7 needs the Next.js scaffold, which is on `u9-first-screen`, and the
repositories, which are on `u6-supabase-schema` (chunk 7 green, `b84d0d3`). Today
neither branch has both.

| Option | Against |
|---|---|
| **Merge `u6-supabase-schema`, then `u9-first-screen`, into `main`; branch U7 from `main`** | Two merges before U7's first commit. The only known conflict is `apps/web/package.json`, whose resolution is u9's file plus `zod` (tracker) |
| Branch U7 from u6 and merge u9 into it | U7's diff then carries all of U9 v1, and its review cannot tell the two apart |
| Build the scaffold again on u6 | Two copies of the same scaffold, which is the conflict the u9 branch was built to avoid |

*Recommended: the first.* This plan is committed on `u7-daily-capture`, cut from
`u6-supabase-schema` only to hold the document, and is rebased onto `main` when
the merges land. **The merges are the user's call.**

**D2 · Sign-in is in U7, as the smallest thing that gives a request a session.**
Every write needs a session: `record_daily_records` refuses without one (AD-88),
and a repository client carries the caller's JWT (AD-94). The app has no
sign-in today.
- **In:** a sign-in page (email and password, Supabase Auth, as
  `architecture.md` says), a session in cookies through `@supabase/ssr`, a
  sign-out, and a redirect to sign-in from the capture route.
- **Out:** sign-up (memberships are created by the service role, AD-85),
  password reset by email, and organisation switching (`architecture.md`: one
  organisation at MVP).
- **The guard still runs.** `@supabase/ssr` creates its own client, so its
  factory goes in `lib/repositories/client.ts` beside `createRepositoryClient`,
  behind `resolveProjectTarget`, and T-RP5's lint grows to cover
  `createServerClient` and `createBrowserClient`.
- **A new dependency:** `@supabase/ssr`, verified before it is imported
  (ui-context §0).

*Recommended.* The open point is the credential itself. Email and password is
what the architecture names, but a farm worker on a shared phone may have no
email address. **Does not block chunk 1:** the page is the same for a phone-OTP
provider later, which is a settings change in Supabase Auth.

**D3 · The feed pre-fill: a suggestion the worker taps, not a value already in the field.**
The brief asks for the day's standard feed to be pre-filled and "visibly marked
as a default". Two findings shape how:
1. **A WORKER cannot read the breed curve** (D21, AD-86: "Capture needs none").
   The brief says it does. AD-86 records this as a default, not a final
   position: "adding a read is a one-line policy later".
2. **A pre-filled value that is submitted unchanged is stored as recorded
   feed.** Nothing in the row says it came from the curve. Calibration and FCR
   would then read the standard back as a measurement, which is the "absence
   passed off as a measurement" invariant 5 forbids.

So:
- **The field starts empty.** Under it, a button: "Standard for day 12: 105 kg
  · Use". One tap fills it. The field then shows it was taken from the
  standard until the worker edits it. Tapping is the confirmation, so a stored
  value was always chosen by a person.
- **The figure is the engine's.** Standard feed per bird for the day, times
  birds alive at the last record, in kg. That is arithmetic, so it belongs in
  the engine (architecture: routes do "no arithmetic beyond formatting"). It
  needs one small engine function, test-first. It touches nothing OQ-25 or
  OQ-42 to 45 depend on.
- **The curve read.** Add `breed_curve_points` and `breed_curve_phases` to what
  a WORKER reads. They hold no money, so D22's whole-table rule allows it
  (feed prices live on the parameter set, which stays OWNER and MANAGER). This
  amends AD-86's third default, and it is a migration, applied to dev in a
  narrow write window when U7 needs dev.

| Option | Against |
|---|---|
| **Suggestion button, tapped to fill** | One extra tap per capture |
| Pre-fill the input, as the brief says | The stored feed cannot be told from a measured one. Calibration reads the curve back as data |
| No pre-fill for a WORKER | Loses the brief's biggest time saving ("that alone could halve capture time", card-system doc) |
| Store a `feed_source` column on the record | A schema change to chunk 5's table, to record something a tap makes unnecessary |

*Recommended: the suggestion button, and the curve read for WORKER.* **This
departs from the brief's wording**, so it needs the user's sign-off.

**Addition to D3 (the user, 2026-09-27): the stored feed says where it came from.**
The tap makes every stored value a person's choice, but a value confirmed from
the standard and a value weighed out of the store are different evidence.
Both are legitimate entries. Calibration (AD-38) must be able to tell them
apart later, so the row records which it is. This reverses the table's last row
above, which called the column unnecessary.
- **Engine, `types.ts`:** a new union `EntrySource = 'MEASURED' |
  'STANDARD_CONFIRMED'` and a new field on `DailyRecord`. Proposed name:
  `feed_entry_source`, because only the feed has a suggestion. Deaths, culls and
  weights are always typed in, so a record-wide `entry_source` would claim more
  than it knows. **Approved 2026-09-27.** A runtime array `ENTRY_SOURCES` goes
  in `enums.ts` (AD-92).
- **Set by the form, not inferred:** `STANDARD_CONFIRMED` when the day's feed
  is the standard figure, tapped and unedited; `MEASURED` when typed or edited
  after the tap.
- **Rows that predate the field** (dev's seed, any import) have no honest
  value. The field is `EntrySource | null`, where null means "not recorded",
  never a default to `MEASURED` (invariant 5). Every constructor must state it,
  so golden fixtures carrying records gain an explicit `null`.
- **Database:** a nullable `feed_entry_source` column on
  `facts.daily_record_versions`, with a named CHECK. It goes into AD-63's drift
  test, `record_daily_records`' payload (a required key, per chunk 3's "present
  even when null" rule), the no-op comparison, `public.daily_records`,
  `engine_snapshot` and the pinned snapshot contract.
- **Calibration does not read it yet.** Weighting the two sources differently
  is a separate decision, taken after real data exists.
- **Lands test-first in U7's build**, not ahead of it: it touches the engine
  type, the golden fixtures, a migration and the snapshot contract together.

**D4 · Culls: shown, carried from the last record, and changed only on purpose.**
`cull_cumulative` is required on every record (not null), but the brief lists
three fields and culls are rare. A cumulative that has not changed is the last
recorded total. That is the "carried forward" meaning CONTEXT.md already
defines, not an invented number.
- The form shows "Culled so far: 3 (same as day 11) · Change". The row sends 3.
- The first record of a batch has nothing to carry, so it asks for culls
  outright. The screen never defaults it to 0.

*Recommended.* The alternative, a fourth always-open field, costs every capture
a field that is 3 on most days.

**D5 · Feed by type: ~~the day's phase first, the others explicit~~ one amount, in the phase the curve names for the day.**
*Amended by the user, 2026-09-27.* The draft showed all three types and let the
worker fill any of them. That leaves "worker put it under the wrong type" as a
data-quality failure. The phase is a fact about the day, not a choice: day 12 is
whatever the curve says day 12 is. The user reports this is how Daniel's own
spreadsheet works.
- **One field:** "Starter feed issued today, kg (day 12)". The label names the
  derived phase. There is no phase picker, dropdown or second field.
- **The phase is `phase` on the curve's point for the day.** Every curve point
  already carries one, and `create_breed_curve` refuses a point whose label
  disagrees with the phase ranges. The engine gets a small `feedPhaseForDay`
  (chunk 4), test-first.
- **The server derives it, not the browser.** The browser sends one number; the
  server action reads the curve, derives the phase and builds the three
  columns. The browser derives it too, but only for the label. A tampered
  request cannot choose the phase.
- **The row stores the amount under the derived phase and 0 under the other
  two.** Those zeros are not defaults: they follow from the rule "the day's feed
  is all of the day's phase", which is a stated rule, not a guess about a
  blank. AD-82 still holds for the one field: a blank refuses to submit, so a 0
  typed there is a person's choice.
- **The database does not enforce it.** `record_daily_records` keeps its three
  columns, so `DailyRecord`, the golden fixtures and AD-82 are unchanged, and a
  later import of historical records with mixed days still fits. A DB check
  against the curve was rejected: it would tie stored facts to one curve
  version, so revising the curve would make old rows invalid.
- **Backfill and corrections derive the same way:** a record for day 9, entered
  on day 14, goes under day 9's phase.

**Two consequences, flagged:**
1. **Changeover days.** A farm that starts grower a day early, or finishes a
   starter bag on day 14, is recorded under the curve's phase anyway. The cost
   effect is small ($1 a bag between phases), but a per-type stock
   reconciliation in U8 can show small mismatches around the changeovers. It
   is noted there, not solved here.
2. **A day past the curve's end has no phase.** The seed curve ends at day 41
   (finisher, days 28 to 41), and a late harvest can run past it. Options:
   | Option | Against |
   |---|---|
   | **The last phase carries on, and the label says so ("Finisher, past the curve's day 41")** | It extends the curve by an assumption, although birds past the curve do eat finisher |
   | Refuse the record past the curve's end | Blocks recording deaths too, because the row needs feed. Loses real data |
   | Ask the worker to pick, only past the curve | Brings back the choice this amendment removes |

   *Recommended: the first, labelled.* **Approved 2026-09-27:** finisher
   carries forward, labelled clearly, and the record says so (below).

**Refinement to D5 (the user, 2026-09-27): the record says how its phase was
set.** Recorded as **AD-99**. A zero written under the phase rule, a zero the
operator typed, and a feed amount never recorded are three different facts, and
a later consumer must be able to tell them apart.
- **Two fields join `feed_entry_source` on `DailyRecord`:** `feed_phase: Phase |
  null` (the phase the amount was written under) and `feed_phase_source:
  PhaseSource | null`, where `PhaseSource = 'FROM_CURVE' |
  'EXTRAPOLATED_BEYOND_CURVE'`. A runtime array `PHASE_SOURCES` goes in
  `enums.ts`.
- **Both null** means the row predates the rule. **Both or neither** is a DB
  check. A second named check requires the two other phase columns to be 0 when
  `feed_phase` is set. Neither check reads a curve.
- **`feed_phase` is stored, not inferred:** when the operator types 0, all three
  columns are 0 and nothing else says whose zero is whose. AD-99 has the table.
- **Past the curve, only the phase carries forward, never the amount:** no
  standard-feed suggestion is offered after the curve's last day.
- **Lands with `feed_entry_source` in chunk 3** (the same surfaces, one
  commit). `feedPhaseForDay` returns `{ phase, source }` and lands in chunk 4.

**Found while amending, for chunk 3:** a WORKER cannot learn *which* curve is in
force for a batch. The parameter set names it, and a WORKER cannot read
parameter sets (money). So D3's "curve read for WORKER" also needs the curve id
for the batch and date. Chunk 3 decides how: the likely shape is
`capture_batches()` returning the curve id in force, without touching the money
tables' grants.

*Approved as amended.*

**D6 · Offline: a draft on the phone, never a queue.**
- The form saves to localStorage on every change, keyed by batch and date. The
  key holds the `client_request_id`, and a reload restores the draft
  (`project-overview.md` scope: "a local draft of the capture form").
- Submitting needs a connection. With none, the button says so and the draft
  stays. There is no background sync (out of MVP scope).
- A submit whose response is lost is retried with the same
  `client_request_id`, so a duplicate is impossible (AD-75).
- Storage reads and writes are wrapped, so a phone with storage blocked still
  captures, just without the draft.

*Recommended.*

**D7 · Missed days and corrections: in U7, in the smallest form.**
OQ-5 warns that capture may come in weekly bursts, so a missed day is the normal
case, not an edge case.
- **Backfill:** the date is changeable, to any day from placement to today.
  Days already recorded show their values and are corrected rather than
  re-entered.
- **Corrections** follow AD-86 as the database enforces it: a WORKER corrects
  only their own record (`created_by` is on `public.daily_records` for this
  purpose). A correction sends `supersedes_id`. A stale one is
  `StaleCorrection`, shown as "This record changed since you opened it."
- **A wrong date is voided and re-entered** (AD-84). U7 offers the void for the
  author's own records only.
- **Staleness is shown:** "Last recorded day 22 · 4 days behind" (OQ-5's
  handling).

*Recommended.*

**D8 · Errors say what the database said.**
The write path maps SQLSTATEs through `mapDatabaseError` (AD-93):
`IntegrityRejected` shows the database's own sentence (for example the total
dead going down, or removals exceeding the flock), `Forbidden` shows the
own-record message, and `Conflict` shows "Someone saved this date first.
Reload." Errors appear below the field they concern where the message names
one, and above the button otherwise (§0: errors below inputs).

**D9 · Where U7 stops.**
- **In:** sign-in (D2); the capture route; `recordDailyRecords` (D30's write
  repository for daily records, the only D30 repository U7 needs, test-first
  with its DB half); `captureBatches` over `public.capture_batches()`; a
  `dailyRecords(batchId)` reader for the previous totals and the backfill list;
  the curve read for WORKER (D3); the engine's standard-feed function (D3); the
  draft (D6).
- **Out:** feed draws. `FeedDraw` is Flow 3, owner-only and money-bearing (a
  WORKER cannot write one, AD-86), and it is U8 in the build order. U7's input
  components are built so U8's draw form reuses them. Also out: any change to
  U9 v1, and every engine rule that waits on OQ-25 or OQ-42 to OQ-45.

*Recommended.* **Flagged because the request named `FeedDraw`:** if the draw form
is wanted in U7 after all, it adds one chunk and `recordFeedDraw`. Nothing else
changes.

### What this unit depends on, outside itself

- ~~**TD-10 · A Linux build for Netlify.**~~ **Closed 2026-09-27.** Netlify
  builds from GitHub `main` on the Next runtime, so U7's session-reading route
  deploys by merging to `main`.
- ~~**TD-7 · Migration 6 on a fresh local database.**~~ **Closed 2026-09-27.**
  U7's migrations go through `db reset --local` like any other.
- **The UI gate: `/impeccable audit` is deferred, not blocking** (the user,
  2026-09-27). U7's gate is `ui-context.md` §0 plus `web-design-guidelines`.
  Re-evaluate before the U11 deploy.
- **Acceptance** is timed on a real phone, under 60 seconds (`ai-workflow-rules.md`).
  That timing is the user's to run; the plan provides a Playwright run at 390px
  as a proxy, not a substitute.

### Chunks still to come

2. **Session and sign-in (D2).** Drafted below, for sign-off.
3. **Reads and the write repository (D9).** `captureBatches`,
   `dailyRecords`, `recordDailyRecords`, the WORKER curve-read migration
   (including how a WORKER learns the curve in force, D5), and
   `feed_entry_source` end to end (D3's addition: engine type, column, contract),
   each with its fake-client unit half and its DB half on the local stack.
4. **The engine's standard feed and phase for a day (D3, D5).** Test-first in
   `packages/engine`: `feedPhaseForDay` and the standard feed, including the day
   before placement and a day past the curve's end.
5. **The capture screen (D3 to D8).** The form, the suggestion, the draft,
   backfill, corrections and errors, in an order where each step is usable.
6. **Gates and acceptance.** `web-design-guidelines`, the 390px Playwright run,
   and the user's phone timing. (`/impeccable audit` deferred, see above.)

### The discussion points, in short (all ruled 2026-09-27; see Status above)

1. **D1: merge u6 and u9 into `main`, then branch U7.** Done.
2. **D3: the pre-fill is a tapped suggestion, not a filled field,** and a
   WORKER may read the breed curve. Approved, plus `feed_entry_source`.
3. **D2: email and password.** Approved; revisit per OQ-5.
4. **D9: `FeedDraw` stays in U8.** Approved.
5. **The field name:** `feed_entry_source`. Approved.
6. **D4 to D8:** approved as drafted; D5 amended to a derived phase.

---

## Chunk 2 — Session and sign-in (D2)

**Status: approved 2026-09-27, all of it:** server-only sign-in (D10), the
uniform error message (D11), `/` public through U7 (D13), a Netlify branch
deploy of `u7-daily-capture` to verify middleware (D15), and the Node 20 pin.
**Chunk 2 does not merge to `main` until the branch deploy confirms the
middleware.**

### What chunk 2 lands

A person signs in with email and password, gets a session in cookies, reaches
`/capture` and signs out. `/capture` is a placeholder in this chunk: it proves
the session by showing who is signed in, for which farm, in which role. Chunk 5
replaces its body with the form. Nothing about capture itself lands here.

### Findings that shape it

1. **Invariant 4: only `lib/repositories` imports the Supabase client.** That
   covers auth calls too, so sign-in, sign-out and "who am I" are repository
   functions, not code in a route.
2. **`@supabase/ssr` 0.12.7 is current** (checked on npm, 2026-09-27). Its peer is
   `@supabase/supabase-js ^2.114.0`; the repo resolves 2.116.0. It has one
   dependency of its own (`cookie`). Its documented contract:
   - cookies through `getAll` and `setAll` only (the older `get`, `set` and
     `remove` are deprecated);
   - a new client per request, never shared;
   - **middleware must refresh the session**, or users see random logouts. This
     matters here because refresh-token rotation is on
     (`enable_refresh_token_rotation`, reuse interval 10 s, in `config.toml`).
3. **Identity comes from `getClaims()`, which verifies the JWT.** `getSession()`
   reads the cookie unverified, and supabase-js warns it must not be trusted
   on the server.
4. **Local Auth already refuses sign-ups** (`[auth] enable_signup = false`),
   which matches D2: memberships are made by the service role (AD-85). Dev's
   setting has not been checked.
5. **`public.my_memberships()` exists** (migration 1) and is granted to
   `authenticated`, so "which farm, which role" needs no migration.
6. **`/` is U9 v1 on fixtures, public, and its link is going to Daniel.**
7. **`netlify.toml` does not pin Node**, which `architecture.md` requires. CI
   runs Node 20; this machine runs 24.

### Decisions

**D10 · One server-side session client, behind the guard; no browser client.**
- `lib/repositories/session.ts` exports `createSessionClient(jar, env)`. It
  runs `resolveProjectTarget` first, then `createServerClient` with the jar's
  `getAll` and `setAll`. `jar` is a two-method interface of our own, so the
  same factory serves server actions, server components (Next's `cookies()`)
  and middleware (the request and response). The adapters hold no Supabase
  import.
- **No `createBrowserClient`.** Sign-in and capture both submit through server
  actions (code-standards: "Server actions for mutations"), so the browser
  never holds a Supabase client, a key or a token. The env vars are server-only:
  `SUPABASE_URL` and `SUPABASE_ANON_KEY`, with no `NEXT_PUBLIC_` prefix.
- **T-RP5's lint grows:** `@supabase/ssr` may be imported only in
  `session.ts`, and `createBrowserClient` nowhere in `apps/web`.
- Repositories keep taking a `SupabaseClient`, and a session client is one, so
  `loadEngineInput` and chunk 3's functions need no change.
  `createRepositoryClient` (JWT in a header) stays for server-to-server paths.

| Option | Against |
|---|---|
| **Server-only session client; server actions for sign-in** | Sign-in is a full form post, not an in-page call. Fine for one form |
| A browser client for sign-in | A second client path that has to carry the guard; keys and tokens in the browser; `NEXT_PUBLIC_` env |

*Recommended: the first.*

**D11 · Auth is four repository functions and one error class.**
In `lib/repositories/auth.ts`:
- `signIn(client, { email, password })`: resolves, or throws `SignInRefused`.
- `signOut(client)`: this device only (`scope: 'local'`), so signing out a shared
  phone does not sign the owner out of their laptop.
- `currentUser(client)`: `{ userId, email }` or null, from `getClaims()`.
- `myMemberships(client)`: over `public.my_memberships()`, Zod-parsed like
  AD-92, returning `{ orgId, orgName, role }[]`. An unknown role is a
  `RepositoryError`, never passed through. A `ROLES` array lives beside it
  (roles are the app's, not the engine's).

`SignInRefused` carries a machine `code` and a human `message`
(code-standards):

| Auth error code | Message |
|---|---|
| `invalid_credentials` | "Email or password is wrong." One sentence for both, so the form never tells anyone which emails have accounts |
| `over_request_rate_limit` | "Too many attempts. Wait a minute and try again." |
| `user_banned` | "This account is switched off. Ask the owner." |
| network failure (retryable fetch error) | "Can't reach the server. Check the connection and try again." |
| anything else | "Sign-in failed. Try again." The code is logged server-side, not shown |

*Recommended.*

**D12 · Routes, and the gate that checks twice.**
- **`/sign-in`:** email, password and one button (§0: 44 px targets, errors
  above the button). On success it goes to `next` when that is safe, else
  `/capture`. A signed-in visitor is sent to `/capture`.
- **Sign-out:** a server action posted by a form button. POST only, because a
  GET link can be prefetched and sign people out.
- **`/capture`:** the placeholder described above. With no membership it says
  "No farm access yet. Ask the owner to add you." A user with no membership
  therefore sees why, rather than an empty batch list in chunk 5.
- **The gate:** a pure function `gate({ pathname, signedIn })` returns "pass"
  or "redirect to X". Middleware is a thin shell around it that also refreshes
  the session (finding 2). `safeNextPath(raw)` accepts only a path starting
  with a single `/`, rejecting `//host`, `/\host`, full URLs and `javascript:`,
  and falls back to `/capture`.
- **Middleware matches `/capture` and `/sign-in` only.** `/` and static assets
  are untouched.
- **Middleware is not the authority.** The `/capture` page and every server
  action check `currentUser` themselves and redirect or refuse. A skipped
  middleware then costs a stale session, not access (middleware bypasses are a
  known class of Next.js bug). RLS remains the last word on data regardless.

*Recommended.*

**D13 · The console stays public through U7.**
`/` shows fixtures, and the user is sending its link to Daniel. Gating it
would break that link and protect nothing real. It goes behind the session,
OWNER and MANAGER only, in the unit where it first reads real data. That unit
records the change.

*Recommended.*

**D14 · Users and environments.**
- **Local:** users come from the service role, as the DB harness already does
  (`newMember`). For checking the screens by hand, a local-only script creates
  one OWNER and one WORKER on the local stack, behind the DB tests' env guard,
  which refuses dev and production.
- **Dev: nothing in chunk 2.** The deployed sign-in needs a dev user with a
  membership. That is a dev write, taken in a narrow window when U7 first
  deploys (chunk 6), not now.
- **Before chunk 6, a read-only check** that dev's Auth refuses sign-ups. If it
  does not, the change is the user's to make or approve. Without it, anyone
  with the public anon key could create an account. RLS would still show them
  nothing, but the account would exist.

**D15 · `main` and the live URL are not touched.**
- Chunk 2 lands on `u7-daily-capture` only. Nothing merges to `main` while the
  user is showing Daniel the URL.
- **When U7 merges:** `SUPABASE_URL` and `SUPABASE_ANON_KEY` go into Netlify's
  env first. Middleware does not match `/`, so a missing variable breaks
  `/sign-in` and never the console.
- **Middleware on Netlify is unverified.** The plugin runs it as an edge
  function, and `@supabase/ssr` is documented to work there, but it has not
  been run on this site. It is verified on a branch deploy of
  `u7-daily-capture` before the merge. Branch deploys are a Netlify site
  setting, so switching one on is **a config change I would ask for first**.
- **Pin Node 20 in `netlify.toml`** (finding 7), matching CI, which is the
  build that gates. This is one line, landed with chunk 2 on the branch.
  Local's 24 is noted in `current-issues.md` as a mismatch, not changed.

**D16 · Tests, in TDD order, each watched red first.**

*Unit, `apps/web` (fake or mocked client, no database):*
- **T-S1 session client guard:** a non-dev URL with no target means
  `createServerClient` is never called. After a pass, it is called once, with
  the jar's `getAll` and `setAll`. Same `vi.mock` pattern as T-RP4.
- **T-S2 `safeNextPath`:** a table of accepted and refused inputs, as in D12.
- **T-S3 `gate`:** signed out at `/capture` redirects to
  `/sign-in?next=/capture`; signed in at `/capture` passes; signed in at
  `/sign-in` redirects to `/capture`; signed out at `/sign-in` passes.
- **T-S4 the auth error table:** each code to its message, an unknown code to
  the generic one, and a retryable fetch error to the connection message.
- **T-S5 `myMemberships` parsing:** rows mapped, an unknown role refused.

*Database half, `packages/db-tests`, on the local stack:*
- **T-S6 sign-in round trip:** `signIn` through a real session client and an
  in-memory jar leaves an auth cookie in the jar. A fresh client built from that
  jar reports the member from `currentUser`, and its RPCs run as the member
  (`capture_batches()` shows only their organisation).
- **T-S7:** a wrong password and an unknown email both throw `SignInRefused`
  with `invalid_credentials` and the same message.
- **T-S8:** `signOut` clears the jar's auth cookies; `currentUser` is then null.
- **T-S9:** `myMemberships` for a WORKER returns one organisation, role
  WORKER; for a user with none, an empty list.

*Lint:* T-RP5's extension, proven by a deliberate violation that fails
`npm run lint`, then removed.

*Not automated in chunk 2:* the middleware shell and the two pages. They are
thin by design (D12), and checked by hand at 390 px against the local stack.
The automated end-to-end run is chunk 6's Playwright, which covers sign-in
too, so `@playwright/test` is not added here.

### Out of chunk 2

Sign-up; password reset; phone or OTP sign-in (OQ-5 revisits the method);
organisation switching; per-role routing beyond "signed in" (a WORKER and an
OWNER both reach `/capture`); anything on `/`; any dev or Netlify change.

### New dependency

`@supabase/ssr@^0.12.7` in `apps/web`, verified above (ui-context §0). Nothing
else.

### For sign-off

1. **D10:** server-only session client, no browser client.
2. **D13:** `/` stays public through U7.
3. **D15:** a Netlify branch deploy of `u7-daily-capture` to verify middleware
   before the merge. That is a site setting I would change only with a yes.
4. **D5's open point:** past the curve's last day, the last phase carries on,
   labelled. Not needed until chunk 4.
