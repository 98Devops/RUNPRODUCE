# CONTEXT — Shared Language

The vocabulary of this project. Read before writing any identifier.

Agents dropped into a project without a glossary invent their own
jargon, use twenty words where one would do, and name things
inconsistently across files. This document is the fix. **Use these
terms in code, in tests, in commits, in conversation, and when talking
to the client.** They are the client's own words.

Add to this file whenever a new domain term is settled. Do not
introduce a synonym for a term already listed here.

---

## The business

**RunProduce** — a Zimbabwean broiler production business. Buys day-old
chicks, raises them ~30 days, sells through two channels.

**Daniel** — the owner. The decision-maker and primary user.

---

## Production

| Term | Meaning | Not |
|---|---|---|
| **Batch** | One group of chicks placed on one date and raised together | ~~flock run, cycle, lot~~ |
| **Placement** | The day chicks arrive. Day 1 of the batch. | ~~intake, start date~~ |
| **Chick** / **DOC** | Day-old chick | ~~bird~~ (a bird is any age) |
| **Bird** | A chicken of any age in the batch | |
| **Extra chicks** | Free chicks supplied by the hatchery above the ordered count. **They count toward the flock.** | |
| **Day number** | Days since placement. Day 1 is placement day. | ~~age in days~~ |
| **Opening birds** | Birds alive at the start of a day | |
| **Closing birds** | Opening − daily mortality − daily culls − sold. All three removals are **derived** from cumulative columns. | |
| **Mortality** | Birds that died | ~~deaths, losses~~ (a loss is financial) |
| **Cumulative mortality** | Total dead since placement, as of a given day. **This is what gets entered.** | ~~today's deaths~~ |
| **Daily mortality** | One day's deaths. Always **derived** as `cumulative[d] − cumulative[d−1]`, never entered. | ~~mortality count~~ |
| **Cull** | A bird deliberately removed, not a natural death | |
| **Cumulative culls** | Total culled since placement, as of a given day. **This is what gets entered**, exactly as mortality is. | ~~today's culls~~ |
| **Daily culls** | One day's culls. Always **derived** as `cumulative[d] − cumulative[d−1]`, never entered. | ~~cull count~~ |
| **Livability** | % of placed chicks still alive | ~~survival rate~~ |
| **Pre-harvest mortality** | The accelerating death rate in the final days before harvest. The core operational risk. | |
| **Breed curve** | The 41-day table of expected weight and feed intake per bird per day. Seeded from the client's own data. | ~~growth standard~~ |
| **Calibration** | Adjusting the breed curve to observed weights | |

---

## Feed

| Term | Meaning | Not |
|---|---|---|
| **Draw** | One feed collection taken on credit. Payment falls due 30 days from the collection date. | ~~purchase, order, delivery~~ |
| **Collection date** | The day a draw is physically taken | |
| **Due date** | Collection date + terms days. Always derived, never entered. | |
| **Phase** | `STARTER` (days 1–13), `GROWER` (14–27), `FINISHER` (28+) | ~~feed stage, feed type~~ |
| **Facility** | The feed supplier's credit line. 0% interest. | ~~loan, account~~ |
| **Headroom** | Facility limit − total outstanding | |
| **FCR** | Feed conversion ratio — kg feed ÷ kg live weight produced | |
| **Biological FCR** | FCR including feed eaten by birds that later died. The honest number. | |

---

## Sales

| Term | Meaning | Not |
|---|---|---|
| **Gate sale** | A live bird sold at the farm for cash, same day. Channel `GATE`. | ~~retail, direct sale, cash sale~~ |
| **Bulk sale** | A bird sent via the abattoir to the contract buyer. Paid 30 days later. Channel `BULK`. | ~~wholesale, contract sale~~ |
| **Gate capacity** | Birds the local market absorbs per day. 500–1,000. **A rate, not a total.** The binding constraint on batch size. | |
| **Contract buyer** | The bulk purchaser. Collects from the abattoir. | |
| **Abattoir** | Third party performing slaughter. **RunProduce bears this cost.** | |
| **Bulk net** | Contract price − abattoir fee − transport to abattoir | ~~bulk price~~ |
| **Receivable** | Money owed by the contract buyer, dated 30 days out | |
| **Receipt** | An actual payment landing | ~~payment~~ (ambiguous — could be outgoing) |
| **Pricing basis** | `PER_BIRD` or `PER_KG`. Determines whether growth adds revenue. | |
| **Slaughter target** | 1,770 g live weight. Reached around day 30. | |

