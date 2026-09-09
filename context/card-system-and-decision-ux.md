# Card System & Decision UX

Two reference components merged into one card system, plus the UX
psychology principles — filtered, because four of the six are conversion
tactics that do not belong in a tool that tells a man how many birds to
sell.

---

# PART 1 — THE CARD MERGE

## What comes from where

| From **Statistics Card 2** (the four-across) | From **Statistics Card 10** (the single light card) |
|---|---|
| The four-across KPI row layout | Light surface, one accent, generous space |
| Value + delta chip on one line | Icon + label header with a quiet menu affordance |
| A comparison line beneath a divider | Big value with the unit set separately and smaller |
| | Secondary metrics as inset sub-rows |

**Neither is copied.** Card 2 contributes structure only — its
`bg-fuchsia-600` / `bg-blue-600` / `bg-teal-600` palette, BorderBeam
(`#9c40ff` — the Lila ban, literally), Inter font, `.dark` block, forty
keyframe animations and decorative blurred SVG blobs all violate §0 and
AD-11. Card 10's *treatment* is what we take.

## Card variants

### `MetricCard` — the four-across hero row
```
┌──────────────────────────────────┐
│ Birds alive                  ⋯   │   label: text-xs, muted, sans
│                                  │
│ 4,712        ▼ 288 (5.8%)        │   value: text-4xl MONO tabular
│                                  │   delta chip: neutral bg, semantic text
│ ─────────────────────────────────│
│ Planned at day 24: 4,750         │   comparison: text-xs muted, mono figure
└──────────────────────────────────┘
```

Rules:
- **White surface, `--border-default`, no fill colour.** Card 2 fills
  the whole card with saturated colour; we do not. Colour appears only
  in the delta chip and only where it carries meaning.
- Delta chip: neutral background, semantic *text* colour. Green
  `--flow-in`, red `--flow-out`, amber `--flow-pending`.
- Value always mono with `tabular-nums`.
- **No decorative SVG.** Card 2's blurred blobs carry no information.
- The comparison line is mandatory. A number with nothing to compare it
  against is not a metric — it is a fact. Compare to plan, to standard
  curve, or to the previous batch.

### The four hero metrics

| Card | Value | Delta | Comparison |
|---|---|---|---|
| **Birds alive** | count | vs. planned mortality | "Planned at day N: X" |
| **Day N of 30** | day number + progress | days to harvest window | "Harvest window: day 29–31" |
| **Cash today** | balance | change since last week | "Lowest projected: $X on day N" |
| **Feed due, 7 days** | amount | draws falling due | "Facility headroom: $X" |

### `DecisionCard` — the recommendation, from Card 10's pattern

Card 10's inset sub-rows are the right shape for the recommendation,
because the answer is one headline number plus supporting figures:

```
┌────────────────────────────────────────────┐
│ ▤ Recommended allocation              ⋯    │
│                                            │
│ 2,675  birds at the gate                   │  primary, text-4xl mono
│ ▸ covers chick + feed credit by day 33     │  plain-language consequence
│                                            │
│ ┌────────────────────────────────────────┐ │
│ │ Send to abattoir            2,025 birds│ │  inset sub-rows,
│ ├────────────────────────────────────────┤ │  --bg-raised
│ │ Cash at the gate              $11,502  │ │
│ ├────────────────────────────────────────┤ │
│ │ Arriving day 60                $7,695  │ │
│ ├────────────────────────────────────────┤ │
│ │ Lowest cash point      $2,140 · day 51 │ │
│ └────────────────────────────────────────┘ │
│                                            │
│ Why this number ▸                          │  Explained popover
└────────────────────────────────────────────┘
```

Every figure wrapped in `<Explained>`. Confidence badges apply —
anything downstream of the uncalibrated mortality model (OQ-1) renders
`assumed` with the dashed grey treatment.

### `CaptureCard` — the opposite

`VISUAL_DENSITY 2`. Three fields, `text-2xl` inputs, 44px+ targets, one
button. **None of the above applies.** Do not put metric cards on the
capture screen.

## Implementation notes

- Build on shadcn `Card`, customised to our tokens — never shipped
  default (`code-standards.md`).
- Do **not** install `border-beam`, `tw-animate-css`, or any keyframe
  library from the reference snippets.
- Ignore the `:root` / `.dark` CSS blocks that ship with those
  components entirely. `DESIGN.md` owns tokens.
- Dependencies actually needed: `@radix-ui/react-slot`,
  `class-variance-authority`, `lucide-react`, `@radix-ui/react-dropdown-menu`.
  Nothing else from those lists.

---

# PART 2 — UX PSYCHOLOGY, FILTERED

