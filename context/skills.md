# Skills

Five vendored skills plus one plugin. Each owns one phase. Nothing
overlaps.

## MCP servers

| Server | Scope | Used for |
|---|---|---|
| **playwright** | project (`.mcp.json`) | Three jobs: E2E journeys (U9–U11); harvesting UI reference patterns from proven dashboards (`ui-reference-playbook.md`); and giving `web-design-guidelines` a live browser to screenshot and compare against, rather than reading code alone |

Install once, from a plain terminal — **not** inside an interactive
`claude` session:

```bash
claude mcp add playwright --scope project -- npx @playwright/mcp@latest
```

`--scope project` writes the server definition to `.mcp.json` at the
repo root. **Commit `.mcp.json`** so the server is available to anyone
who opens this project, not just this machine.

## Install impeccable

```bash
# Plain terminal — same as claude mcp add, NOT inside a session
npx impeccable install
```

Then, inside an interactive `claude` session:

```
/impeccable init
```

**Before running `init`, point it at what already exists** so it does
not invent answers you have already settled:

> Read context/project-overview.md and context/ui-context.md before
> asking anything. Audience, purpose, operating context, and voice are
> already decided there — only ask about genuine gaps.

`init` writes `PRODUCT.md` and, once a visual system exists, `DESIGN.md`
— both at the repo root, alongside `CLAUDE.md`.

**Precedence, stated once so it never has to be re-litigated:**
`context/ui-context.md` §0 is the fixed project policy and always wins
over anything `DESIGN.md` proposes. `context/project-overview.md` is
authoritative on scope and goals; `PRODUCT.md` should restate them, not
compete with them. If `init` proposes something that contradicts either
file, correct it during the interview rather than accepting it and
reconciling later.

## Repo setup — fix this first

Two paths are wrong in the current repo. Both fail silently, which is
the worst kind of wrong.

```bash
# 1. CLAUDE.md must sit at the repo root, not inside context/.
#    Claude Code only auto-loads it from the root.
mv context/CLAUDE.md ./CLAUDE.md

# 2. Skills are discovered at .claude/skills/, not skills/.
mkdir -p .claude
mv skills .claude/skills

# 3. Install superpowers — it is a PLUGIN, not a skill folder.
#    It will never appear under .claude/skills/. Run inside a session.
/plugin install superpowers@claude-plugins-official

# 4. Install the Playwright MCP server — a PLAIN TERMINAL command,
#    run OUTSIDE any interactive session, the opposite of /plugin.
claude mcp add playwright --scope project -- npx @playwright/mcp@latest

# 5. Install impeccable — plain terminal, from the project root.
npx impeccable install

# 6. Then INSIDE a claude session, seed it from the context pack:
/impeccable init
```

### Running `/impeccable init` — do not answer from scratch

`init` asks for durable product truth: audience, purpose, operating
context, constraints, voice. **You already have all of it.** Point it at
the context pack instead of retyping it:

> Run `/impeccable init`. Answer its questions from
> `context/project-overview.md`, `context/CONTEXT.md` and
> `context/ui-context.md` — particularly §0 (the design dials and the
> reasoning behind them) and the operating context: a farm worker
> outdoors in Zimbabwean sunlight on a low-end Android, and an owner
> making financial decisions from dense tables. Two surfaces with
> opposite density needs. Only ask me about genuine gaps.

`init` writes `PRODUCT.md` and later `DESIGN.md` at the repo root.

**Source of truth after init:**

| File | Authoritative for |
|---|---|
| `DESIGN.md` | Token *values* — colours, spacing, type scale, radii. impeccable's commands read and write this. |
| `context/ui-context.md` | The *reasoning* and the project constraints §0 encodes — why light-only, why low motion, why two densities, the reference-pattern process |

If they conflict on a value, `DESIGN.md` wins. If a change to
`DESIGN.md` contradicts §0's *intent*, stop — that is a real design
decision, and it goes in `progress-tracker.md` as an `AD-`.

## Confirm everything at once

