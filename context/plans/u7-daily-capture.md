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
- **D4 to D8 were not ruled on one by one.** They proceed as drafted unless the
  user says otherwise.
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
  than it knows. **The user named it `entry_source`; the narrower name is a
  proposal and needs a yes.** A runtime array `ENTRY_SOURCES` goes in
  `enums.ts` (AD-92).
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

**D5 · Feed by type: the day's phase first, the others explicit.**
AD-82 makes all three amounts required with no default, and a day usually
issues one type. The form shows all three, with today's phase (from the curve,
once D3's read exists) first and full-size. The other two sit below with a
"None issued" button each that fills 0. A blank still refuses to submit, so a 0
is always a person's choice (AD-82's point: a blank must never become a zero).

*Recommended.*

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

2. **Session and sign-in (D2).** The SSR client factory behind the guard, the
   sign-in and sign-out routes, the redirect, and T-RP5's lint extended.
3. **Reads and the write repository (D9).** `captureBatches`,
   `dailyRecords`, `recordDailyRecords`, the WORKER curve-read migration, and
   `feed_entry_source` end to end (D3's addition: engine type, column, contract),
   each with its fake-client unit half and its DB half on the local stack.
4. **The engine's standard feed for a day (D3).** Test-first in
   `packages/engine`, including the day before placement and a day past the
   curve's end.
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
5. **Open, small:** the field name, `feed_entry_source` (proposed) or the
   user's `entry_source`.