The six principles come from consumer SaaS, where the goal is to
convert a stranger into a paying user. **RunProduce has one user, who
is already committed, using it to make financial decisions about his
own livelihood.**

That changes everything. A tactic that ethically nudges a stranger
toward a free trial becomes manipulation when it nudges a farmer toward
selling birds.

| Principle | Verdict | Why |
|---|---|---|
| **Smart defaults** | ✅ **Adopt fully** | Already core to the design |
| **Goal gradient** | ⚠️ **Adapt — honestly** | Real progress only. Never artificial. |
| **Reciprocity** | ❌ Not applicable | No signup funnel exists |
| **IKEA effect** | ✅ **Adopt — it is already built** | The scenario sliders are exactly this |
| **Loss aversion** | ⚠️ **Adapt with care** | Report real cost of delay. Never *frame* to drive action. |
| **Contrast effect** | ❌ **Reject** | Anchoring a man's cash decisions is manipulation |

## ✅ Smart defaults — the strongest fit

Already the project's stated strategy: every assumption ships with a
default and is editable on screen. Daniel adjusts rather than creates.

Apply to:
- **Parameters** — every one pre-filled from `current-issues.md`
- **Daily capture** — pre-fill feed quantity from the standard curve for
  today's day number. The worker confirms or corrects. That alone could
  halve capture time.
- **Batch setup** — draw schedule, harvest window and feed phases
  computed the moment a placement date and bird count are entered.

**The honesty requirement:** a default is a recommendation, and users
trust it as one. So every default carries its confidence badge. A
`measured` default and an `assumed` one must not look identical.

## ⚠️ Goal gradient — real progress only

A batch genuinely has a gradient: day 1 → 30. Show it. "Day 24 of 30 ·
6 days to harvest window" creates real momentum toward a real event.

**Reject the artificial head start.** Showing 20% when the true value is
0% is falsifying data in a system whose entire value is that its numbers
are true. One discovered fake number destroys trust in every real one.

The legitimate version: **setup checklists** may show completed steps.
"3 of 7 configured" where three genuinely are.

## ✅ IKEA effect — already designed in

The scenario sliders are this principle, honestly implemented. Daniel
drags mortality from 5% to 8% and watches the recommendation move. He
has now *built* his own understanding rather than been handed a verdict.

Strengthen it: when he adjusts a parameter, **persist it as his**, and
show that it is his — `set by you` versus `default`. Ownership comes
from the trace of his own decisions.

This is also the answer to CR-4 in `current-issues.md` — the risk that
he ignores the recommendation. A number he helped shape is one he will
act on.

## ⚠️ Loss aversion — a real distinction

There is a legitimate version and a manipulative one, and they look
similar.

**Legitimate — reporting a computed fact:**
> "Holding the bulk birds past day 30 costs $537 per day in feed and
> mortality. The contract price is flat, so there is no revenue upside."

That is arithmetic. It happens to be a loss frame because *the loss is
the finding*.

**Manipulative — framing to drive action:**
> "⚠️ You're losing $537 every day you wait! Act now."
> A dismissal button reading "I'll risk it."

The second manufactures urgency around someone's livelihood. **Never
do this.** No countdown timers, no alarm styling on routine
information, no guilt-loaded dismissal copy.

**Rule: state the number and its basis. Let him decide.** Severity
styling is reserved for genuine thresholds — a reserve breach, a
facility limit — not for nudging.

## ❌ Contrast effect — rejected

Anchoring is showing an expensive option first so the next feels
reasonable. Applied here it would mean ordering the three strategies so
the one we prefer looks best by comparison.

**That is manipulating a man's decision about his own money.** The three
strategies are presented neutrally, in a fixed order, with identical
formatting. No visual hierarchy implying a preferred answer. No
"recommended" badge unless the engine's own criteria produced it and the
reasoning is shown.

Honest comparison is not anchoring: showing all three side by side with
the same numbers is exactly what a good advisor does. The manipulation
is in the *ordering and emphasis*, so we hold both constant.

## ❌ Reciprocity — not applicable

There is no signup funnel. Revisit only for a future marketing site.

---

## The principle underneath all of this

The consumer-SaaS versions of these principles optimise for a
**conversion**. This product optimises for a **correct decision** by
someone whose livelihood depends on it.

Where a principle makes the true thing easier to see and act on — smart
defaults, real progress, ownership through adjustment — adopt it. Where
it makes a chosen action more likely regardless of truth — artificial
progress, manufactured urgency, anchored comparison — reject it.

**The test:** if Daniel learned exactly how the interface was designed
to influence him, would he still trust it? If yes, it stays. If it only
works while hidden, it goes.
