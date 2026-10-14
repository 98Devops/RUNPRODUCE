# U8 step 2 · the dev window and the branch deploy check

**Status:** written 2026-10-14, not yet run. Chunk 5 of
`u8-start-batch.md`. Dev is `zlvjmaorlxrjnuxhykuh`; production is never
touched in this step. The three SQL files are
`supabase/dev-windows/u8-step2-{setup,cleanup,verify}.sql`, dry-run on the
local stack first (see the end).

The rules that hold throughout: every dev write has the user's yes, in the
window the user opens; the Supabase MCP is read-only outside it, and
`transaction_read_only` is checked before the first call after any mode
switch; any refusal stops the window; the user types every password; nothing
is pushed to production and no Netlify setting is changed by me.

## Before the window (the user)

- [ ] Two Auth users in the dev dashboard, "Auto Confirm User" ticked:
      `u8-check-manager@runproduce.test` and `u8-check-worker@runproduce.test`.
      The user keeps the passwords.
- [ ] Netlify branch variables for `u8-start-batch`, scoped to that branch
      context as U7's were: `RUNPRODUCE_SUPABASE_TARGET`, `SUPABASE_URL` and
      `SUPABASE_ANON_KEY`, pointing at dev. Production's context gets none.
- [ ] The branch deploy `u8-start-batch--runproduce-console.netlify.app`
      is up on the branch head (chunks 2 to 4 plus the TD-18 fix).

## Window A (writes: the migration and the setup)

| # | Who | Step | Stop if |
|---|---|---|---|
| A1 | me, read-only | `show transaction_read_only` is `on`; `list_migrations` shows the nine U7 versions and no U8 one; `select count(*) from public.organizations` is 0 and `auth.users` is 2 | anything else |
| A2 | the user | Switch the MCP to write mode and say so | — |
| A3 | me, with the user's yes | `apply_migration` with the body of `20261014160000_u8_start_batch_guards.sql`, name `u8_start_batch_guards` | any error: report it whole, change nothing else |
| A4 | me | `list_migrations` to read the version dev stamped; rename the local file to that version (as U7's were, `eb393ee`), commit | the stamped version is not newer than `20261014122424` |
| A5 | me, with the user's yes | Run `u8-step2-setup.sql`. Its own guards refuse unless dev is empty, has exactly the two users, and D7 is applied. Report its result row: orgs 1, memberships "MANAGER, WORKER", curve_points 41, batches 0, and the farm's today | a refusal, or any count other than those |
| A6 | the user | Switch the MCP back to read-only | — |
| A7 | me | `show transaction_read_only` is `on` again | `off` |

## The checks on the branch deploy (me in the browser, 390px; the user signs in)

The user types the passwords at the sign-in page; I take over after. Each
readback is a read-only query on dev.

| # | As | Check | Expected |
|---|---|---|---|
| 1 | MANAGER | Sign in | Lands on Today: "No batch to record yet." with the link "Start a batch", and two tabs, Start batch and Today |
| 2 | MANAGER | Open Start batch | "Growth curve: U8 step 2 check curve" as text, no select; the form empty, with no placeholder that looks like a value |
| 3 | MANAGER | The refusals, one at a time | "6,000" gives "Type 6000, without the comma."; blank extras gives "Enter the extra chicks from the hatchery, or 0 if there were none."; "1,00" gives "Price per chick is dollars and cents, for example 1.00."; tomorrow's date gives "The chicks can’t arrive after today (<weekday> <d> <Mon>)." Nothing written: `facts.batches` count 0 |
| 4 | MANAGER | Daniel's case: CHECK-2, placed two days before the farm's today, 6000, 60, 1.00 | The confirm step reads "Batch name ‘CHECK-2’ can’t be changed later." and "Placement date <D> → today is day 3."; Save lands on Today "Day 3 · <date> · 2 days missing, from day 1". Readback: one batch, one placement version with 6000, 60 and 100, `created_by` the MANAGER's id |
| 5 | MANAGER | Correct the extras to 61 | The confirm step shows the day line only; after Save, Today still shows day 3. Readback: two placement versions, the second with `supersedes_id` = the first, extras 61 |
| 6 | MANAGER | Start another batch called CHECK-2 | "There is already a batch called CHECK-2. Pick another name." Readback: still one batch |
| 7 | WORKER | Sign in; then open `/start` by URL | Today on CHECK-2 with no tab bar; `/start` lands on `/today` |
| 8 | both | Sign out | The sign-in page; the session cookie is gone (name and flags only are read, never values) |
| 9 | MANAGER | The lost tap (TD-18), once, on the branch deploy | With the network throttled in devtools, type a day's figures and tap Save before the page's script lands: the save still happens, with the typed figures |

Check 9 is new since the plan: it is the fix's only check on a real deploy.

## Window B (the user's terminal: cleanup)

- [ ] The user runs `u8-step2-cleanup.sql` as `postgres` from their own
      terminal, as for U7. It removes, by the fixed org id, the batch and
      its placement versions, any daily record, the curve, the memberships
      and the organisation, with the immutability guards off and on again in
      one transaction, then the two check users. It refuses if dev holds any
      other organisation or any row the check could not have written.
- [ ] The user says the window is closed.

## Verify (me, read-only)

- [ ] `show transaction_read_only` is `on`.
- [ ] `u8-step2-verify.sql`: first result all 0, and 17 / 0 on the
      immutability triggers; second result `code_shape_check` 1 and
      `farm_zone_functions` 2. The output goes to the user unedited.

## After

- [ ] `progress-tracker.md`: the window, the nine checks and the verify
      output. `current-issues.md`: TD-18 stays closed; anything found on the
      deploy is logged with its wording.
- [ ] Merge `u8-start-batch` to `main` with `--no-ff`, as U7, when the user
      says so. D7's migration reaches production only in step 6's window.

## The local dry run of the trio (done before the window)

On the local stack only: `npx supabase db reset --local`, the two check
users created locally with the same emails, then setup, a batch with two
placement versions and a daily record inserted as the form and Today would,
cleanup, and verify. The result is in the tracker entry for this chunk.