---

## Cash

| Term | Meaning | Not |
|---|---|---|
| **Core credit** | Chick cost + feed cost to harvest. What gate sales must cover. | |
| **Cashflow days** | Market date − draw due date. Negative means the bill lands before the birds are sellable. **The client's own term — keep it.** | |
| **Market date** | The day birds become sellable | |
| **Reserve floor** | The cash level below which no recommendation may take him | ~~minimum balance~~ |
| **Cash calendar** | Day-by-day projected balance over the horizon | |
| **Harvest window** | The day range in which harvesting is sensible, e.g. day 29–31. Always a range — weight comes from a sample. | ~~harvest date~~ |
| **Max safe batch size** | Largest placement that gate capacity can clear before pre-harvest mortality eats the gain | |
| **Cost of delay** | What one more day of holding costs, per channel | |

---

## The three strategies

Named, capitalised, and used consistently in code and UI:

| Strategy | Optimises for |
|---|---|
| **Cover Fast** | Fewest days to clear core credit |
| **Maximum Growth** | Earliest possible next placement |
| **Build Reserve** | Highest cash retained after obligations |

---

## System terms

| Term | Meaning |
|---|---|
| **The engine** | `packages/engine`. Pure, no I/O. All business logic. |
| **Explained value** | A number returned with its formula, inputs and confidence |
| **Confidence** | `measured` (from farm data), `calibrated` (derived from farm data), `assumed` (our guess — flag it) |
| **Golden fixture** | A test encoding the client's real spreadsheet output. The contract. |
| **Held fixture** | A golden fixture CI reports but does not fail on, because the engine call throws `NotImplementedError` or the fixture has no expected value yet. Derived per run, never a declared list. |
| **Provisional fixture** | A golden fixture whose expected value rests on an assumption rather than client data. **It still asserts** — it is not held. |
| **Placeholder** | `expect.placeholder` in a fixture file: the expected value is not knowable yet, and this names the OQ it waits on. |
| **Missing input** | The engine's refusal to compute when a required value is unknown. Never a silent default. |
| **Unit** | One step of the build, U1–U11 |
| **OQ-n** | An open question in `current-issues.md` |
| **AD-n** | An architecture decision in `progress-tracker.md` |
| **KB-n** | A known bug in the client's spreadsheet that we deliberately diverge from |

---

## Naming rules

- Database columns use the glossary term in snake_case:
  `opening_birds`, `collection_date`, `bulk_net_cents`
- Money columns always end `_cents`. Weight columns always end `_g`.
- Channel and phase values are the uppercase constants above:
  `GATE`, `BULK`, `STARTER`, `GROWER`, `FINISHER`
- Never abbreviate a glossary term in an identifier. `mortality`, not
  `mort`. `receivable`, not `recv`.
- A day number is `day_number`, never `day` (ambiguous with a date).

---

## Words we do not use

These sound right and are wrong here. They introduce ambiguity or
import assumptions from other domains.

| Avoid | Because |
|---|---|
| ~~Customer~~ | There are two very different buyers. Say gate buyer or contract buyer. |
| ~~Inventory~~ | Birds are growing biological assets, not stock. |
| ~~Revenue~~ unqualified | Always say gate revenue or bulk revenue — they arrive 30 days apart. |
| ~~Profit~~ as the goal | The client optimises for cash and growth. Profit is an output, not the objective. |
| ~~Loss~~ for a dead bird | A dead bird is mortality. A loss is financial. |
| ~~Harvest date~~ | It is a window. Weight comes from a sample with real error. |
| ~~Feed order~~ | It is a draw. It is credit, not a purchase. |
