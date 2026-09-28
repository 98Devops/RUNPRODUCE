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

---

## Chunk 3 — Reads and the write repository (D9), feed provenance end to end

**Status: drafted 2026-09-28, for sign-off.** Planning only: no code, no
migration, no dev write. Decisions needing a yes are marked **▶ SIGN-OFF**.

*Numbering:* D17 onward continues this plan's own series. U6's decisions are
cited as "U6 Dn" (so the reminders are **U6 D22** and **U6 D23**).

### What chunk 3 lands

Everything the capture form stands on, below the screen, proven against the
local stack. When it is done:
- a WORKER's server session can list the batches it may capture for, learn
  each batch's curve, read that curve's daily points, and read the batch's
  current records;
- `recordDailyRecords` writes one or more days through `record_daily_records`,
  with `feed_entry_source`, `feed_phase` and `feed_phase_source` stored and
  read back through every surface (the D3 addition and AD-99);
- the round trip "WORKER writes → WORKER reads back → OWNER's
  `loadEngineInput` → engine" is a passing DB test;
- the session cookie is `HttpOnly` and, on HTTPS, `Secure` (TD-13).

The browser leg of the round trip is chunk 5 (see finding 1).

### Findings that shape it

1. **▶ SIGN-OFF · The form is chunk 5, not chunk 3.** The message opening this
   chunk describes chunk 3 as "the form itself ... the round-trip from browser
   to database to engine and back". The approved list (chunk 1, "Chunks still
   to come") has chunk 3 as the data layer, chunk 4 as the engine functions and
   chunk 5 as the form. **I have kept the approved order.** The form's label
   and its server-side phase derivation both need `feedPhaseForDay` (chunk 4),
   and the form needs this chunk's reads and write. Built first, the form would
   stand on stubs. Chunk 3 still proves the database-to-engine half of the round
   trip (T-C6).
2. **The "write repositories from chunk 7" were planned but never built.** U6
   chunk 7 approved ten of them (D30, AD-95). Only `loadEngineInput`,
   `myMemberships` and the auth functions exist (`lib/repositories/`). The
   tracker records this ("Still chunk 7, not built"). D9 already scopes U7 to
   the one it needs, `recordDailyRecords`, and that is what chunk 3 builds. U6's
   unbuilt T-AC1 extension for AD-86 (own-record corrections) comes with it,
   because it is this function's rule (T-C9).
3. **The curve is pinned by the batch, not named by the parameter set.** D5's
   closing note says "the parameter set names it". It does not:
   `facts.batches.breed_curve_id not null` (U6 D11), and `engine_snapshot`
   reads it from there. So "which curve is in force" is one fixed id per batch,
   independent of the date, and a placement correction cannot change it. The
   note's conclusion still holds: a WORKER cannot read `facts.batches` (U6 D22,
   because `public.batches` joins the placement's chick price). **This corrects
   D5's note.** It makes D18 simpler than the note expected.
