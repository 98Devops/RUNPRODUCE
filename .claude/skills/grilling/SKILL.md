---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' or 'drill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding.
Map this as a design tree: every decision branches into the decisions
that hang off it.

Work the tree in rounds. The frontier is every decision whose
prerequisites are already settled: the questions you can ask now
without guessing at answers you haven't heard yet. Ask the whole
frontier in one round: number each question and give your recommended
answer. Then wait for the user's answers before the next round.

Format a round like so:

❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

Each round the user answers reshapes the tree: settled decisions push
the frontier outward and unblock questions that depended on them.
Recompute the frontier and ask the next round. A question whose answer
depends on another question still open in this round belongs to a later
round, not this one.

Finding facts is your job, never the user's. When a frontier question
needs a fact from the environment (filesystem, tools, etc.), dispatch a
sub-agent to find it; don't ask the user for anything you could look up
yourself. Don't block on it: a running exploration is an unsettled
prerequisite, so only the questions downstream of it wait for the
sub-agent to report; ask the rest of the frontier now. The decisions
are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the
design tree visited, nothing left silently assumed. Do not act on it
until the user confirms you have reached a shared understanding.

## RunProduce project notes

Before grilling on this project, read `context/CONTEXT.md` for the
shared vocabulary and `context/current-issues.md` for what is already
known to be unresolved.

- **Use the domain language.** Say "draw", "gate sale", "livability",
  "cashflow days" — not "purchase order", "retail sale", "survival
  rate". The glossary is in `context/CONTEXT.md`.
- **Never grill the user for a number the client owns.** Questions
  about mortality rates, abattoir fees or contract terms belong to
  Daniel, not to Tafara. If a question needs one of those, note it as
  blocked against the relevant `OQ-` entry and move on.
- **Do not re-litigate settled decisions.** Anything recorded as an
  `AD-` in `progress-tracker.md` is settled. Raise it only if new
  information genuinely invalidates it, and say what that information
  is.
- Outcomes of a grilling session are written back: new decisions become
  `AD-` entries in `progress-tracker.md`, new unknowns become `OQ-`
  entries in `current-issues.md`, and new vocabulary goes in
  `context/CONTEXT.md`.
