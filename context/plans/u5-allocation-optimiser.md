# U5 — M5 Allocation Optimiser

**Spec, complete.** Written 2026-09-10 from the two `/grill-me` rounds
that preceded U5. Round 1 settled the enumeration's **shape** (AD-40,
AD-41, AD-42, OQ-18); round 2 settled its **mechanics** (AD-43, AD-44,
AD-45). The frontier is closed and the build loop may start.

---

## What is buildable today, and what is not

This distinction governs the whole unit, so it comes first.

**Buildable today: the enumeration's shape.** The candidate set, its
bounds, its step, the 14-day floor, the date range, the place-nothing
case, and scoring against the cash calendar for a **gate-only** candidate.
All of it is testable without a single client answer.

**Not returnable today: any bulk-inclusive recommendation.** The moment a
candidate routes birds to bulk, scoring it needs **bulk net per bird** —
contract price − abattoir fee − transport — and:

- **OQ-2's transport half** is unanswered. The abattoir fee landed
  2026-09-10; the run to the abattoir did not.
- **OQ-16** gates it independently: the Final Report's "Other/Transport"
  line already books transport for a gate-sold batch, and the brief says
  outright "Do not double-count costs". An answered OQ-2 does **not**
  release OQ-16.

So a bulk-inclusive candidate returns a typed `missing_input` naming both
gaps (invariant 5), exactly as fixture 13 already does for a BULK sales
order. **It does not return a number, and it does not fall back to a
gate-only figure dressed as a complete one.** Both are in the blocked-work
table in `current-issues.md`; that table is the gate, not this paragraph.

---

## Shape, settled in round 1

Five decisions, all approved. Three became architecture decisions: **AD-40** (the
date is enumerated), **AD-41** (the enumeration's shape), **AD-42** (no
Auto mode). One raised a client question: **OQ-18** (the hatchery's
invoice unit).

### 1. No Auto mode in M5's output — AD-42

M5 enumerates and scores the **three** modes of AD-35 and nothing else. No
fourth objective, and no mode that picks among the other three.

A `recommended` flag may be built later, but it is a **UI concern for
U7–U11**, computed *after* the three strategies, never part of the
enumeration. If it is built, its entire rule must be statable in one line
the user can check — "this is the only mode that does not breach the
reserve floor" — and when more than one mode qualifies it shows **no flag**
rather than a tie-break nobody can see.

The brief's design principle is the reason: *"Rather than pick one, the
system presents three named strategies side by side and lets him
choose."* A black box carrying the authority of three transparent ones is
worse than no pointer at all.

### 2. `placement_step_birds`, an assumed 100 — AD-41, OQ-18

The enumeration steps batch size by a **named parameter**, never a
literal. Default **100**, carrying `confidence: 'assumed'`.

100 is the conventional day-old-chick box and divides both 3,000 and
30,000 exactly. It is not a client figure — **OQ-18** asks Daniel what his
hatchery actually invoices in. Anything the step determines carries
`'assumed'` until he answers.

Stepping to the bird is wrong in both directions: 27,000 candidates a date
is pointless work, and a recommendation of 7,432 birds is not orderable.

### 3. Size 0 is a real candidate, reported as `place_nothing` — AD-41

Build Reserve optimises cash retained after obligations, and its honest
optimum is sometimes to place nothing. Suppressing that would be the
engine declining to say something true.

But it is reported as its **own outcome**, not as a zero-bird batch
flowing through the standard fields. A batch of zero birds would put $0 of
revenue and $780 of `PER_BATCH` overhead (labour $640, electricity $140 —
AD-26) into a projection as though a batch existed. `place_nothing`
carries the overhead arithmetic that justifies it instead.

### 4. The placement date is enumerated from the floor — AD-40

**Size × date, two-dimensional.** Dates run from the floor —
`harvest_completion + 14`, invariant 16 — **forward to floor + 30 days**,
stepped daily.

The floor is untouched and unarguable. What the date range adds is the
space *above* it: bulk proceeds land **30 days** after the sale while the
floor is only harvest_end + 14, so for roughly 16 days after the floor,
waiting longer means more cash has arrived, which finances a larger batch.
That is a live trade-off in the placement date, running in the opposite
direction from the floor, so the floor does not foreclose it.

The range ends at floor + 30 because that is the bulk terms length. Past
it no further receivable is unlocked by waiting, so the space genuinely
closes rather than being truncated for convenience.

**Read AD-40 before concluding this contradicts AD-31 or AD-35.** It
sharpens both and reverses neither; AD-40 states precisely what each of
them settled and what this adds.

### 5. One next placement, scored against the whole cash calendar — AD-41

The free variables are **size × date for a single next placement**. There
is no joint optimisation across two placements — a combinatorial jump for
a case the MVP caps at two batches anyway (AD-8).

