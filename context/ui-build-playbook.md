# UI Build Playbook
### Clone proven architecture → four parallel variations → polish → ship

This is the UI half of the build (U7–U11). The engine half is
`ai-workflow-rules.md`.

---

## Phase A — Harvest the reference

### A1. Pick references that solved *your* problem

The method is sound; the reference in the source video is not, for this
project. CoinMarketCap is a dark, decorative, real-time browse
experience running at roughly `VARIANCE 7, MOTION 7`. RunProduce is a
light, sober decision tool at `VARIANCE 3, MOTION 2`, used outdoors on
a cheap Android. Clone the wrong reference and you fight §0 on every
screen.

**Clone from the same problem domain, not the same visual excitement.**

| Reference | Steal | For which screen |
|---|---|---|
| **Mercury** | Cash-over-time visualisation, dated balance projection, receivables, restrained light palette | Cash calendar |
| **Ramp** | Dense expense tables, obligation timelines, status treatment | Feed liability |
| **Linear** | Density without clutter, list craft, restraint (steal structure, not the dark theme) | All ledger tables |
| **Stripe Dashboard** | Money and date typesetting, tabular numerals, balance vs pending | Every numeric column |
| **Xero / QuickBooks** | Ledger conventions a business owner already recognises | Batch P&L |
| **Splitwise / Monzo entry flows** | Three fields, one action, no chrome, one-handed | **Daily capture — a different product entirely** |

Add your own finds. Three to five references total. More produces mush.

**Do not let console density leak into the capture screen.** They are
two products sharing a codebase.

### A2. The clone prompt

This replaces the video's `deep research` step. You don't have that
skill — you have Playwright MCP, which is better, because you look at
the live thing instead of reading about it.

Paste into a Claude Code session, filling the two bracketed lines:

```
I want to clone the UI architecture of [TARGET APP URL]
and specifically [URL OF THE DETAIL/DASHBOARD VIEW].

My project context is already written and authoritative — read it
first, in this order:
  CLAUDE.md
  context/project-overview.md   (what we build, flows, scope)
  context/CONTEXT.md            (shared vocabulary — use these terms)
  context/ui-context.md         (§0 constraints govern everything)
  PRODUCT.md and DESIGN.md      (impeccable design truth)

Use the Playwright MCP to open both URLs. Take full-page screenshots
at 1440px and 390px and save them to context/screenshots/ as
reference-<source>-<view>-<width>.png

Then analyse the screenshots and DOM and report:
  - the spacing scale actually in use (gaps, padding, vertical rhythm)
  - the type scale and weights, and how numbers are treated
    differently from labels
  - how rows are separated: borders, dividers, bands, or space alone
  - how money-in vs money-out vs pending are signalled
  - table column ordering and alignment conventions
  - date formatting and placement
  - which open-source UI libraries or component patterns are in use
  - what they deliberately do NOT do

Then reconstruct that layout architecture to fit MY requirements —
the RunProduce decision console and ledgers described in
project-overview.md — keeping the proven information architecture but
applying our own tokens, vocabulary and constraints.

Hard constraints:
  - ui-context.md §0 governs. VARIANCE 3, MOTION 2, DENSITY 7 console
    / 2 capture. Light mode only.
  - No animation library. No Framer Motion, GSAP or ThreeJS (AD-11).
  - Extract patterns and conventions ONLY. Do not copy source code,
    class-name systems, brand assets, icons, imagery or copy.
  - Use our terms from CONTEXT.md — batch, draw, gate sale, bulk sale,
    livability. Never the reference app's vocabulary.

Record the findings in context/ui-context.md under §11 Reference
patterns. Each entry: Pattern / Source / Applies to / Why it fits us.
An entry with no answer to the last line does not go in the file.
```

### A3. The line not to cross

Extracting patterns, spacing rhythm, information hierarchy and
interaction models is ordinary design practice. Copying source code,
class-name systems, brand assets, icons, imagery or marketing copy is
not — and it produces a worse product, because you inherit decisions
made for someone else's constraints.

**Test:** can you justify each pattern in terms of RunProduce's own
problem? If the only reason is "Mercury does it," you copied rather
than learned.

---

## Phase B — Four variations in parallel with git worktrees

The strongest idea in the source video. Worktrees let the agent build
four full design directions simultaneously in separate folders, each on
its own port, with zero branch conflicts.

### B1. Create the worktrees

From the repo root, once the console works and is committed:

```bash
git worktree add ../RunProduce-v1-tokens   -b design/v1-tokens
git worktree add ../RunProduce-v2-type     -b design/v2-type
git worktree add ../RunProduce-v3-structure -b design/v3-structure
git worktree add ../RunProduce-v4-wild     -b design/v4-wild
```