4. **A WORKER cannot build the engine's `BreedCurve`, and does not need to.**
   `BreedCurve.phases` carries feed price and `bag_kg` from the parameter set
   (U6 D27), which is money. What capture needs is only in the points: each
   point carries `feed_g` (the standard) and `phase` (D5: "the phase is `phase`
   on the curve's point for the day"). So chunk 4's `feedPhaseForDay` and
   standard feed take `readonly BreedCurvePoint[]`, not a `BreedCurve`, and a
   WORKER reads points only (D18).
5. **No golden fixture carries a daily record.** All eleven have `records:
   []`. Two consequences:
   - The D3 addition's "golden fixtures carrying records gain an explicit
     `null`" touches no JSON. The fields land instead in the 26 `DailyRecord`
     literals in engine and web unit tests, which the typecheck will find.
   - **T-RP1, the architectural canary, has never round-tripped a daily
     record.** Its `record_daily_records` branch has run zero times. That is not
     fixed by adding records to golden fixtures, whose expected outputs are
     checked values, not ours to regenerate. T-C6 covers the record path
     instead, as its own test.
6. **Postgres mechanics that decide the migration's shape:**
   - `public.daily_records_history` is `select v.*`, expanded when it was
     created, so new columns never appear in it until it is recreated. `create
     or replace view` can only append columns, so it is dropped and recreated,
     with its grant.
   - `public.daily_records` lists its columns, so the three are appended with
     `create or replace`.
   - `capture_batches()` changing its return columns needs `drop function`
     then `create`, so its `EXECUTE` grant and its AD-89 comment are re-applied
     in the same migration. T-AC5's catalog lint then checks the result.
   - `record_daily_records` and `engine_snapshot` keep their signatures, so
     `create or replace` keeps their grants and comments.
   - `private.payload_text` refuses a missing key (22023). That is chunk 3's
     "present even when null" rule already, so the three new keys are required
     on every row, with null allowed.
7. **No new integrity trigger.** Every check chunk 3 adds is a row-local
   `CHECK`, which runs regardless of who commits. The chunk 5 trigger amendment
   (`SECURITY DEFINER` integrity triggers, AD-87) is untouched. The existing
   removals trigger is still exercised through the new repository as a WORKER
   (T-C7).
8. **The main-into-u7 merge is done:** `u7-daily-capture` was an ancestor of
   `main`, so it was fast-forwarded to `a875946` (no merge commit, no content
   decision). The branch now carries the not-ready page, the working capital
   copy, the lint fix and TD-13's entry.

### Decisions

**D17 · Chunk 3 is local only; dev takes its migrations in chunk 5's window.**
- Two migrations, applied with `db reset --local` and tested only there.
- Nothing deployed in chunk 3 calls the new reads: `/capture` is still chunk
  2's placeholder, which calls `myMemberships` only. So dev can wait.
- **Dev gets both migrations in one narrow write window at the start of chunk
  5**, when the form first needs them, with your yes at that point (D14's
  pattern). Until then dev's schema is behind the branch, and nothing on
  the branch deploy reaches the difference.
- **Chunk 3 stays on `u7-daily-capture`.** Merging it to `main` is your call.
  My recommendation is to merge with chunk 5, so `main`'s migrations are never
  ahead of dev for a whole chunk.

*Recommended.*

**D18 · ▶ SIGN-OFF · How a WORKER learns the curve: `capture_batches()` returns
`breed_curve_id`, and a WORKER reads `breed_curve_points` only.**
- **`capture_batches()` gains one column, `breed_curve_id`.** It has the same
  rows, the same role check and still no `_cents` column (T-AC2's assertion
  stands). This is the shape D5's note predicted, now without a date argument
  (finding 3).
- **`breed_curve_points` read policy widens to OWNER, MANAGER and WORKER.** The
  policy `breed_curve_points_owner_manager_read` is replaced by
  `breed_curve_points_member_read`. The table holds day, weight, feed grams and
  phase, with no money, so U6 D22's whole-table rule allows it. A WORKER reads
  every curve in their organisation, never another organisation's.
- **This is narrower than D3 as approved.** D3 named points *and*
  `breed_curve_phases`. Finding 4 shows the phases table is not needed, so it
  stays OWNER and MANAGER, as do `breed_curves` and every parameter table.
  If chunk 4 finds a need, it is one more policy then.
- **U6 D21's matrix row changes** ("Breed curves, points, phases ✓ · ✓ · —"
  splits so points read ✓ · ✓ · ✓). T-AC2's table changes with it: the test
  table is the D21 table, so one cannot change without the other. Logged as
  **AD-101**, amending AD-86's third default and AD-87.

| Option | Against |
|---|---|
| **`capture_batches()` returns the curve id; policy on points** | A policy change on a settings table |
| A new `SECURITY DEFINER` function returning the batch's points | No policy change, but a second definer path to a table RLS could serve directly (U6 D22 preferred explicit, testable checks; this is one) |
| Points inlined into `capture_batches()` | Every batch listing carries ~41 points per batch, and the function's return type gets a nested shape |
| Widen points and phases, as D3 said | Exposes a table nothing reads |

*Recommended: the first.*

**D19 · Three readers and one writer, in `lib/repositories/capture.ts`.**
All are thin, Zod-parsed and mapped through `mapDatabaseError` (D28, AD-93),
and exported from `index.ts` only. None names `facts.` or `_versions` (T-RP5).
- **`captureBatches(client)`** over `public.capture_batches()` returns
  `CaptureBatch[]`: `{ batchId, code, placementDate, chickCount,
  extraChickCount, breedCurveId }`. **The row schema is `.strict()`:** a column
  the reader did not ask for makes it a `RepositoryError`. A widened function
  therefore fails loudly here instead of carrying data the screen never
  declared, which matters on the one function a WORKER reads money-bearing
  tables through.
- **`dailyRecords(client, batchId)`** over `public.daily_records`, ordered by
  `record_date`. It returns the current version per date: `id`, `recordDate`,
  both cumulatives, the three feed columns **in grams**, weight and sample,
  `notes`, `createdBy`, and the three provenance fields. It serves the
  previous totals (D4), the backfill list, and corrections: the id becomes
  `supersedesId`, and `createdBy` decides whether "correct" is offered (AD-86).
  Grams stay grams, because kg is the form's boundary (TD-5).