But every candidate is scored against the **full cash calendar, including
any already-running second batch's obligations**: its feed draws compete
for the same facility headroom and the same cash, and its harvest lands
inside the window being projected over. If that second batch's obligations
make every candidate breach the reserve floor, **that is a real and
reportable answer**, not a failure to find one.

---

## Invariants this unit is built against

- **Invariant 16 / AD-31.** No candidate earlier than
  `harvest_completion + 14` is ever *generated*. Not a penalty term, not a
  soft preference, not tradeable by any mode — a mode that could out-argue
  it would eventually recommend placing into an uncleaned house. The gap
  runs from harvest **completion** (the last bird), not the first sale.
- **Invariant 5.** A bulk-inclusive candidate returns `missing_input`, not
  an estimate. See the top of this file.
- **Invariant 2.** Money is `bigint` cents throughout the scoring path.
- **Invariant 1.** No I/O, no `Date.now()`. `asOf` is a parameter.
- **AD-35.** Three modes. Maximum Growth means leveraged rollover — the
  largest next batch the proceeds can finance, with draws timed against
  sales proceeds.

---

## Mechanics, settled in round 2

### 6. Three integer scalars, a filtering floor, and an own-completion horizon — AD-43

Each mode ranks by one scalar, and all three are **integers**, so no float
touches the ranking (invariant 2):

| Mode | Scalar | Direction |
|---|---|---|
| Cover Fast | days from placement until cumulative receipts clear the new batch's core credit | minimise |
| Maximum Growth (leveraged rollover) | placement size in birds | maximise |
| Build Reserve | cash retained in cents once obligations are discharged | maximise |

**The reserve floor filters; it never scores.** A candidate that breaches
it is *excluded* from every mode's ranking, not ranked lower. OQ-3 settled
it as a hard constraint with an override path, and folding it into Build
Reserve's objective as well would both double-count it and let a
high-scoring candidate buy its way past a constraint that is not for sale.

**Each candidate is scored over a horizon anchored to its OWN completion** —
`placement + 41 + terms_days` — not over the fixed 90-day display calendar.
Scoring every candidate over 90 days from `asOf` would give a candidate
placed at floor + 30 thirty fewer days of its own cycle inside the window
than one placed at the floor, so Build Reserve would prefer early
placement for a **window-truncation artefact** rather than an economic
reason. That is the AD-36 error — two quantities compared at mismatched
points, the mismatch read as a real difference. The 90-day calendar stays
what it is: a display horizon, not a scoring window.

### 7. A deterministic, stated tie-break, with the tie reported — AD-44

**Earliest date first, then smaller size.** Earliest because the floor
already handles biosecurity and idle days earn nothing; smaller size
because at an equal score it risks less capital.

The rule is stated and tested rather than implicit. An *implicit*
tie-break — whichever candidate the loop reached first — makes the output
depend on enumeration order, which no test pins down and which changes
silently the day someone reorders the loops.

**The tie is itself reported:** `tied_candidates` on the winner. Eleven
candidates scoring identically means the choice is insensitive, and that is
decision-relevant — Daniel can then pick on grounds the engine cannot see,
like a hatchery delivery he would rather not rush. Flattening it into one
confident answer throws that away.

### 8. Two functions, and one cash projection per candidate — AD-45

**The decision path returns four objects:** the winner per mode, plus
`place_nothing`, each with its full explained breakdown, the candidate
count considered, and its tie count. Not the 8,401-candidate surface —
271 sizes x 31 dates, three times over, is ~25,000 objects crossing the
engine boundary to a cheap Android.

**The surface has its own function.** `enumerateCandidates()` is called
explicitly by the scenario sliders, which want the curve rather than three
points on it. One function per question.

**Every candidate's cash calendar is projected exactly once**, and all
three modes rank from that shared object. A candidate's cash position is
mode-independent, so projecting per mode would permit the three modes to
disagree about the same candidate — consistency is structural here rather
than something tests have to chase.

---

## The two-blocked-one-working asymmetry — state it, do not smooth it

A consequence of AD-43's scalars, not a separate decision, and it will be
**visible in every test run and demo until OQ-2's transport half and OQ-16
land**:

| Mode | Bulk-inclusive candidate | Why |
|---|---|---|
| Cover Fast | `missing_input` | its scalar needs receipts, which need bulk net |
| Build Reserve | `missing_input` | same |
| Maximum Growth | **a real number** | its scalar is placement size, which needs no bulk net |

**Two of three modes returning `missing_input` while the third returns a
real answer is correct and expected.** It is not a regression, not a
partial failure, and not something to investigate the first time someone
sees it. It is invariant 5 working: the engine declines to compute what it
cannot, names what is missing, and still answers the question it *can*
answer.

So the output must say so. A bulk-inclusive `missing_input` from M5 names
both gaps **and** states that the blocked/working split across modes is
expected while they are open — the `why` carries it, so anyone reading a
test run or a demo sees the explanation in the output itself rather than
having to find this file.