Two checks, because plugins/skills and MCP servers are verified from
different places.

**From a plain terminal:**
```bash
claude mcp list          # playwright should be listed and connected
cat .mcp.json            # should show the playwright server entry
ls .claude/skills         # 4 folders: grill-me, grilling, orient,
                          # web-design-guidelines
ls PRODUCT.md DESIGN.md   # written by /impeccable init
```

**Inside an interactive `claude` session:**
```
/plugin      # superpowers — listed, enabled
/mcp         # playwright — listed, connected
/orient      # reads context files, reports phase/unit/fixtures/blockers
```

All three passing inside the session is the real confirmation — it
proves the plugin, the skills, and the MCP server are all reachable
from the same place the agent actually works.

Correct final layout:

```
RUNPRODUCE/
├── CLAUDE.md                    ← root. Auto-loaded every session.
├── PRODUCT.md                   ← written by /impeccable init
├── DESIGN.md                    ← token values, maintained by impeccable
├── .mcp.json                    ← playwright server. Commit this.
├── netlify.toml
├── context/
│   ├── CONTEXT.md               ← shared language
│   ├── project-overview.md
│   ├── architecture.md
│   ├── ui-context.md
│   ├── code-standards.md
│   ├── ai-workflow-rules.md
│   ├── progress-tracker.md
│   ├── current-issues.md
│   ├── skills.md                ← this file
│   └── breed_curve.json         ← seed data, protected
├── .claude/
│   └── skills/
│       ├── orient/
│       ├── grill-me/
│       ├── grilling/
│       └── web-design-guidelines/
├── packages/engine/
└── apps/web/
```

---

## The set

| Skill | Type | Owns | Invoked |
|---|---|---|---|
| **orient** | vendored | Session entry — read context, verify state, report | `/orient`, or start of any session |
| **grill-me** | vendored | Resolving unknowns before they get built on | `/grill-me` |
| **grilling** | vendored | The interview primitive `grill-me` calls | automatic |
| **superpowers** | plugin | Spec → plan → red/green TDD → build | automatic, every unit |
| **impeccable** | npx-installed | UI craft AND UI audit — the whole design lane | UI units only |

Keep `grilling` even though you never type it — `grill-me` is a
two-line shim that calls it. Delete it and `grill-me` breaks.

### Retired from the active loop

`web-design-guidelines` is still
installed under `.claude/skills/` but are **not invoked**. Both
overlapped with `impeccable` on the same ground — the same AI-slop
tells (Inter, purple gradients, cards-in-cards, the rounded-icon-tile
heading), the same audit-and-iterate loop. Running three tools that
disagree about the same territory is worse than running one.

What survived the retirement, folded permanently into other files so
nothing was lost:

- The dial system (`VARIANCE 3, MOTION 2, DENSITY 7/2`) — was already
  living in `ui-context.md` §0, which was always the actual authority.
  impeccable is constrained by `ui-context.md` §0.
- The durable architecture rules (dependency verification before
  importing, Server/Client component isolation, `min-h-[100dvh]`, grid
  over flex-percentage math) — now in `code-standards.md`, so they are
  project convention rather than dependent on a skill staying invoked.
- The audit function — `impeccable`'s 61 deterministic rules plus live
  browser iteration is a strict superset of what
  `web-design-guidelines` did by fetching and checking against a static
  guideline document.

**Also not installed:** `to-spec`, `implement`, `tdd`, `code-review`,
`to-questionnaire`, `domain-modeling` — same reasoning as before, kept
as habits rather than skills competing for context.

---

## The loop

```
/orient                    where are we, what's next
   ↓
/grill-me                  only when the unit rests on an assumption
   ↓
superpowers                spec (in chunks) → plan → "go" → build with TDD
   ↓
impeccable + audits       UI units only
   ↓
update tracker + issues
```

## `orient` — start here, every session

Reads `CLAUDE.md`, `CONTEXT.md`, the tracker and open issues, then
verifies actual state against the tracker — **reality wins over the
tracker** — and reports six lines: phase, unit, fixtures passing, build
status, blockers, next action. Then stops and waits.