- **`curvePoints(client, curveId)`** over `public.breed_curve_points`, ordered
  by `day_number`, returns the engine's own `BreedCurvePoint[]`. It feeds
  chunk 4's functions directly, the way `loadEngineInput` returns engine types.
  An empty result is a `RepositoryError` ("curve has no points"), never an
  empty curve passed on as "no standard" (invariant 5).
- **`recordDailyRecords(client, { batchId, rows })`** over
  `record_daily_records`:
  - **Zod checks shapes only** (U6 D30). Integers where the database has
    integers, so a kg decimal is refused before any call. Enums come from
    `PHASES`, `ENTRY_SOURCES` and `PHASE_SOURCES`, and the uuids are checked.
    Business rules stay in the database: the both-or-neither and zero rules
    are its CHECKs, not duplicated here.
  - **Every row sends every key**, nulls included (finding 6). The payload
    type has **no `org_id` and no `created_by`**, so it cannot send them (U6
    D23). T-C4 asserts the wire payload's exact key set.
  - **`clientRequestId` comes from the caller** (the draft, D6), never
    generated here (U6 D30).
  - **It returns the row ids in input order.** A no-op returns the existing id
    (AD-75), so a retry cannot be told from a first write.

*Recommended.* **The naming rule it follows:** a reader that feeds the engine
returns engine types (`curvePoints`, `loadEngineInput`); a reader for the
screen returns camelCase (`captureBatches`, `dailyRecords`, as
`myMemberships` does).

**D20 · `feed_entry_source`, `feed_phase` and `feed_phase_source` end to end, in
one commit.**

*Engine* (no engine behaviour changes; calibration does not read them yet):
- **`types.ts`:** `EntrySource = 'MEASURED' | 'STANDARD_CONFIRMED'` and
  `PhaseSource = 'FROM_CURVE' | 'EXTRAPOLATED_BEYOND_CURVE'`. `DailyRecord`
  gains all three as **required** fields that may be null (`feed_entry_source:
  EntrySource | null`, `feed_phase: Phase | null`, `feed_phase_source:
  PhaseSource | null`), so every constructor states them.
- **`enums.ts`:** `ENTRY_SOURCES` and `PHASE_SOURCES`, `as const satisfies`,
  with the type-level completeness check (AD-92). Both are re-exported by the
  repository layer.

*Database* (migration `u7_feed_provenance`):
- **Three nullable columns** on `facts.daily_record_versions`, each with a
  named values CHECK (`..._feed_entry_source_values`, `..._feed_phase_values`,
  `..._feed_phase_source_values`). There is no backfill: an existing row's
  honest value is null, "not recorded".
- **`daily_record_versions_phase_with_source`:** `feed_phase` and
  `feed_phase_source` are both null or both set (AD-99).
- **`daily_record_versions_feed_under_phase`:** when `feed_phase` is set, the
  other two feed columns are 0 (AD-99). Neither check reads a curve (D5).
- **▶ SIGN-OFF · new, not in AD-99:
  `daily_record_versions_standard_from_curve`.** `STANDARD_CONFIRMED` requires
  `feed_phase_source = 'FROM_CURVE'`. Two approved rules already imply it: a
  standard exists only on the curve's days (AD-99: "no standard-feed suggestion
  is offered after the curve's last day"), and a standard is a phase's figure,
  so it cannot lack a phase. Stating it in the database turns a contradiction
  from a buggy or hand-made call into a refusal. It is row-local and reads no
  curve.
- **`record_daily_records`:** reads the three keys with `payload_text`
  (required, null allowed); includes them in the no-op comparison (`is not
  distinct from`), so a change to provenance alone is a correction, not a
  silent no-op; includes them in the insert. A void copies the head row as
  now, so provenance carries into the void version unchanged.
- **Views and snapshot:**
  - `public.daily_records` appends the three columns.
  - `public.daily_records_history` is recreated (finding 6).
  - `engine_snapshot` adds the three keys to each record.
  - The pinned contract (`snapshot-fixture.ts`) and `loadEngineInput`'s Zod and
    mapping carry them through to `DailyRecord` unchanged.
- **AD-63 drift test:** three new governed constraints, one per values CHECK.
- **Every existing caller updated in the same commit:** `payloads.ts`'s `day()`,
  T-RP1's record mapping, and the integrity, round-trip and access tests. They
  send null, because none of them is a form.

