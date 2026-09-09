# UI Context

## 0. Design constraints — READ FIRST

This project uses **`impeccable`** for visual craft. Token *values* live
in `DESIGN.md` at the repo root, written and maintained by impeccable's
commands. **This section owns the reasoning and the constraints** — the
things that must survive every polish pass.

Feed these into `/impeccable init` so they land in `PRODUCT.md` and get
enforced rather than fought.

The three dials below are the shorthand for this project's intent. They
sit far from where a design tool defaults, and deliberately so.

| Dial | Typical default | **This project** | Why |
|---|---|---|---|
| `DESIGN_VARIANCE` | 8 | **3** | This is a financial ledger replacing a spreadsheet the owner already trusts. Asymmetric, artsy layouts read as unserious and make figures harder to scan. Predictable alignment is the point. |
| `MOTION_INTENSITY` | 6 | **2** | The capture screen runs on a low-end Android in rural Zimbabwe on poor connectivity. Perpetual animations, magnetic buttons and spring physics burn battery and drop frames on that hardware. Hover and active states only. |
| `VISUAL_DENSITY` | 4 | **7 (console) / 2 (capture)** | Two different surfaces. The decision console is cockpit-mode — packed, tabular, mono figures. The daily capture screen is the opposite — three huge inputs, nothing else. |

### What this means concretely

**Do not apply**, however tempting:
- Perpetual/infinite micro-animations, "breathing" indicators, Bento
  motion paradigms
- Magnetic buttons, liquid glass refraction, parallax tilt, scroll
  hijacking, kinetic typography
- Framer Motion, GSAP, or ThreeJS. **This project has no animation
  library.** CSS transitions only, and sparingly.
- Asymmetric hero layouts and negative-space compositions
- `rounded-[2.5rem]` containers and diffusion shadows

