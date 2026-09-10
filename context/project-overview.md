# RunProduce — Broiler Cashflow & Harvest Decision System

## Overview

RunProduce (trading as Danrun Poultry) is a Zimbabwean broiler
production business. They buy day-old chicks, raise them for roughly 30
days, then sell through two channels: **live birds at the farm gate for
immediate cash**, and **dressed birds to a contract buyer who pays 30
days later**.

They already run a working Excel system that tracks mortality, feed
consumption, feed credit due dates, and batch profit. It works well and
they trust it. It has one blind spot: it cannot distinguish cash sales
from 30-day sales, so it cannot tell them anything about *when money
arrives*.

This application replaces that spreadsheet with a system that does
everything it does, plus the six things it cannot: channel-aware sales,
a forward cash calendar, harvest timing as a calculation, maximum safe
batch size, next-batch affordability, and a view across overlapping
batches.

**The user is the business owner, Daniel.** The daily data entry is
done by a farm worker.

## The problem in one sentence

> Turn a daily bird count into a dated cash calendar, and answer the
> three questions the owner cannot compute in his head: when to
> harvest, how many to sell at the gate, and how big the next batch can
> safely be.

## Goals

1. **Reproduce their spreadsheet exactly.** Same batch, same inputs →
   same feed cost, same FCR, same bag counts. This is how trust is
   earned. Verified by golden fixtures.
2. **Show cash by date, not just profit by batch.** The owner must be
   able to see his projected bank balance on any future day.
3. **Recommend a harvest day and a gate/bulk split**, with the
   arithmetic visible behind every number.
4. **Tell him his maximum safe batch size** given his fixed gate
   selling capacity and pre-harvest mortality.
5. **Work at any batch size.** 3,000 to 30,000. Nothing hardcoded.
6. **Survive imperfect data entry.** Degrade to forecast when daily
   records are missing, and say so visibly.

## Domain primer

Read this before writing engine code.

| Term | Meaning |
|---|---|
| **Batch** | One group of chicks placed on one date and raised together |
| **Placement** | The day chicks arrive. Day 1. |
| **DOC** | Day-old chick |
| **Gate sale** | Live bird sold at the farm for cash, same day |
| **Bulk sale** | Bird sent to an abattoir, sold to a contract buyer, paid 30 days later |
| **Draw** | One feed collection on credit. Payment due 30 days from collection date. |
| **FCR** | Feed conversion ratio — kg feed ÷ kg live weight gained |
| **Livability** | Percentage of placed chicks still alive |
| **Pre-harvest mortality** | Accelerating death rate in the final days before harvest. The core risk. |
| **Dressing yield** | Live weight → carcass weight after slaughter |

### The production cycle

```
Day 1      Chicks placed. Starter feed draw collected.
Day 1-13   Starter feed
Day 14-27  Grower feed
Day 28+    Finisher feed
Day 30     Birds reach ~1,754 g — the slaughter target
Day 30-35  Harvest window. Gate sales run at 500-1,000 birds/day.
Day 30+    Pre-harvest mortality accelerates sharply
Day 60     Bulk buyer pays
```

### Feed draw cadence (their actual rhythm — preserve it)

| Draw | Collected | Due | Relative to selling |
|---|---|---|---|
| Starter | day 1 | day 31 | ~3 days before selling — the only tight one |
| Grower crumbs | day 14 | day 44 | ~1 week after |
| Grower pellets | day 21 | day 51 | ~2 weeks after |
| Grower/finisher | day 28 | day 58 | ~3 weeks after |
| Finisher | day 35 | day 65 | ~1 month after |

## Core user flows

### Flow 1 — Place a batch *(once per cycle, ~2 min, owner)*
Enter placement date, chick count, chick price, extra chicks. System
generates projected feed schedule, draw dates, due dates, expected
harvest window.

### Flow 2 — Daily capture ⭐ LOAD-BEARING *(daily, <60s, farm worker)*
Enter deaths, feed kg issued, and on weigh days an average sample
weight plus sample size. Everything else in the system derives from
this. **This flow must be the fastest, simplest screen in the app.**

### Flow 3 — Log a feed draw *(~5× per cycle, owner)*
Date, feed type, bags, price per bag. Due date computed automatically.