**▶ SIGN-OFF · What the database deliberately does not check: that the phase
is the right one for the day.** You flagged U6 D23, so this is stated rather
than left implicit:
- **U6 D23 covers who and where.** The organisation comes from the batch,
  `created_by` from `auth.uid()`. `recordDailyRecords` cannot send either.
- **The phase is different: it is part of what was recorded,** like the feed
  amount and the death count. A signed-in WORKER who bypasses the form and
  calls the RPC by hand could file today's feed under the wrong phase. They
  could equally type the wrong kilograms, and the database accepts both from
  the same person for the same reason: it cannot know. The row still names
  who wrote it, and AD-86 limits them to their own organisation and their own
  corrections.
- **In the app, the phase is always derived on the server** (chunk 5, D5), so
  the form can never choose it.

| Option | Against |
|---|---|
| **As approved in D5: the server action derives the phase; the database checks shape only** | A hand-made RPC call can mislabel the phase of its own feed |
| `record_daily_records` checks the phase against the batch's pinned curve when it writes (a check in the function, not a CHECK constraint, so a later placement correction leaves old rows valid) | Duplicates `feedPhaseForDay`, including the past-the-curve rule, in SQL. That is a second copy of an engine rule, needing a parity test to keep them equal. And it still cannot check `STANDARD_CONFIRMED`, which would take the engine's standard-feed arithmetic |
| The function derives the phase itself from one amount | The same duplication, and it breaks D5's "a later import of mixed historical days still fits" |

*Recommended: as approved.* **If you want the second,** it adds one function
check and one parity test to this chunk, and nothing else changes.

**D21 · TD-13 is absorbed here: the session cookie becomes `HttpOnly`, and
`Secure` in production.**
- **Where:** `createSessionClient` in `lib/repositories/session.ts`, the only
  place a session client is made. It passes `cookieOptions: { httpOnly: true,
  secure, sameSite: 'lax', path: '/' }` to `createServerClient`.
- **▶ SIGN-OFF · what decides `secure`:** `env.NODE_ENV === 'production'`,
  read from the same `env` argument as the project-ref guard, so it is
  testable.
  - Netlify builds (branch and production) run in production and serve HTTPS,
    so the cookie is `Secure` there.
  - `next dev` on `http://localhost` is not, so local sign-in keeps working.
  - The session client never sees the request, so it cannot read the
    protocol itself. That is why the setting is chosen by environment.
- **Why chunk 3:** `session.ts` is a repository file. Chunk 3 is the
  repository chunk, and TD-13 said to fix it in chunk 3 or 4, whichever comes
  first.
- **It has its own commit** inside the chunk, so the change to the auth cookie
  can be read on its own.
- **Verified on the branch deploy** when the chunk lands: the cookie shows
  `HttpOnly` and `Secure` in the browser, as the chunk 2 checks showed it
  without them. That needs a dev user, which D14's window provides in chunk 5.
  **Until then it is proven locally only** (T-S1, T-S6). I will report it as
  unverified on Netlify until then, not as done.

*Recommended.*

### Tests, in TDD order, each watched red first

*Engine (`packages/engine`):*
- **T-E1 enums:** `ENTRY_SOURCES` and `PHASE_SOURCES` are complete against
  their unions, as the existing enum tests do.
- **T-E2 the engine ignores provenance:** `computeDecision` is deep-equal for
  two inputs whose records differ only in the three fields. This guards against
  a rule starting to read them before calibration decides how (D3 addition:
  "Calibration does not read it yet").

*Unit (`apps/web`, fake client, no database):*
- **T-C1 `captureBatches`:** rows mapped; an extra column (for example
  `chick_price_cents`) is a `RepositoryError`; an RPC error maps by SQLSTATE.
- **T-C2 `dailyRecords`:** rows mapped with the three fields null and set; an
  unknown enum value is refused; the query targets `daily_records` filtered by
  batch.
- **T-C3 `curvePoints`:** points mapped to `BreedCurvePoint`; an empty result
  is a `RepositoryError`.