**Do apply**, and enforce strictly (impeccable's detectors cover most
of these automatically):
- **Anti-emoji policy** — banned in code, markup, content, alt text
- **The Lila ban** — no AI purple/blue, no neon, no gradient glows
- **No pure `#000000`**
- Max one accent colour, saturation under 80%
- **No `Inter`.** Geist Sans + Geist Mono, as specified below
- **Serif fonts are banned** — this is a dashboard
- **No 3-equal-card feature rows**
- Mono font for all numbers (skill's own cockpit-mode rule)
- Cards only where elevation carries meaning; otherwise `divide-y`,
  `border-t`, and space
- Grid over flex percentage math
- `min-h-[100dvh]`, never `h-screen`
- Full interaction cycles — loading skeletons, empty states, inline
  errors, `:active` tactile feedback
- Labels above inputs, helper text in markup, errors below
- Dependency verification before importing anything
- **No fake data** — no `John Doe`, no `99.99%`, no `Acme`. Seed data
  uses the client's real figures, which are already organic
- `https://picsum.photos/seed/{seed}/w/h` if a placeholder image is
  ever needed. Never Unsplash.
- shadcn components must be customised, never shipped default

### impeccable commands and this section

`/impeccable quieter` is aligned with this project and you will use it
often. `/impeccable bolder` and `/impeccable animate` fight §0 — this is
a sober ledger at `MOTION 2` with no animation library (AD-11). Reaching
for them usually means solving the wrong problem.

If `DESIGN.md` and this section conflict on a **value**, `DESIGN.md`
wins. If a change contradicts the **intent** above, stop and record it
as an `AD-` in `progress-tracker.md`.

### Reference patterns

Design references are harvested from proven financial dashboards
(Mercury, Ramp, Linear) using Playwright MCP, distilled into patterns,
and recorded in this file as **§11 Reference patterns** before any UI
is built. Process: `context/ui-build-playbook.md`.

**CoinMarketCap-style crypto dashboards are not a reference for this
project.** They run at roughly `VARIANCE 7, MOTION 7` and are built for
browsing engagement. This is a sober decision tool. Cloning that
aesthetic fights §0 on every screen.

Where a harvested pattern contradicts §0 or the tokens below, **§0
wins** — or amend §0 deliberately and record it as an `AD-` in
`progress-tracker.md`. Never drift silently.

### Audit gates — two, on different axes

| Gate | Asks | Run |
|---|---|---|
| `/impeccable audit` | Does it look considered? Tokens, spacing, type, radii. Deterministic — no LLM, run freely. | Continuously while building |
| `web-design-guidelines` | Does it work for everyone? Contrast, keyboard, touch targets, semantics. | Before marking any UI unit done |

Both must pass. Fix findings, or log an explicit exception with a
reason in `current-issues.md`.

---

## Theme

**Light mode only. No dark mode.**

This is a deliberate decision, not a default. The daily capture screen
is used outdoors in Zimbabwean sunlight on a cheap Android phone. Dark
interfaces are unreadable in direct sun. High-contrast light with large
type wins.

The design language is a **clean agricultural instrument panel** —
white surfaces, strong borders, generous spacing, and numbers that
dominate. It should feel closer to a well-made ledger than a SaaS
dashboard. The client is migrating from a spreadsheet he trusts;
familiarity beats novelty.

Two visual modes:
- **Capture screens** — huge touch targets, minimal chrome, one column
- **Decision screens** — dense, tabular, information-rich

## Colors

All components use these tokens. No hardcoded hex.

| Role | CSS Variable | Value |
|---|---|---|
| Page background | `--bg-base` | `#F7F7F5` |
| Surface | `--bg-surface` | `#FFFFFF` |
| Raised surface | `--bg-raised` | `#FAFAF8` |
| Primary text | `--text-primary` | `#1A1A17` |
| Muted text | `--text-muted` | `#6B6B63` |
| Primary accent | `--accent-primary` | `#0F6B3F` |
| Accent hover | `--accent-hover` | `#0B5230` |
| Border | `--border-default` | `#DFDFD8` |
| Border strong | `--border-strong` | `#B8B8AE` |
| Error | `--state-error` | `#B42318` |
| Warning | `--state-warning` | `#B54708` |
| Success | `--state-success` | `#0F6B3F` |
| Cash in | `--flow-in` | `#0F6B3F` |
| Cash out | `--flow-out` | `#B42318` |
| Receivable | `--flow-pending` | `#B54708` |

### Semantic colour rules
- **Cash in is green, cash out is red, money owed to you is amber.**
  Never use these three colours decoratively anywhere else.
- Confidence badges: `measured` = green, `calibrated` = amber,
  `assumed` = grey with a dashed border.
- A projected value is always visually distinct from a recorded one.
  Projections use muted text and a dashed underline.

## Typography

| Role | Font | Variable |
|---|---|---|
| UI text | Geist Sans | `--font-sans` |
| All numbers | Geist Mono | `--font-mono` |

**Every number renders in mono with tabular figures.** Financial
columns must align. Use `font-variant-numeric: tabular-nums`.

Scale:
| Use | Size |
|---|---|
| Hero metric (cash today, birds alive) | `text-4xl` |
| Section heading | `text-lg font-medium` |
| Body | `text-sm` |
| Table cell | `text-sm font-mono` |
| Label / caption | `text-xs text-muted` |

Capture screen inputs are `text-2xl` minimum — thumbs, not cursors.

## Border radius

| Context | Class |
|---|---|
| Inline / badges / inputs | `rounded-md` |
| Cards / panels / tables | `rounded-lg` |
| Modals / overlays | `rounded-xl` |

## Component library

shadcn/ui on Tailwind. Components live in `components/ui/`. Add via the
CLI rather than writing from scratch. **Do not hand-edit generated
files** — wrap them instead.

Core components used: Card, Table, Button, Input, Select, Dialog,
Popover, Badge, Tabs, Slider, Alert.

## Layout patterns

- **Capture screen** — single column, max-width 480px, centred. Three
  large inputs, one large submit button. No navigation chrome beyond a
  back arrow. Must be completable one-handed.
- **Decision console** — full width. Hero metric row across the top,
  then a two-column split: recommendation card on the left, cash
  calendar on the right. Ledgers below in tabs.
- **Ledgers** — dense tables. Sticky header. Right-aligned numeric
  columns. Row click opens a detail popover.
- **Scenario panel** — right sidebar, fixed width, sliders stacked.
  Values update live as the slider moves.
- **Modals** — centred overlay, backdrop blur.

## The explainability pattern

Every displayed business number is wrapped:

```tsx
<Explained value={...}>
  $11,504
</Explained>
```

Renders as the number with a subtle dotted underline. On click, a
popover shows:
- The formula in plain words
- Each input with its value and where it came from
- A confidence badge

This pattern is the single most important UI element in the product. It
is what converts a number the owner distrusts into one he acts on.

## Number formatting rules

- Money: `$11,504` — no cents in summary views, cents in ledgers
- Bird counts: `2,675` — always thousands-separated, never abbreviated
- Weights: `1,754 g` under 1 kg thresholds, `1.75 kg` above
- Dates: `Day 30 · 8 Mar` — always show both cycle day and calendar date
- Never show more precision than the input justifies. If the weight
  came from a 20-bird sample, do not print four significant figures.

## Icons

Lucide React. Stroke-based only. `h-4 w-4` inline, `h-5 w-5` in
buttons. Use sparingly — this is a numbers interface, not an icon
gallery.

## What to avoid

- Dark backgrounds
- Decorative gradients, glassmorphism, animated charts
- Abbreviated numbers (`2.7k` instead of `2,675`)
- Charts where a table would be clearer. Only two charts exist: the
  cash calendar and the weight curve.
- Emoji in the product UI

---

## 11. Reference patterns

*Empty until the harvest in `ui-reference-playbook.md` Step 2 is run.*

Record each finding as:

**Pattern** — what it is
**Source** — which reference, which view
**Applies to** — which RunProduce screen
**Why it fits us** — in terms of our problem, not "they do it"

A pattern with no answer to the last line does not go in this file.

---

## 12. Card system

Full spec: `context/card-system-and-decision-ux.md`.

Three variants: `MetricCard` (four-across hero row), `DecisionCard`
(recommendation with inset sub-rows), `CaptureCard` (density 2, three
fields).

Non-negotiables:
- **White surface, no fill colour.** Colour appears only in delta chips
  and only where it carries meaning. Never a saturated card background.
- Every metric carries a comparison line. A number with nothing to
  compare against is a fact, not a metric.
- Values are mono with `tabular-nums`, always.
- No decorative SVG. Decoration that carries no information does not
  ship.

When importing any third-party component, strip before use: bundled
`:root`/`.dark` blocks, Inter, keyframe libraries (`tw-animate-css`,
border-beam, marquee, shimmer), saturated multi-accent palettes, and any
purple. `DESIGN.md` owns tokens; the component contributes structure
only.

## 13. Decision UX — what we will not do

`card-system-and-decision-ux.md` Part 2 covers the UX psychology
principles in full. The rejections matter most:

- **No artificial progress.** Real gradients only. Falsifying a number
  in a system whose value is that its numbers are true destroys trust in
  all of them.
- **No manufactured urgency.** Report the computed cost of delay;
  never style it as an alarm or write guilt-loaded dismissal copy.
- **No anchoring.** The three strategies are presented in fixed order
  with identical formatting and no visual hierarchy implying a
  preferred answer.

The test for any persuasive pattern: **if the user learned exactly how
the interface was designed to influence him, would he still trust it?**
If it only works while hidden, it does not ship.