Cheap, and it prevents the most expensive failure mode: an agent that
starts writing code without knowing what already exists.

Its red-flags section catches the invariant breaks that type checking
misses — an engine file importing from `next` or using `Date.now()`,
money stored as `number` instead of `bigint` cents, a hardcoded flock
size, or a stray `vercel.json`.

## `grill-me` — before you build on an assumption

**This is the one to run before U5.**

`current-issues.md` holds four open questions. Two block correctness.
They exist because assumptions were made that have not been tested
against the client's reality.

Highest-value targets, in order:

1. **OQ-1 — the mortality model.** The ramp
   (`0.15%/day, +0.35%/day after day 30`) was reverse-engineered from a
   single sentence the client said. It drives the harvest optimiser and
   `MaxSafeBatchSize`. Grill it: is "100 a day" a count or a rate? At
   what flock size was it seen? What happened in the last three batches?
2. **OQ-3 — the objective function.** Three stated goals conflict.
   Until it resolves, the system ships three strategies rather than one
   recommendation (AD-4).
3. **OQ-4 — gate pricing basis.** Per-bird or per-kg shifts the gate
   harvest window by six days.

**Grill before writing the optimiser, not after.** A well-built
optimiser fed a wrong mortality curve is still wrong, and it will look
authoritative while being wrong — which is worse than having no
optimiser at all.

`grill-me` also works as a rehearsal for the client conversation. Let
it interview you as though you were Daniel; wherever you cannot answer,
that is a real question to send him.

## `superpowers` — the build loop

Owns spec → plan → build for every unit, and enforces red/green TDD,
YAGNI and DRY. Full detail in `ai-workflow-rules.md`.

The parts that matter most here:

- **Spec in readable chunks**, signed off a piece at a time. Not a wall
  of specification with blanket approval.
- **A plan written for an enthusiastic junior engineer** with no
  context and an aversion to testing. Every step names its file, its
  test, its verification.
- **Failing test first, always.** A test that passes on its first run
  was not testing anything.
- **Execution only on "go."** Long autonomous runs are fine provided
  the plan is not deviated from. If the plan turns out wrong, stop and
  revise the plan — do not improvise around it.

## `impeccable` — the whole UI lane

One skill, both jobs: craft and audit.

**Craft.** Use its commands against the dials already fixed in
`ui-context.md` §0 — `VARIANCE 3, MOTION 2, DENSITY 7 (console) / 2
(capture)`. This is a financial ledger replacing a spreadsheet the
owner trusts, used outdoors on a low-end Android, not a SaaS marketing
site. `quieter` and `distill` will be reached for far more often than
`bolder` or `animate` on this project. No Framer Motion, no GSAP, no
ThreeJS — CSS transitions only, and sparingly (AD-11).

**Audit.** Run its deterministic rule check plus live browser critique
against every UI unit before marking it done — pair with Playwright MCP
so it audits the actual running page, not just the source. Fix
findings, or log an explicit exception with a reason in
`current-issues.md`.

**Also use it for the reference-pattern work** in
`ui-reference-playbook.md` — after harvesting patterns from Mercury,
Ramp and Linear via Playwright, use `impeccable`'s `critique` and
`distill` commands to turn raw observations into applied tokens, rather
than eyeballing it.

**Do not invoke during engine units U1–U6.** There is no UI there and
it burns context you need.

---

## Skills by unit

| Unit | Skills |
|---|---|
| Every session start | `orient` |
| U1–U4 (engine) | `superpowers` |
| **U5 (allocation)** | **`grill-me` first**, then `superpowers` |
| U6 (data layer) | `superpowers` |
| Before U7 | `/impeccable init` once, then the reference harvest — `ui-build-playbook.md` Phase A |
| U7–U11 (UI) | `superpowers`, `impeccable` (audit / polish / quieter / typeset), `web-design-guidelines`. Design directions explored via git worktrees — `ui-build-playbook.md` Phase B |