- **T-C4 `recordDailyRecords`:**
  - a kg decimal, a missing `clientRequestId` and an unknown enum are each
    refused before any call;
  - the wire payload has exactly the 14 row keys, nulls present, and no
    `org_id` or `created_by`;
  - 42501, 23514, 23505 and RP001 map to `Forbidden` (the database's sentence),
    `IntegrityRejected`, `Conflict` and `StaleCorrection`.
- **T-S1 extended (TD-13):** `createServerClient` receives the cookie options;
  `secure` follows `NODE_ENV`.
- **Snapshot contract:** `snapshot-fixture.ts` gains the three keys, and
  `loadEngineInput` maps them unchanged.

*Database half (`packages/db-tests`, local stack; T-AC1's style, users signed in
through Auth):*
- **AD-63 drift:** the three new values CHECKs.
- **T-C6 round trip, as a WORKER:**
  1. The WORKER writes three days through `recordDailyRecords`: one
     `STANDARD_CONFIRMED` + `FROM_CURVE`, one `MEASURED` +
     `EXTRAPOLATED_BEYOND_CURVE`, and one with all three null.
  2. The WORKER reads them back unchanged through `dailyRecords`.
  3. The OWNER's `loadEngineInput` returns the same records as `DailyRecord`s,
     day numbers and kg included, and `computeDecision` runs on them.

  This is the record path T-RP1 never exercised (finding 5).
- **T-C7 the new CHECKs, as a WORKER:** a phase without its source, feed under
  a second column when a phase is set, `STANDARD_CONFIRMED` with
  `EXTRAPOLATED_BEYOND_CURVE`, and an unknown enum string. Each is
  `IntegrityRejected` naming its constraint, and writes nothing. The removals
  trigger still refuses a WORKER through the repository (U6 D22's trigger
  point).
- **T-C8 idempotency and no-ops:**
  - the same `clientRequestId` returns the same id;
  - an identical resubmission with a new id returns the head's id and writes
    nothing;
  - a resubmission that changes only `feed_entry_source` writes a correction.
- **T-C9 AD-86 through the repository** (U6's unbuilt T-AC1 extension):
  - a WORKER corrects and voids their own record;
  - `Forbidden` naming the day for another's record, a manager-corrected
    record, a seed row (`created_by` null), and a first entry on a date someone
    else recorded;
  - a multi-day call containing one such row writes nothing;
  - a MANAGER corrects any record;
  - a stale `supersedesId` is `StaleCorrection`.
- **T-C10 WORKER reads (T-AC2 amended):**
  - `capture_batches()` returns `breed_curve_id` and still no `_cents` column;
  - a WORKER reads their organisation's `breed_curve_points` and none of
    another organisation's;
  - a WORKER still gets zero rows from `breed_curves`, `breed_curve_phases` and
    every parameter table.
- **T-AC5 catalog lint** passes after `capture_batches` is recreated
  (`search_path = ''`, no `PUBLIC` or `anon` execute).
- **T-S6 extended (TD-13):** after a real sign-in, the auth cookie written to
  the jar carries `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`.

### Commits, in order, each green on engine, web, local DB, lint and typecheck

1. **TD-13:** session cookie flags (D21).
2. **Feed provenance end to end:** engine type and enums, migration
   `u7_feed_provenance`, write function, views, snapshot, contract, drift test,
   every caller (D20). One commit, as the D3 addition requires.
3. **WORKER capture reads:** migration `u7_worker_capture_reads`
   (`capture_batches` curve id, points policy) and T-AC2's amendment (D18).
4. **The repositories:** `captureBatches`, `dailyRecords`, `curvePoints`,
   `recordDailyRecords`, with T-C1 to T-C10 (D19).
5. **Docs:** progress tracker; AD-101 (and AD-102 if D20's new CHECK is
   approved); TD-13 closed in `current-issues.md` (locally proven, Netlify
   pending); D5's note corrected; U6 D21's matrix row amended.

### Out of chunk 3

- The form, the draft, backfill and correction screens, and the server action
  that derives the phase and builds the row (chunk 5).
- `feedPhaseForDay` and the standard feed (chunk 4).
- Any dev or Netlify change (D17).
- Feed draws (D9).
- Anything waiting on Daniel. Chunk 3 touches no recommendation logic, OQ-25's
  structure C, OQ-43 or OQ-46's facility model.

### For sign-off

1. **Finding 1:** the approved chunk order stands. The form is chunk 5; chunk
   3 is the data layer plus the database-to-engine round trip.
2. **D18:** `capture_batches()` returns `breed_curve_id`; a WORKER reads
   `breed_curve_points` only, which is narrower than D3's points and phases
   (AD-101).
3. **D20's new CHECK:** `STANDARD_CONFIRMED` requires `FROM_CURVE` (AD-102).
4. **D20's boundary:** the database does not check the phase against the
   curve; the server derives it (as approved in D5). Or the write-time check,
   if you want it.
5. **D21:** `secure` follows `NODE_ENV`. TD-13 is closed locally in chunk 3,
   and verified on Netlify in chunk 5's dev window.
6. **D17:** the migrations reach dev in chunk 5's window, not now, and chunk 3
   stays on the branch until then.