Each is a full working copy sharing one git history. `context/`,
`PRODUCT.md` and `DESIGN.md` come along automatically — so every
variation inherits §0 and the glossary.

### B2. Install and run each on its own port

```bash
cd ../RunProduce-v1-tokens   && npm install && npm run dev -- -p 3001
cd ../RunProduce-v2-type     && npm install && npm run dev -- -p 3002
cd ../RunProduce-v3-structure && npm install && npm run dev -- -p 3003
cd ../RunProduce-v4-wild     && npm install && npm run dev -- -p 3004
```

Four tabs, same data, four directions, side by side.

### B3. The four briefs

| Variation | Scope | Prompt |
|---|---|---|
| **v1 — Small** | Colour and theme tokens only | "Adjust only the token values in `DESIGN.md` — palette, surface layering, border weight, accent. Change nothing structural. Run `/impeccable polish` then `/impeccable quieter`." |
| **v2 — Medium** | Typography and table layout | "Keep the structure. Rework the type scale, weights, numeric treatment, and table density, alignment and row separation. Run `/impeccable typeset`." |
| **v3 — Large** | Interface structure | "Redesign the decision console's information architecture — panel arrangement, what leads, how the recommendation relates to the cash calendar. §0 still governs." |
| **v4 — Surprise me** | Open | "Reinterpret the console freely, subject only to §0 and the accessibility gate. Show me something I would not have asked for. Justify each departure against `PRODUCT.md`." |

**v4 is the one that earns its keep.** v1–v3 are variations on your
existing taste; v4 is the only one that can surprise you. Give it real
freedom within the hard constraints.

### B4. Judge them properly

Run both gates in every worktree before comparing:

```
/impeccable audit          # craft
web-design-guidelines      # accessibility
```

Then judge on the product, not the prettiness:

- Can Daniel find the recommendation in under five seconds?
- Do the numbers align down every column?
- Is it readable in direct sunlight at 390px?
- Does the capture screen still take under 60 seconds?
- Does anything violate §0?

### B5. Merge the winner, delete the rest

```bash
cd ~/RunProduce
git merge design/v3-structure          # whichever won

git worktree remove ../RunProduce-v1-tokens
git worktree remove ../RunProduce-v2-type
git worktree remove ../RunProduce-v4-wild
git branch -D design/v1-tokens design/v2-type design/v4-wild
```

Fold anything worth keeping from the losers into `DESIGN.md` first —
often one variation has a better table treatment even if its structure
lost.

---

## Phase C — Final polish

```
/impeccable audit           # find hardcoded values that escaped tokens
/impeccable quieter         # the command this project needs most
/impeccable critique        # before showing Daniel anything
```

Specifically hunt for:
- Hardcoded hex that should be a token
- Any residual purple, gradient, or shadcn default styling
- Numbers not rendering in mono with tabular figures
- Missing loading, empty and error states
- Touch targets under 44px on the capture screen

Then re-run `web-design-guidelines` and fix or log exceptions.

---

## What we are NOT adopting, and why

The source video's final act — Hicksfield/Cense scroll animations,
frame analysis, generated MP4 assets, an `animate-website` skill,
Apple-style scroll-driven storytelling — **does not apply here.**

That is marketing-site craft for a consumer product that must seduce a
visitor. RunProduce is an internal decision tool. Its user is a farm
owner checking whether he can afford chicks, and a worker entering
mortality counts with dust on his hands, outdoors, on a low-end
Android, on poor connectivity.

Scroll-driven video would burn battery, drop frames, cost bandwidth he
pays for, and slow the one flow that must never be slow. It contradicts
`MOTION 2` and AD-11 directly.

**If a marketing site for RunProduce is ever built, revisit this in
that repo.** It does not belong in the product.

Deployment is Netlify (AD-9), not Cloudflare — `netlify.toml`, scheduled
functions, `npm run build`.

---

## Mapping the video's method to this project

| His step | Ours |
|---|---|
| `/grill-me` to brain-dump into `spec.md`/`decisions.md` | **Already done, and better** — a ten-file context pack with glossary, invariants and golden fixtures. Save `/grill-me` for OQ-1 and OQ-3, which are real unknowns. |
| `deep research` to analyse the target UI | **Playwright MCP** — open the live app, screenshot it, inspect the DOM |
| Merge context + cloned structure | Phase A2 prompt, then superpowers spec → plan → go |
| `impeccable` to personalise | Phase B and C — plus four worktree variations, which he did later and we fold in earlier |
| Worktree variations | Phase B, unchanged. Strong idea, adopted whole. |
| Scroll animations | **Rejected.** See above. |
| Cloudflare deploy | Netlify (AD-9) |
