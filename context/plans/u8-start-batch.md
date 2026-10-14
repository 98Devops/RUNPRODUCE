# U8 — Start batch (step 2 of "ship the product")

**Status: approved 2026-10-14.** The user approved D1 to D9 as recommended,
and added two things:
- **TD-17 is logged** (finding 4). The engine is unchanged.
- **D12, a confirm step before saving** (below).

D10 and D11 were not ruled on separately, and are built as drafted. Chunks 2
to 4 run against the local stack only. Chunk 5, the dev window, waits for the
user, who opens it from their own terminal. D7's migration is not applied to
dev until then.

Branch `u8-start-batch`, from `main` at `02e902d`. The questions for Daniel
are not in this file; they go to the user as plain text, and the user decides
whether to ask.

Flow 1 in `project-overview.md`: the owner places a batch, once a cycle, in
about two minutes. The tab is `/start` (AD-104), and it mirrors Daniel's
Initialization sheet (B5 chicks, B6 extras, B7 price).

---

## What already exists, read from the schema (not assumed)

| Piece | Where | What it does today |
|---|---|---|
| `facts.batches` | migration 3 | `org_id`, `code`, `breed_curve_id`, `unique (org_id, code)`. **Immutable**: `batches_immutable` refuses every update and delete. It has no versions table |
| `facts.batch_placement_versions` | migration 3 | `placement_date`, `chick_count > 0`, `extra_chick_count >= 0`, `chick_price_cents > 0` (bigint). Append-only, with `supersedes_id`. **One chain per batch** (`batch_placement_versions_one_chain`). A placement is corrected, never voided |
| `public.record_batch(payload)` | migration 5 | Creates the batch identity and its first placement in one transaction. **OWNER and MANAGER** (`has_role`). Checks that the curve belongs to the org. Money must arrive as an integer string. A repeated `client_request_id` returns the existing batch |
| `public.record_batch_placement(payload)` | migration 5 | The correction. OWNER and MANAGER. `supersedes_id` must be the head (else `RP001`). Identical values write nothing |
| Integrity triggers | migration 3 | A placement correction re-checks every daily record (before placement, totals over the flock), sale, draw and closure, at commit |
| `public.batches` view | migration 4 | The current placement per batch, closed ones included, with `placement_version_id`. RLS: OWNER and MANAGER only (it carries the price) |
| `public.breed_curves` | migration 2 | RLS: OWNER and MANAGER read. Written only by `create_breed_curve` (OWNER) or the step 6 seed |
| `/start` gated | `gate.ts`, `middleware.ts` | Already protected since U7 D27, with no page behind it (Next's 404 today) |
| Tab bar | `lib/nav/tabs.ts` | Built and tested, not rendered: `BUILT_TABS` is `['today']` |

**Nothing in the web app calls `record_batch` yet.** Only the DB tests do
(`packages/db-tests/src/payloads.ts`). `recordBatch` and
`recordBatchPlacement` are two of the nine write repositories U6 approved
(AD-95) and did not build.

## Findings that shape it

1. **The schema allows any number of open batches.** Nothing limits it: no
   unique index, no trigger, and nothing in `record_batch`. "Open" is defined
   only by reading: `capture_batches()` excludes a batch with a current,
   unvoided closure. The web was built for several. `BatchPicker` shows when
   there are two or more, and AD-104 calls overlapping batches "a real case: a
   leveraged rollover places the next batch before the current one is
   harvested." See D6.
2. **`record_batch` does not refuse a future placement date, and a future date
   crashes Today.** Today picks the most recently placed batch by default, and
   `dayNumberFor` throws when today is before placement. A MANAGER can call the
   RPC directly with the public anon key and their own session, so the form
   alone is not the guard. See D7.
3. **A blank or padded batch code is storable.** `code text not null` has no
   check, so `''` and `' B1 '` are valid rows. The code is the batch's name in
   the URL (`?batch=`), the picker and every page. Because `facts.batches` is
   immutable, a bad code can never be fixed. See D2 and D7.
4. **The engine and Daniel's own sheet disagree on what extras cost.**
   - CONTEXT.md calls extras "free chicks supplied by the hatchery".
   - Daniel's Final Report charges `Init!B5 × Init!B7`, the ordered chicks
     only.
   - Our engine charges `(chick_count + extra_chick_count) × price`.
     `cash.ts:325` and `costing.test.ts` ("charges every placed chick, extras
     included (KB-1)") both do this. KB-1 was about the flock count, which is
     right; the cost followed it without a source.
   - On his real batch that is $6,060 against $6,000.

   This plan stores the facts the same way either way (D3) and **shows no chick
   cost total** until it is settled. It is a Daniel question, logged as
   **TD-17** (2026-10-14).
5. **Error mapping speaks Today's language.** `mapDatabaseError` turns every
   `23505` into "Someone saved this date first. Reload." A duplicate batch code
   is also a `23505` (`batches_org_id_code_key`), so the farmer would read
   about a date. The batch writers need their own sentence (D8).
6. **The batch code and curve can never be corrected,** only the placement can
   (`facts.batches` is immutable, and there is no batch-level void). See D9.

## Decisions

**D1 · Who: OWNER and MANAGER. A WORKER sees no tab and is refused at three
layers.** ▶ SIGN-OFF
- **The tab.** `BUILT_TABS` becomes `['start', 'today']`. `visibleTabs`
  already gives a WORKER Today only. An OWNER or MANAGER now has two tabs, so
  the bar renders for them for the first time (U7 chunk 5, finding 1). A WORKER
  still gets no bar.
- **The page** (`app/(farm)/start/page.tsx`), on the server, before reading
  anything:
  ```ts
  const farm = await loadFarm();
  if (farm.kind === 'signed_out') redirect(`${SIGN_IN_PATH}?next=%2Fstart`);
  if (farm.kind === 'no_access') return null;          // the layout says why
  if (!canStartBatch(farm.membership.role)) redirect('/today');
  ```
  `canStartBatch(role)` is pure (`role === 'OWNER' || role === 'MANAGER'`), in
  `lib/nav/tabs.ts` beside `visibleTabs`, so the tab and the guard read one
  rule.
- **The action** (`start/actions.ts`) is its own request, so it reads
  `loadFarm()` again and checks `canStartBatch` again. A WORKER posting
  directly gets "Only the owner or a manager can start a batch." and nothing is
  sent to the database.
- **The database has the last word.** No new code is needed for this: the
  check is already in `record_batch` (migration 5):
  ```sql
  if not private.has_role(v_org, array['OWNER', 'MANAGER']) then
    perform private.deny();          -- 42501 'not permitted'
  end if;
  ```
  `record_batch_placement` has the same check, on the batch's own org
  (`private.batch_org`), so a forged `org_id` gets nowhere. `public.batches`,
  `public.breed_curves` and `facts.batch_placement_versions` are all
  `has_role(org_id, array['OWNER','MANAGER'])` under RLS: a WORKER reads no
  row of any of them.

**D2 · The fields, their units, and how each is read.** ▶ SIGN-OFF

| Field (label) | Stored as | Read how | Required |
|---|---|---|---|
| **Batch name** | `facts.batches.code`, text | Trimmed. 1 to 24 characters: letters, digits, spaces and hyphens. Case kept: "b1" and "B1" are different, as `resolveBatch` already treats them | Yes |
| **Day the chicks arrived** | `placement_date`, date | `<input type="date">`, `max` = the farm's today (`farmToday`, Africa/Harare). **No default** | Yes |
| **Chicks placed** (the ordered count, B5) | `chick_count`, integer | Whole number, ASCII digits only, 1 to 9,999,999 | Yes |
| **Extra chicks from the hatchery** (B6) | `extra_chick_count`, integer | Whole number, 0 to 9,999,999 | Yes. **Blank is not 0**: "0" must be typed (rule 3, AD-82's spirit) |
| **Price per chick, $** (B7) | `chick_price_cents`, bigint | Dollars with up to two decimals, to integer cents, no float | Yes |
| **Growth curve** | `facts.batches.breed_curve_id` | D4 | Yes |

- **No default placement date.** Daniel's first real batch is already on the
  ground, so "today" would be wrong for the very first use. A wrong placement
  date shifts every day number, every standard feed figure and every due date.
- **Comma and decimal rules: the same as feed (`parseKgTenths`).** A dot is the
  decimal point. A comma is refused, never guessed: "1,00" could be one dollar
  or a hundred. Counts take digits only.
  - `parseCount(text)`: `^\d{1,7}$`, the same as Today's `wholeNumber`.
  - `parseCents(text)`: `^(\d{1,4})(?:\.(\d{1,2}))?$`, computed as
    `BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))`. So "1", "1.0" and
    "1.00" are all 100n, and "0.85" is 85n. A leading "$" is accepted, because
    it cannot be misread. Nothing goes through `Number` or `parseFloat`.
  - Both live in `lib/format.ts`, beside `parseKgTenths`.
  - **The common mistake gets a specific sentence.** "6,000" (digits in
    thousands groups) is still refused, but the message gives the digits back:
    "Type 6000, without the comma." Nothing is stored from a guess.
- **A live summary under the form,** pure and computed as the farmer types:
  - "B1 · placed Mon 12 Oct · 6,060 birds (6,000 + 60 extra) · $1.00 a chick ·
    today is day 3."
  - The day count makes a wrong date visible before saving.
  - It shows **no chick cost total** (finding 4).
- **Daniel's real case** is a fixture in every layer's tests: 6,000 + 60 at
  "1.00" stores 6000, 60 and 100n, with a flock of 6,060.

**D3 · Extras: one placement row with two columns, as the schema already has
them. Not a separate placement line, and not one total.** ▶ SIGN-OFF
- The question offered two shapes: a separate placement line, or one total.
  The schema already has a third: one placement version carrying both
  `chick_count` and `extra_chick_count`. I recommend keeping it, for four
  reasons:
  1. **A separate line is not possible without a migration.**
     `batch_placement_versions_one_chain` allows one chain per batch, and every
     integrity check reads one current placement.
  2. **One total loses the fact that decides the cost question.** If Daniel
     says extras are free (finding 4), the engine charges `chick_count` only.
     With one total, the 6,000 is no longer known.
  3. **It is Daniel's own shape:** B5 and B6 are separate cells on his
     Initialization sheet.
  4. **Every flock bound already uses the sum** (`check_removals`,
     `check_sales`, invariant 9), so storing both costs nothing.
- **A correction to either is a new placement version** (D9). Extras counted
  late are a normal correction, not a special case.

**D4 · The growth curve: the farm's own, chosen at start and fixed for the
batch's life.**
- **Which curve.** The step 6 seed loads one: Daniel's, from
  `context/breed_curve.json`. The form reads the org's curves (OWNER/MANAGER
  RLS, already granted):
  - **One curve:** it is shown as a line of text ("Growth curve: <name>"),
    with nothing to choose. Its id goes in the form.
  - **Two or more:** a `<select>` with **no preselected option.** The farmer
    picks one; the newest is not guessed for them.
  - **None:** no form. "A batch needs your growth curve, and it isn't set up
    yet. It's loaded with your prices." This is the state of production until
    step 6, and of dev until the test setup.
- **Fixed once the batch starts.** Two rules hold this, and neither is new:
  - `facts.batches.breed_curve_id` is on the immutable identity row. There is
    no versions table, and `batches_immutable` refuses an update, even from the
    service role.
  - The curve itself is immutable (AD-70): its points and phases cannot change
    under the batch. A new curve is a new row, for a new batch.
- **The server checks the curve again.** The action takes the id from the
  form, and `record_batch` refuses a curve outside the org (42501).

**D5 · Refusals (invariant 5): the exact sentence a farmer sees.** One
sentence each. The first failing field is named, and the entry is kept.
- **A blank is refused.** It is never a default.
- **These are pure.** `parseStartBatchForm` and `buildPlacement` produce them,
  test-first. The database still decides; its refusals map to the last rows of
  the table.

| Case | The farmer reads |
|---|---|
| Name blank | "Give the batch a name, for example B1." |
| Name over 24 characters | "Keep the batch name to 24 characters or fewer." |
| Name with other characters | "Use letters, numbers, spaces and hyphens in the batch name." |
| Name already used on this farm, closed batches included | "There is already a batch called B1. Pick another name." |
| Date blank | "Enter the day the chicks arrived." |
| Date after the farm's today | "The chicks can't arrive after today (Wed 14 Oct)." |
| Chicks blank | "Enter how many chicks were placed." |
| Chicks 0, or not a whole number | "Chicks placed is a whole number, more than 0." |
| Extras blank | "Enter the extra chicks from the hatchery, or 0 if there were none." |
| Extras not a whole number | "Extra chicks is a whole number: 0 or more." |
| A count typed with a comma | "Type 6000, without the comma." (with their digits) |
| Price blank | "Enter the price per chick, for example 1.00." |
| Price unreadable, a comma, or over two decimals | "Price per chick is dollars and cents, for example 1.00." |
| Price 0 | "The price per chick must be more than $0.00." |
| No curve chosen (two or more) | "Choose the growth curve for this batch." |
| WORKER, or no farm | "Only the owner or a manager can start a batch." |
| Tampered shape, bad uuid or impossible date | "Something in this entry could not be read. Reload and try again." (Today's) |
| A correction that is stale (`RP001`) | "This batch was changed since you opened it. Reload." |
| A correction that moves the date past a recorded day | "There's a record for Mon 12 Oct, before the new arrival date. The date can't move past a recorded day." |
| A correction that leaves fewer birds than removed | "That's 6,050 birds, but 6,100 are already recorded dead or culled." |
| Network or server failure | Today's `saveErrorMessage` wording, unchanged |

- **The last three are pre-checked** on the server against the batch's records,
  as Today pre-checks totals (U7 chunk 5). The deferred triggers stay the
  authority. If one fires anyway (a race), the farmer reads "This change
  conflicts with records saved since you opened it. Reload."
- **A retry after a lost reply is not a refusal.** `client_request_id` is made
  once per form and kept in the draft, and `record_batch` returns the existing
  batch.

**D6 · One open batch at a time is NOT the rule, and this step adds no such
rule.** ▶ SIGN-OFF
- **Today's schema enforces nothing here** (finding 1). The navigation spec
  already treats two open batches as real, and the picker exists for it.
- **Recommended: no constraint.** Instead, Start batch lists the open batches
  above the form ("Open now: B1, placed Mon 5 Oct, day 10"), so starting a
  second one is a deliberate act and not an accident.
- **If you want the rule anyway,** it is a partial unique index or a check in
  `record_batch`. It would also block the rollover case AD-104 names, so it
  needs Daniel's answer first (question 2).

**D7 · One small migration: the database refuses a future placement and a bad
code.** ▶ SIGN-OFF
- **`<version>_u8_start_batch_guards.sql`.** It gets a local placeholder
  version, renamed to the version dev stamps, as in U7.
  - `facts.batches` gains
    `constraint batches_code_shape check (code = btrim(code) and length(code) between 1 and 24)`.
    Dev has 0 batches and local is reset, so there is nothing to validate.
    Production has none either.
  - `record_batch` and `record_batch_placement` gain, before their insert:
    ```sql
    if v_date > (now() at time zone 'Africa/Harare')::date then
      raise exception 'Placement date % is after the farm''s today', v_date using errcode = '23514';
    end if;
    ```
    `create or replace`, with the same signature, grant and AD-89 comment.
  - The zone is the same constant as `FARM_TIME_ZONE`. A comment on each says
    so. A second farm in another zone needs a column (U7 D28).
- **The character set stays in the web layer only.** The database holds the
  shape that keeps a URL and a picker working; the form holds the friendlier
  rule.
- **Why a migration at all:** findings 2 and 3, and the pattern so far (the form
  pre-checks, the database decides). Without it, a future date from a direct
  RPC call takes Today down for the whole farm.
- **Recorded as AD-105** once approved.

**D8 · Two write repositories and two readers, thin (AD-95).**
- **`recordBatch(client, input)`** and **`recordBatchPlacement(client, input)`**
  go in `lib/repositories/batches.ts`.
  - Money is sent as an integer string (AD-91).
  - Each maps its own `23505` to "There is already a batch called <code>. Pick
    another name.", not Today's date sentence. `mapDatabaseError` gains an
    optional `conflict` sentence in its context argument. The default stays as
    it is, so Today does not change.
- **`farmBatches(client)`** reads `public.batches`: open and closed, with
  `placement_version_id`, for the duplicate pre-check, the open list and the
  correction form.
- **`breedCurves(client)`** reads `public.breed_curves` (id, name), ordered by
  `created_at`.
- **Strict zod rows,** as `capture.ts` does.

**D9 · Mistakes: a new placement version, never an edit.** ▶ SIGN-OFF
- **Correctable:** the date, chicks, extras and price. Each open batch in the
  list has "Correct", which opens the same form filled with the current
  placement. It sends `supersedes_id = placement_version_id` and calls
  `record_batch_placement`. The old version stays, visible in
  `batches_history`. Unchanged values write nothing.
- **A date correction moves every day number.** The integrity triggers re-check
  every daily record. The pre-check (D5) says plainly when a record would fall
  before the new date.
- **Not correctable: the name and the curve.** They are on the immutable
  identity row (finding 6).
  - **The curve:** with one curve per farm, it cannot be chosen wrong.
  - **The name:** the live summary shows it before saving. After that, a wrong
    name stays.
  - **The way out today:** the OWNER closes the batch (`record_batch_closure`)
    and starts a new one. The closed batch then stays in Results' list.
  - **A proper fix:** a batch-level void, or a code-versions table. That is
    schema work, so I recommend it waits until a real case asks for it, and
    the risk is noted here.
- **WORKER:** no correction, as with starting (D1).

**D10 · After saving: Today, on that batch, with the right day.**
- The action redirects to `/today?batch=<code>`. The code is always given,
  because a back-dated batch may not be the default (the default is the most
  recently placed).
- Today's heading is "Day N · <weekday date>". N is `dayNumberFor(placement,
  farmToday(now))`: placed today, day 1; placed Mon 12 Oct and opened Wed 14
  Oct, day 3. Its missing-day line (TD-14) then reads "Nothing recorded yet ·
  2 days missing, from day 1", linking to day 1.
- **Today's no-batch state changes to the navigation spec's wording,**
  replacing "No batch is running yet.":
  - **OWNER or MANAGER:** "No batch to record yet." with a link, "Start a
    batch".
  - **WORKER:** "No batch to record yet. Ask the owner to start one."

**D11 · The page at 390px.** The same one column (`max-w-[480px]`) and `text-2xl`
inputs as Today. Targets are 44px or more, with one Save button. Never
`text-base` (TD-11). Above the form are the
open batches with "Correct", then the form, then the live summary and the
alert. There is no draft on the phone: it is a two-minute form filled once a
cycle, and `client_request_id` covers a lost reply. (Today's draft exists
because the worker loses signal in the shed.) ▶ SIGN-OFF, small.

**D12 · A confirm step before saving (the user, 2026-10-14).**
- **Save opens the confirm step, not the write.** It shows:
  - "Batch name 'B1' can't be changed later."
  - "Placement date Mon 12 Oct → today is day 3."

  Then two buttons: **Save** and **Go back**.
- **Go back** returns to the form with every value kept.
- **Save** sends the write.
- **The confirm step shows only an entry that has already passed every check.**
  The form's checks (D5) run first, on the server, without writing. A refusal
  shows on the form and never on the confirm step.
- **The action has two modes**, `check` and `save`, and `save` runs every check
  again. Passing the confirm step is not trusted as proof of anything.
- **A correction gets the same step,** worded for what it changes:
  "Placement date Mon 12 Oct → today is day 3." There is no name line, since
  the name is not editable there.

## Tests, in TDD order, each watched red first

**Engine** (`packages/engine/tests`). Start batch needs no engine change, so
these are regression pins on Daniel's shape, written knowing they pass. Each
is mutation-checked rather than watched red.
- **T-SB1:** 6,000 + 60 gives `flock_size` 6,060 and day 1's standard feed of
  curve `feed_g × 6,060`.
- **T-SB2:** `dayNumberFor` gives 3 for placement 12 Oct with asOf 14 Oct, and
  throws for asOf 11 Oct. This pins the reason for D7.
- **Not pinned on purpose:** the chick cost. Finding 4 is open, and a pin would
  freeze the answer before Daniel gives it.

**Web unit** (`apps/web`):
- **T-SB3:** `parseCount`, for digits, blank, "0", 7 digits against 8, "6,000",
  "6.0", "-1", spaces and non-ASCII digits.
- **T-SB4:** `parseCents`, for "1", "1.0", "1.00", "$1.00", "0.85", "1.005",
  "1,00", ".85" and "10000.00". An exhaustive loop over 0.00 to 99.99 checks
  `parseCents(formatted) === cents`, and that no value goes through a float.
- **T-SB5:** `parseStartBatchForm`, every row of D5's table, with the exact
  sentence, plus Daniel's case parsing to `{6000, 60, 100n}`.
- **T-SB6:** `buildPlacement` (the pure pre-checks): the duplicate code, the
  future date by the farm's zone (23:30 UTC on the 13th is already the 14th on
  the farm), a correction past a recorded day, and a correction below removals.
- **T-SB7:** the live summary string, with no cost in it.
- **T-SB8:** `canStartBatch`, plus `visibleTabs` with `BUILT_TABS` including
  `'start'`. OWNER and MANAGER get two tabs and a bar; WORKER gets one and no
  bar.
- **T-SB9:** the action refuses a WORKER before any repository call (a spy
  repository records no call).
- **T-SB10:** `mapDatabaseError` uses the batch's conflict sentence, and
  Today's stays unchanged.

**Database** (`packages/db-tests`, local stack):
- **T-SB11:** `recordBatch` as OWNER and as MANAGER, for Daniel's case. The
  round trip through `farmBatches` gives 6000, 60 and 100n. A retry with the
  same `client_request_id` returns the same batch id.
- **T-SB12:** a WORKER calling `record_batch` gets 42501. A MANAGER of org A
  naming org B, or org B's curve, gets 42501.
- **T-SB13:** a duplicate code gets `Conflict` with the batch sentence. A
  blank, padded or 25-character code gets 23514 (D7).
- **T-SB14:** a future date by the farm's zone gets 23514 from both functions.
  Faked by a date one day past `(now() at time zone 'Africa/Harare')::date`,
  never by the server clock.
- **T-SB15:** a correction writes a new version that supersedes the head. The
  old one shows in `batches_history`. A stale `supersedes_id` gets `RP001`.
  Identical values write nothing. A date past a recorded day, or a flock below
  removals, gets 23514 at commit.
- **T-SB16:** `facts.batches` refuses an update of `code` and of
  `breed_curve_id`, even from the service role. This pins "fixed once
  started".
- **T-SB17:** a WORKER reads no row of `public.batches` or
  `public.breed_curves`, and sees the new batch through `capture_batches()`
  only.

**Browser, local stack, 390px:** OWNER starts Daniel's case and lands on Today
at the right day. The tab bar shows two tabs. The checks:
- a WORKER is redirected and has no bar;
- each refusal sentence appears for its input;
- a correction is stored and shown in the history;
- the no-curve state, and both no-batch states on Today.

Screenshots go in `.playwright-mcp/u8/`, untracked.

## Branch deploy check on dev, with a setup, cleanup and verify trio

**Dev needs test data, so yes, a trio is needed.** It is the same pattern and
the same safeguards as U7 step 5. The files are
`supabase/dev-windows/u8-step2-{setup,cleanup,verify}.sql`. Each is marked
"DEV ONLY (zlvjmaorlxrjnuxhykuh)" and dry-run on the local stack first.

- **Prerequisite (the user):** two Auth users, made in the dev dashboard with
  "Auto Confirm User" ticked: `u8-check-manager@runproduce.test` and
  `u8-check-worker@runproduce.test`. The user types the passwords; I never see
  them.
- **Setup** refuses unless dev has no organisation and exactly those two
  users. It creates, all under one fixed org id:
  - 1 organisation, "U8 step 2 check — delete after";
  - 2 memberships, MANAGER and WORKER;
  - 1 breed curve, the engine's seed curve, 41 points.

  **No batch:** the form makes it. No parameter set: Start batch and Today read
  none.
- **The window, in order, with the user's yes:**
  1. `transaction_read_only` is `on`; the migration list is read.
  2. Write mode. D7's migration is applied, and its version is stamped and
     renamed locally.
  3. Setup.
  4. Back to read-only, with `on` confirmed.

  The Netlify branch variables for `u8-start-batch` are set by the user, in the
  same context-scoped way as U7's. Production gets none.
- **Checks on `u8-start-batch--runproduce-console.netlify.app`:**
  1. The MANAGER signs in and lands on Today: "No batch to record yet." with
     the "Start a batch" link, and two tabs.
  2. Start batch shows "Growth curve: <name>" as text, with no select.
  3. The refusals: "6,000", blank extras, "1,00", and a future date, each with
     its sentence.
  4. Daniel's case, CHECK-2, placed two days ago. It lands on Today as "Day 3",
     with "2 days missing, from day 1". A read-only readback shows 6000, 60 and
     100, with `created_by` the MANAGER.
  5. A correction of the extras to 61. Readback: two versions, the second
     superseding the first. Today still shows day 3.
  6. A duplicate name, CHECK-2: the sentence, and nothing written.
  7. The WORKER signs in: Today on CHECK-2, no bar, and `/start` redirects to
     `/today`.
  8. Both sign out, and the cookie clears.
- **Cleanup** (window B, the user's terminal) removes, by the fixed org id:
  - the batch, its placement versions and any daily record;
  - the curve, the memberships and the organisation.

  The immutability guards are switched off for named test rows only, then on
  again in the same transaction. The two Auth users are deleted by the user.
- **Verify,** run read-only by me: every count 0, and 17 of 17 immutability
  guards enabled. D7 adds a check, not a trigger, so the count stays 17. The
  full output goes to the user unedited.

## Chunks

| Chunk | Lands | Touches | Size |
|---|---|---|---|
| **1. This plan** | Sign-off on D1 to D11 | Docs | — |
| **2. The pure core** | `parseCount`, `parseCents`, `parseStartBatchForm`, `buildPlacement`, the summary, `canStartBatch`, `BUILT_TABS`. T-SB1 to T-SB8 and T-SB10 | Engine pins, web unit | S |
| **3. The database side** | D7's migration (local placeholder version), `batches.ts` (two writers, two readers), the conflict mapping. T-SB11 to T-SB17 | Local stack only | M |
| **4. The page** | `/start` page and action, the correction form, Today's no-batch states, the redirect to Today. T-SB9, then browser checks at 390px | Web, local stack | M |
| **5. The dev window and the branch deploy** | The trio, the window, checks 1 to 8, window B and verify, then the merge (`--no-ff`, as U7) | Dev, with the user's yes at each write | S, mostly waiting |

Each commit is green on engine, web, golden, local DB, lint and typecheck.
Production is not touched in any chunk. D7's migration reaches production in
step 6's window.

## Out of this step

- The chick cost question (finding 4, TD-17): an engine change, test-first,
  once Daniel answers. It is not in Start batch.
- Renaming or voiding a batch (D9).
- A settings screen for curves or prices (approved out of scope; step 6 seeds
  them).
- Closing a batch from the UI: the OWNER-only `record_batch_closure` exists,
  and its button belongs with Results (step 4).
- TD-15 (the weight field), which stays U7 chunk 6.

## For sign-off

1. **D1:** OWNER and MANAGER only, refused at the page, at the action and in
   `record_batch`. The tab bar appears for them.
2. **D2:** the fields, with **no default date**, a blank extras field refused,
   and commas refused with "Type 6000, without the comma."
3. **D3:** extras as their own column on one placement row, as the schema has
   them.
4. **D6:** no one-open-batch rule. The open batches are listed above the form.
5. **D7:** one small migration, which refuses a future date (farm zone) and a
   blank or padded code in the database.
6. **D9:** corrections are new placement versions. The name and the curve are
   permanent, and the risk is accepted for now.
7. **D11:** no draft on the phone for this form.
