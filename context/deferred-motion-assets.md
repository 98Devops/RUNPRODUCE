# Deferred — Motion & Generated Assets

**Status: parked. Not part of the product build (U1–U11).**

Higgsfield is installed and authenticated. This file records why it is
deferred, where it legitimately fits, and the frame-analysis method, so
nothing is lost when the time comes.

---

## Why it is not in the product

`AD-16` rejects scroll-driven video in the RunProduce application. The
reasoning stands: the product is used outdoors, on a low-end Android, on
connectivity the user pays for, by a worker entering mortality counts
and an owner deciding whether he can afford chicks. `MOTION 2`, no
animation library (AD-11).

**That is a judgement about the product, not about the tool.**

## Where it legitimately fits

Three real uses, all outside the app:

### 1. The marketing site — the strongest fit
When RunProduce is sold to other broiler SMEs, that site is a separate
repo with the opposite constraints: it exists to persuade a visitor,
runs on their terms, and can carry scroll-driven storytelling properly.
**Everything from the source video applies there and nowhere else.**

### 2. Client explainer video
A 60–90 second piece showing Daniel what the system does — the cash
calendar filling in, the harvest window narrowing, the recommendation
resolving. Genuinely useful for the handover conversation, and for
selling to the next farm.

### 3. Pitch and portfolio material
`higgsfield-video-explainer` and `higgsfield-websites` are well suited
to a case study of this build.

**None of these touch `apps/web`.**

## The frame-analysis method (captured for later)

Worth keeping — it is a good technique.

1. **Deconstruction** — break a reference video into individual frames
   and analyse what happens in each, extracting the motion logic rather
   than the content.
2. **Documentation** — write `frames.md` cataloguing each frame: what
   moves, timing, easing, what enters and leaves. A structural map of
   the animation.
3. **Contextual adaptation** — swap the subject for yours while keeping
   the timing and motion. For RunProduce that would be: birds growing
   along the weight curve, the cash calendar filling day by day, feed
   draws landing on their due dates, the harvest window closing.
4. **Generative prototyping** — generate character sheets or 2×3 sketch
   grids first to visualise the sequence. Far cheaper in credits than
   rendering full motion and discovering the timing is wrong.

Step 4 is the one that saves money. Do not skip it.

## When to un-defer

- The product is shipped and in use with a real batch, **and**
- A marketing site or explainer is actually being built

Not before. Generated video is the most seductive way to spend a week
producing something the client cannot use.

## Housekeeping note

The Higgsfield skills installed to `.agents/skills/` and are symlinked
for Claude Code. As the installer warned, **they run with full agent
permissions** — read them before first use, and note they are scoped to
this project directory.

They are not part of the U1–U11 skill set (`context/skills.md`) and
should not be invoked during the build. If they surface as slash
commands after a reload, ignore them until this file's un-defer
conditions are met.
