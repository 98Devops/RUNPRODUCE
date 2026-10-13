# Navigation — five tabs that mirror Daniel's sheets

**Spec, approved 2026-10-13 as written (all four sign-off points), recorded as
AD-104.** One page. It settles four things: the route for each tab, what each
tab shows before there is data, how a batch is picked, and where the U9
components go. The prices gap at the end is approved too, with the figures
below.

**Fixed by the user (2026-10-13):**
- Five tabs in a bottom bar, mobile first at 390px:
  **Start batch | Today | Feed & bills | Results | Next batch.**
- Each tab mirrors one of Daniel's sheets: Initialization, Record, Feed
  Account and Final Report. Next batch has no sheet; it is the new one.
- A WORKER sees Today only. An OWNER or MANAGER sees all five.
- Today is the landing tab.

## 1. Routes

| Tab | Route | Sheet | Who | Built in |
|---|---|---|---|---|
| Start batch | `/start` | Initialization | OWNER, MANAGER | Step 2 |
| **Today** | **`/today`** | Record | everyone | Step 1 (U7 chunk 5) |
| Feed & bills | `/feed` | Feed Account | OWNER, MANAGER | Step 3 |
| Results | `/results` | Final Report | OWNER, MANAGER | Step 4 |
| Next batch | `/next` | (new) | OWNER, MANAGER | Step 5 |

- **Sign-in lands on `/today`.** `HOME_AFTER_SIGN_IN` changes from
  `/capture`, and `/capture` redirects to `/today`, so the branch deploy's
  link keeps working.
- **All five are signed-in routes.** The middleware matcher and
  `gate.isProtected` grow to cover them. Each page checks the user and the
  role itself, as `/capture` does today (D12: middleware is not the
  authority). RLS still has the last word on every row.
- **A WORKER who opens an OWNER or MANAGER route is redirected to `/today`.**
  The page checks this on the server. Hiding the tab is not the guard.
- **`/` keeps the sample dashboard until step 6.** In step 6 it redirects to
  `/today`, and `lib/u9/fixture.ts` is deleted. Until then `/` is reachable
  only on the branch deploy, because production shows "not ready yet".
- **A tab that is not built yet is not shown in the bar.** The bar shows the
  tabs as their steps land. It never links to a placeholder.

**Layout:** a route group `app/(farm)/` with one `layout.tsx`. The layout
holds the header (product name, farm, batch picker, sign out) and the tab bar.
It reads the session, the role and the batch list once, on the server.

## 2. The tab bar

- **`<nav aria-label="Sections">` with five links,** and `aria-current="page"`
  on the active one. These are links, not ARIA tabs, because each one is a page
  of its own.
- **Text labels only, no icons.** The labels are the recognition: they are
  the names Daniel already uses. The app has no icon library, and adding one
  for this is not worth a dependency. At 390px each tab is 78px wide, and a
  label may wrap to two lines ("Feed & / bills"). Every target is at least
  56px tall, above §0's 44px minimum.
- **Fixed to the bottom,** with `env(safe-area-inset-bottom)` padding. Pages
  pad their own bottom by the same height, so the bar never covers the submit
  button.
- **▶ SIGN-OFF · A WORKER gets no bar at all.** A bar with one tab is chrome
  with no choice in it. Today for a WORKER is then exactly U7's brief: one
  column, no navigation chrome (ui-context, "Capture screen").
- **▶ SIGN-OFF · On Today, the bar hides while a form field has focus.** On a
  phone the keyboard pushes a fixed bar up over the field being typed in. The
  rule is CSS only (`:has(input:focus)`), with no script. This amends
  ui-context's "no navigation chrome beyond a back arrow" for an OWNER or
  MANAGER on Today, and AD-104 records that.
- **The same bar at every width this phase.** A side rail for wide screens is
  later.

## 3. Picking a batch

- **The batch is in the URL: `?batch=<code>`.** Codes are unique per
  organisation (`unique (org_id, code)`), and they read better than ids. The
  tab bar's links keep the parameter, so a switch to Feed & bills stays on the
  same batch.
- **With no parameter, the batch is the most recently placed open batch.** In
  the usual case there is one open batch, and there is nothing to pick.
- **The picker shows only when there is a choice.** It sits in the header, as
  a native `<select>` of batch codes with their placement dates. More than one
  open batch is a real case: a leveraged rollover places the next batch before
  the current one is harvested.
- **Today, Feed & bills and Next batch list open batches.** These come from
  `capture_batches()` (closed batches are excluded).
- **Results lists every batch, closed ones included.** A finished batch is
  the one with results to show. It uses the same picker, and the same
  default.
- **An unknown or unreadable code shows "That batch isn't one you can see",**
  with a link to the default batch. It never swaps in another batch, because
  that would show one batch's figures under a URL that names another.
- **One shared, pure `resolveBatch(batches, param)` decides the batch.** The
  layout's picker and every page call it, so the two cannot disagree. Layouts
  do not receive search parameters in Next, so the picker and the bar are small
  client components that read the URL. They hold no Supabase client.