### Flow 4 — The harvest decision ⭐ THE MONEY MOMENT *(~day 26-30, owner)*
System shows birds alive, current and projected weight, recommended
bulk harvest day, gate selling window, the gate/bulk split under three
named strategies, resulting cash timeline, and next-batch date.

### Flow 5 — Log sales *(daily during harvest week, owner)*
Channel (GATE / BULK), bird count, weight, price. Gate creates cash
immediately. Bulk creates a receivable dated +30 days.

### Flow 6 — Record a receipt *(~day 60, owner)*
Bulk payment lands. Receivable clears.

### Flow 7 — Close the batch *(once per cycle, owner)*
Final P&L, actual vs projected, and recommended size for the next
placement.

## Features

### Production tracking (parity with their spreadsheet)
- Daily mortality, feed issued, sample weights
- Derived birds alive, cumulative feed, FCR, livability
- Forward projection from the seeded breed curve, calibrated against
  actual weights
- Feed phase transitions (starter / grower / finisher) by day

### Feed credit ledger
- Draws with automatic due dates (30 days from collection)
- Partial payments and outstanding balance
- Facility headroom
- `cashflow_days` — the gap between when birds become sellable and when
  a draw falls due. This concept comes from the client's own
  spreadsheet. Keep the name.

### Sales and receivables
- Two channels with different cash timing
- Bulk net per bird = contract price − abattoir fee − transport
- Receivables ageing

### Cash calendar
- Day-by-day projected balance over a 90-day horizon
- Minimum balance and the date it occurs
- Reserve floor breach detection

### Decision engine
- Recommended bulk harvest day (first day at target weight)
- Recommended gate selling window (while growth still outpaces
  mortality)
- Gate/bulk split under three named strategies (see below)
- Maximum safe batch size
- Next-batch affordability and earliest safe placement date
- Cost of delay — what one more day of holding costs, per channel

### Three strategies, not one recommendation
The owner gave three goals that conflict: cover credit fast, grow, and
build reserves. Rather than pick one, the system presents three named
strategies side by side and lets him choose:

| Strategy | Optimises for |
|---|---|
| **Cover Fast** | Minimum days to clear chick + feed credit |
| **Maximum Growth** | **Leveraged rollover** — the largest next batch the proceeds can finance, with draws timed against sales proceeds (AD-35) |
| **Build Reserve** | Highest cash balance retained after obligations |

### Explainability
Every displayed number expands to show its formula, its inputs with
their sources, and a confidence level: `measured`, `calibrated`, or
`assumed`.

## Scope

### In scope (MVP)
- Single farm, single organisation
- Up to 2 concurrent overlapping batches
- Daily capture, feed ledger, sales ledger, cash ledger
- Cash calendar and decision engine
- Three-strategy harvest recommendation
- Max safe batch size
- Scenario sliders (batch size, prices, mortality, gate capacity, harvest day)
- CSV export
- USD only

### Out of scope (MVP)
- Importing their existing spreadsheet file
- More than 2 concurrent batches
- WhatsApp alerts (in-app + email only)
- Offline sync beyond a local draft of the capture form
- Multi-currency
- Multi-farm or multi-tenant signup
- Machine-learned growth prediction
- PDF generation (use a print-friendly page)
- Bank or mobile money reconciliation

## Success criteria

1. Given the client's real batch (3,000 chicks, $1.00 each, placed
   2026-02-06), the engine reproduces total feed cost $8,079.81,
   13,224 kg feed, and FCR 1.53 at day 41.
2. Starter draw bag count computes to 26.64 bags.
3. Weight at day 30 is 1,754 g; cumulative feed 2.337 kg/bird.
4. Feed draw due dates from a 2026-02-06 placement are Mar 8, Mar 22,
   Mar 29, Apr 5, Apr 12.
5. Daily capture completes in under 60 seconds on a phone.
6. Every number on the decision screen expands to show its arithmetic.
7. Changing any scenario slider recalculates the full dashboard in
   under 200 ms.
8. When abattoir cost is unknown, the bulk recommendation is withheld
   with a clear message rather than estimated.
9. Batch size can be set to any value from 100 to 100,000 and every
   derived figure scales correctly.
10. `npm run build` passes and the engine test suite is green.