## 4. What each tab shows before there is data

| State | Start batch | Today | Feed & bills | Results | Next batch |
|---|---|---|---|---|---|
| **No farm access** (no membership) | "No farm access yet. Ask the owner to add you." on every tab, with no bar | | | | |
| **No open batch** | The form. This is its normal state | OWNER/MANAGER: "No batch to record yet." plus a link to Start batch. WORKER: "No batch to record yet. Ask the owner to start one." | "Feed bills start once a batch is placed." plus a link to Start batch | With no batch ever: "Results come from a batch's own records. None yet." | "The next batch is worked out from the one in progress. Start a batch first." |
| **Batch placed, no records** | The form, with the open batches listed above it | The form for today's day, asking for culls outright (D4) | The planned feed and bills, labelled "Planned", as the cash card already labels them | Costs placed so far. "No sales recorded yet, so there is no income or profit to show." | The recommendation card, with its caveats |
| **No prices set up** (no parameter set in force, `RP002`) | (not needed) | (not needed) | "Needs your prices before bills can be worked out:" then the missing settings, by name | The same | The same |

- **Every empty state is a sentence and, at most, one link.** None shows a
  zero, a dash standing in for a figure, or a sample number (rule 3).
- **Results never estimates.** Until a sale is recorded it shows costs only,
  and it says why (the user's step 4).

## 5. Where the U9 components go

| On `/` now | Moves to | Change on the way |
|---|---|---|
| `RecommendationCard` | Next batch | It says "your placement ceiling, not an optimised recommendation" on the card, never as a footnote (the user, 2026-10-13) |
| `ModesCard` | Next batch | Cover Fast and Build Reserve say "Coming next: needs your working capital setup" (OQ-46) |
| `CashCalendarCard`, `CashChart`, `OutgoingTable` | Feed & bills | Real data through `loadEngineInput`. TD-12's stacked rows under `sm` |
| `Explain`, `primitives`, `ui/badge`, `ui/card`, `ui/popover` | Shared, unchanged | None |
| `buildConsole` (`lib/u9/console.ts`) | Split in two: a cash view for Feed & bills, a next-batch view for Next batch | `batchLabel`'s "Example batch" goes. TD-8's `Explained<T>` stays in the web layer until it is due |
| The page header | The `(farm)` layout's header | Farm name from the membership, not the `FARM_NAME` constant |
| `Greeting` | Deleted in step 6 | Today stays at density 2, with no greeting |
| `fixture.ts`, `app/page.tsx` | Deleted in step 6 | `/` redirects to `/today` |
| `NotReady` | Stays | Shown on every tab when the deploy has no sign-in |

New, with no U9 component: the Start batch form (step 2), the Today form (U7
chunk 5) and the Results costs (step 4).

## For sign-off

1. **The five routes** in section 1, with `/capture` redirecting to `/today`.
2. **A WORKER gets no tab bar,** and an OWNER or MANAGER's bar hides on Today
   while a field has focus (AD-104, amending ui-context's capture rule).
3. **The batch lives in `?batch=<code>`.** It defaults to the most recently
   placed open batch, and the picker shows only when there is a choice.
   Results also lists closed batches.
4. **The empty states** in section 4, including "Needs your prices".

**One gap, for steps 2 and 6, not decided here.** Feed & bills, Results and
Next batch all need a parameter set in force: feed prices per bag, gate price,
overheads. Without one, `engine_snapshot` refuses with `RP002`. Start batch
also needs a breed curve to choose. Nothing in
steps 1 to 6 creates either, and `createParameterSet` is not built. My
recommendation is that step 6 writes Daniel's parameter set and curve from his
spreadsheet's figures, through the service role, in the same approved window
as his OWNER account. A settings screen would stay out of scope. That window
needs your yes, as every write does.

**Approved 2026-10-13.** Loaded in the step 6 window, with the user's yes at
that point. The seed is written first as a reviewable SQL file and shown to the
user before any write. It uses **Daniel's current figures, not the
workbook's** (as given by the user, 2026-10-13):

| Setting | Figure |
|---|---|
| Feed, per 50 kg bag | Starter $30.60 · Grower $29.60 · Finisher $28.60 |
| Chicks | $1.00 each |
| Gate price | $4.25 per bird, flat |
| Abattoir | 10c per bird, plus transport 10c per bird |
| Feed delivery | $40 per tonne, paid on collection |
| Vaccine | $42 |
| Electricity | $140, split by the months the batch runs |
| Labour | $640, paid when the batch is done |
| Overheads' label | "measured on a 3,000-bird batch" (OQ-15 is still open) |
| Bulk bands, dressed weight | $3.90 at 1.1 kg · $3.80 at 1.2 kg · $3.70 at 1.3 kg · nothing above 1.3 kg |
| Growth curve | `context/breed_curve.json` |
