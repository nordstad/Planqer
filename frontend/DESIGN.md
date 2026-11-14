---
name: Planqer
description: The self-hosted README — a plain, warm open-source homepage with one amber signal, for a cutting-plan tool that proves itself with a real diagram.
colors:
  ground: "#fafaf7"
  ground-2: "#f2efe6"
  ground-3: "#e9e6da"
  card: "#ffffff"
  ink: "#16150f"
  ink-2: "#5c594c"
  ink-3: "#6f6a55"
  ink-4: "#d6d2c2"
  rule-hair: "#e9e6da"
  accent: "#a34f18"
  accent-ink: "#ffffff"
  accent-bg: "#fdf0e4"
  revision: "#cc2200"
  revision-bg: "#fdeeea"
  shop: "#16150f"
  field: "#fbfaf6"
  field-line: "#8a846f"
  night-ground: "#17150f"
  night-ground-2: "#201d15"
  night-ground-3: "#322d20"
  night-card: "#201d15"
  night-ink: "#ece7d8"
  night-ink-2: "#c7c2ae"
  night-ink-3: "#8f8b78"
  night-ink-4: "#4a4738"
  night-rule-hair: "#322d20"
  night-accent: "#e0813a"
  night-accent-ink: "#17150f"
  night-accent-bg: "#3a2413"
  night-revision: "#ff6b45"
  night-revision-bg: "#2e1410"
  night-field: "#14120d"
  night-field-line: "#8f8b78"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(56px, 7vw, 88px)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-.03em"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-.015em"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.005em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  data:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  label:
    fontFamily: "Archivo Narrow, Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: ".1em"
rounded:
  sm: "4px"
  DEFAULT: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  gutter: "40px"
components:
  button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "9px 16px"
    height: "38px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "9px 16px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "9px 16px"
    height: "38px"
  button-order:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.xl}"
    padding: "14px 18px"
    height: "50px"
    width: "100%"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
    width: "100%"
  input-focus:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
    padding: "22px"
  hp-card-icon:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
    size: "42px"
---

# Design System: Planqer

## Overview

**Creative North Star: "The Self-Hosted README"**

Planqer reads like a well-made open-source project's own homepage, not a printed
catalog and not a SaaS pitch deck. The whole product sits on warm, slightly
grey-cream paper with ink type, rounded cards, and exactly one signal color —
a warm amber-orange — reserved for the call to action, the one figure that
matters, and the active state. Where the previous system ("The Trade Catalog")
proved itself through print density — ruled tables, folio numbers, a die-cut
tab rail — this system proves itself through what the tools produce: the
homepage's hero is one illustration of the materials the tools plan — a
sheet, boards, tiles, and wallpaper laid out with their cuts — rather than
marketing copy.

This system was built by replacing the trade-catalog world outright, then
tuned twice more from direct user feedback: first to strip a "self-hosted
README" draft's own leftover code-block/badge-row habits down to one quiet
trust line, then to fix a mobile launcher that the diagram was crowding off
the first screen, then again through a structured critique that found real
accessibility regressions (two color pairs under WCAG AA) and removed the
last of the old catalog's reference-number vocabulary ("4.12A," "Fig. 4.12,"
"Section 4," the Help contents' "9.01–9.06") wherever it survived under the
new skin.

The day edition (paper) is the default; the night edition (the same system on
warm dark stock) re-picks its own ink, accent, and rule values rather than
inverting the day ones — `useDarkMode` starts at `false`. Every semantic role
is a CSS custom property in `frontend/src/index.css`, so both editions come
from one stylesheet.

**Key Characteristics:**

- Warm paper ground, ink type, rounded cards — nothing prints flat-square
  anymore; radius is a real part of the form language (4–20px, full for
  pills and the radio dot)
- One accent color, amber-orange, spent only on the CTA, the one meaningful
  figure, focus/active states, and `::selection` — never decorative
- Proof over claims: a real, fixed solver output stands in for marketing copy
- One top nav on every page — no secondary index, no trim-edge tab rail
- Catalog reference numbers (folio codes, section numbers) are gone; a
  numbered list is now just a plain index (`01`, `02`…), never a fake
  document citation

## Colors

A warm, restrained press: cream-to-white neutrals, ink type, one amber accent,
one red for correction.

### Primary

- **Signal Amber** (`{colors.accent}` `#a34f18`, night `#e0813a`): The one
  color that means "this is the action or the figure that matters." Fills
  primary and order buttons, the "Build" emphasis in the homepage headline,
  the blade that reveals the hero illustration, icon chips on the homepage
  cards,
  focus rings, `::selection`, and the current nav link's underline. Darkened
  from an earlier, brighter `#c1631f` after a contrast audit found white
  button text failed WCAG AA (4.1:1) against it; `#a34f18` clears 4.5:1+ with
  white text in both editions.
- **Press Ink** (`{colors.ink}` `#16150f`, night `#ece7d8`): All type, all
  rules. In the night edition ink becomes the near-white type color and the
  ground becomes near-black.

### Secondary

- **Revision Red** (`{colors.revision}` `#cc2200`, night `#ff6b45`): Kerf
  marks in every cut diagram, over-limit and delete affordances, the caret
  color on inputs, error borders and backgrounds. Deliberately a different
  hue register from the accent (red vs. amber) so the two are never
  confused at a glance — the two colors were picked closer together
  originally and were pulled apart during review.

### Neutral

- **Paper** (`{colors.ground}` `#fafaf7`): The page.
- **Plate Paper** (`{colors.ground-2}` `#f2efe6`): Input fill, plate fill,
  disabled surfaces.
- **Grey Board** (`{colors.ground-3}` `#e9e6da`): Disabled controls, the
  off state of the day/night switch.
- **Card** (`{colors.card}` `#ffffff`, night `#201d15`): The raised-surface
  color for cards, sheets, and plates — one step brighter than the page in
  both editions, so a card visibly separates from the ground behind it.
- **Secondary Ink** (`{colors.ink-2}` `#5c594c`): Running prose, captions.
- **Caption Ink** (`{colors.ink-3}` `#6f6a55`, night `#8f8b78`): Uppercase
  labels, muted captions, table headers. Darkened from `#8b8776` after the
  same contrast audit found it fell to 3.4–3.6:1 on paper and card — it now
  clears 4.5:1+ on both.
- **Hairline** (`{colors.rule-hair}` `#e9e6da`, night `#322d20`): The only
  border color in the system; used at 1–1.5px for every card, table row, and
  control outline.

### Named Rules

**The One Accent Rule.** Amber marks exactly one thing per surface: the
action, or the figure that leads to it. A screen with two amber elements
competing for attention is a screen where one of them is wrong.

**The Redder Than Amber Rule.** Revision red must read as unambiguously red
next to the accent's amber. If a proposed error color and the accent color
could be confused in a small icon or border, the error color is wrong, not
the rule.

## Typography

**Display / Body / Label Font:** Archivo, self-hosted via `@fontsource`
(weights 400–800), one family for everything sentence-case; **Archivo
Narrow** (600–700) for uppercase tracked labels only.

**Character:** A plain grotesque doing all the work — no second personality
for headings, no mono for data. The narrow cut exists only to make a small
uppercase label read as a label, not as a second brand voice.

### Hierarchy

- **Display** (`{typography.display}`): The boards-required figure on a
  result surface (`.answer-figure`) — the one number an optimizer page exists
  to produce. Not used on the homepage; the homepage's proof is the diagram
  itself, not a pulled-out statistic.
- **Headline** (`{typography.headline}`): The homepage's single H1
  (`.hp-h1`), 34px, dropping to 28px under 900px.
- **Title** (`{typography.title}`): Section titles (`.section-title`) and
  homepage card titles (`.hp-card h2` at 16.5px) — both sit directly under
  the page's one H1, so card titles are real `<h2>`s, never a skipped level.
- **Body** (`{typography.body}`): Base 14px at 1.45 line-height.
- **Data** (`{typography.data}`): Table figures, right-aligned, tabular.
- **Label** (`{typography.label}`): Archivo Narrow, uppercase, 11px,
  `.1em` tracking — job-block terms, form labels, table headers.

### Named Rules

**The Legible Floor Rule.** No functional or caption text renders below
11px, and running-prose-style captions (`.synthetic`, `.folio`) sit at 12px.
An earlier pass at 10–10.5px (inherited from the previous system's
density-as-trust-signal philosophy) failed a runtime accessibility scan and
was raised across the board; this floor is now load-bearing, not a
suggestion.

**The Narrow-Means-Label Rule.** Archivo Narrow appears only on genuinely
uppercase, tracked micro-labels (`.kicker`, `.form-label`, `.cat-table th`).
Quieter captions in sentence case (`.folio`, `.synthetic`) still use Archivo
Narrow's condensed width but are never forced uppercase — they read as an
aside, not a stamped label.

## Layout

A single centered column, `max-width: 1080px`, replacing the old two-column
catalog-plus-trim-edge frame entirely. Content padding is 24px at desk width,
16px on a phone (`.cat-body`).

The homepage's lead spread (`.hp-top`) is a named CSS Grid whose areas
**reorder by breakpoint**, not just reflow: desktop pairs the hero text with
the hero illustration side by side and puts the tool cards below both;
under 900px the areas become `text` → `cards` → `visual`, so the launcher
lands right after a short headline instead of being pushed off-screen by the
diagram. This reorder was added specifically because the first version buried
the cards below the fold on a phone.

Both optimizer pages (`CuttingOptimizer`, `SheetOptimizer`) are **stepped**, not
spread. The old three-column `.work-spread` pattern (parts | stock | answer,
cost and plan bands below) is gone: the work is a sequence — say what you need,
read the plan, keep it — so the page renders one step at a time under a
`.plan-steps` rail. `.step-view.is-form` holds steps 1 and 3 at a 620px form
measure; step 2 drops the cap so the diagram gets the full 1080px.

### Named Rules

**The One Step Rule.** An optimizer page draws the step in hand and nothing
else. Anything a step needs but most users never touch (prices, packing
strategy, the working limits) goes in a `.fold` disclosure whose one line says
what is inside and, when it is set, what it is set to. A second step's controls
appearing beside the current one is the pattern this system replaced.

**The Check-It-Before-You-Cut Rule.** A field the user has to *verify* against
the physical world is never folded away, however rarely they change it. Stock
lengths, sheet dimensions and kerf all stay in plain sight on the parts step:
what a yard actually sells changes between jobs, and a plan against lengths
nobody stocks is wrong at the till, not just suboptimal. Folds are for
optional work (pricing, strategy), not for load-bearing physical facts. Stock
lengths were folded on the first pass and pulled back out for exactly this
reason.

**The Plan Belongs To Its Inputs Rule.** Editing anything the solver consumed
retires the plan and re-locks the steps after it, rather than leaving a diagram
on screen that no longer matches the parts. A plan the user can read but not
trust is worse than no plan.

**The One Nav Rule.** `.app-nav` — a single top bar with plain links, present
on every route via `CatalogPage` — is the only navigation in the product.
There is no second index, no trim-edge rail, no per-page duplicate of the
same four links; a route with more than one way back to the same content is
a bug, not a feature.

## Elevation & Depth

Mostly flat. Depth comes from the `--card` / `--ground` two-step brightness
difference and 1–1.5px hairline borders, not from strong shadows. Two shadow
uses exist and both are deliberately quiet:

### Shadow Vocabulary

- **Card rest** (`box-shadow: 0 1px 2px rgba(22,21,15,.05)`): Every `.card`,
  `.hp-card` at rest — barely perceptible, just enough to read as "paper
  lifted a hair off the page."
- **Card hover** (`box-shadow: 0 6px 16px -10px rgba(22,21,15,.18)`): The
  homepage launcher cards on hover, paired with the border turning amber.
- **Recessed field** (`box-shadow: inset 0 2px 3px rgba(0,0,0,.07)`): every
  `.form-input` and `.form-select`. The one inward shadow: it makes a field read
  as something to fill in rather than something to press.
- **Focus ring** (`box-shadow: 0 0 0 3px var(--accent-bg)`): a focused field,
  beside its amber border.
- **Inserted sheet** (`box-shadow: 0 24px 48px -24px rgba(22,21,15,.35)`):
  `.cat-sheet` — the one real lift in the system, for a modal floating over
  a dimmed scrim.

### Named Rules

**The Quiet Lift Rule.** Shadow exists only to separate a raised surface from
the page behind it or to answer a hover/focus state. It never simulates
glass, glow, or a gradient wash.

## Shapes

Rounded is the real form language now: `4px` (checkboxes) → `6px` (plate
bars, `.cell-in-plan`) → `8–10px` (buttons, inputs) → `12px` (`.job-block`,
`.btn-order`, cut-diagram frame) → `16px` (cards, `.answer-field`, the
inserted sheet) → `9999px` (the day/night
switch, radio dots). This is a full reversal of the previous system's
zero-radius rule; Tailwind's `borderRadius` scale now resolves to real
values rather than clamping every step to 0.

### Named Rules

**The Radius Ladder Rule.** A new surface picks a step off this ladder by the
size and weight of the thing it's drawing (small control → 4–8px, card-scale
surface → 16px), rather than inventing an in-between value.

## Components

### Buttons

- **Shape:** Rounded (10px default, 12px for `.btn-order`), 1.5px hairline
  border, 38px minimum height (50px for the order button).
- **Default (`.btn`):** Card background, ink text, ink border; hover fills
  `--ground-2`.
- **Primary (`.btn-primary`):** Ink fill, paper text; hover swaps to the
  amber accent.
- **Accent (`.btn-accent`):** Amber fill from the start — used sparingly,
  for the one action a surface leads to.
- **Order (`.btn-order`):** Full-width amber slab, 50px tall, no border —
  the page's primary action ("Plan the cuts"). Hover goes to ink, not a
  darker amber, so the "in progress" and "at rest" states read as distinct
  colors rather than a tint shift.
- **Destructive (`.btn-danger`, `.btn-outline-danger`):** Revision-red
  outline, filling to solid red with white text on hover.
- **Minor action (`.btn-text`):** Underlined ink text, never a box: "Add
  opening", "Try an example", "Load a saved plan". `.btn-text.is-quiet` is the
  destructive variant inside a card ("Remove wall"), ink-2 turning red on hover.

**The Solid Secondary Rule.** Chosen from four mocked button styles (pill,
offset-shadow block, solid ink, tinted): a step has one amber `.btn-order`,
its secondary actions are solid ink (`.btn-primary`), and anything lesser is a
`.btn-text` link. A solid button can never be mistaken for a field, which is
hollow and recessed. Every step of every planner follows this rule. The
back button at the foot of a step is a `.btn-text` link with an arrow, so the
amber primary is the only strong thing in the foot. The save step is a "Plan
details" `SectionCard` (`SavePlanCard`, wallpaper inline): plan name and project
are required `FormField`s with no placeholder, and the hint moves into an ⓘ.

### Cards / Containers

`.card`, `.card-modern`, and `.glass-card` are now genuinely one thing: a
card surface (`--card` background, 1px hairline, 16px radius, the quiet
rest shadow) — no longer flattened shims. `.hp-card` is the same recipe at
14px radius with an icon chip (`--accent-bg` fill, `--accent` icon, 10px
radius, 42px square).

### Inputs / Fields

- **Style:** `--field` fill (a hair off the card in day, darker than the card
  at night, so a field reads as sunk in), a solid 1.5px `--field-line` edge,
  8px radius, 40px minimum height, the recessed inset shadow. The edge clears
  3:1 against the card in both editions (3.7:1 day, 4.9:1 night): the earlier
  hairline edge was too faint to tell a field from text in the night edition.
- **Dropdown (`.form-select`):** The same field with a divided chevron block on
  the right, so it reads as "choose" rather than "type". Things you fill in
  (text and dropdowns) share one family; things you press are buttons.
  Compact dropdowns (the header language, the print paper size) shrink the
  chevron block with them, and their right padding always clears it. Never
  override `.form-select` padding inline: the value then runs under the
  chevron in longer languages.
- **Focus:** Border turns amber with a 3px `--accent-bg` ring; the fill stays.
- **Error:** Border and fill shift to revision red / `--revision-bg`. Red means
  wrong or "you pressed Continue too early", never "not filled in yet": an
  empty required field stays neutral until then.
- **Placeholders:** An example must never pass for an entered value. Do not put
  example values ("e.g. 3200") in measurement or name fields; an empty field
  stays empty and the section status names it. Search fields may keep an
  example, rendered italic. Entered values are weight 600.
- **Units inside the field (`FormField`):** A label translated as
  "Wall width (mm)" renders as "Wall width" with "mm" inside the field; the unit
  stays in the accessible name. Pass `unit` for a unit that is not in the label
  (a currency).
- **In-table (`.cell-input`):** Right-aligned and tabular, boxed like any
  other field (see below).
- **Bounded numbers (`.dimension-input`):** A measurement, rate, percentage,
  or price does not need free-text width and should use a compact 112px control;
  tightly scoped controls such as kerf may use 78px. Names, product search,
  project names, and comma-separated lists remain full-width.
- **Required and optional fields:** Every required label carries an ink `*`
  (`.req-mark`, hidden from screen readers, with `aria-required` on the
  control), and the form opens with one "* Required" legend. An optional field
  says "(optional)" in its label (`.opt-mark`). A field with a default is still
  required. An optional field also looks different (`.is-optional`, added by
  `FormField optional` and used on optional table cells): the same
  `--field-line` edge but dashed, on the card colour instead of the recessed
  fill, turning solid on focus. An earlier version drew the dash in `--ink-4`
  and was rejected for low contrast; the edge colour is load-bearing. Use
  `FormField` rather than hand-building the label.
- **Fields in tables (`.cell-input`):** the same recessed box and 3:1+ edge as
  any other field, only tighter (32px). An empty required cell stays neutral
  (no amber), like every other empty required field.
- **Checkbox / Radio:** 16px, 1.5px `--field-line` border (the `--ink-4`
  edge was under 3:1), 4px radius (full for radio), filling amber when
  checked.

### Section Cards

`.sec-card` — a step's form is split into cards, each with a `--ground-2`
header band (`.sec-card-head`) and a status on the right (`SectionStatus`):
"2 required fields empty: Name, Manufacturer", "Check the measurements" in
red for a real problem, or "✓ Complete" in `--done` (the built-in green, not a
new colour). The status names what is missing instead of only counting it.
Cards do not clip their content, so an ⓘ near the top can open over the edge.
The disabled primary at the foot of the step repeats the first blocker and
links to it ("Fill in Wall width on Wall D to create the plan. Go to Wall D").

Optional work gets its own card marked "(optional)" in the title, with a
summary of its current setting instead of a status (board cutting's "Prices &
cost optimisation · No prices · Least waste"). A card's title is the section's
heading, so the step's `h1` names the tool ("Board cutting"), not the first
card. In a table, required columns carry the `*` and optional ones
"(optional)" in the header; cells never use "Optional" as a placeholder.

A page-wide setting is shown once, not inside each card: the 3D model page's
catalogue choice sits above the cutlist cards (`CatalogueChoice`, with
`showCatalogue={false}` on each `ProductPicker`).

**Repeated cards (wallpaper walls).** A list of like things — the walls of a
room — is one card each, with a letter badge, the name, a one-line summary
("2400 × 2400 mm · 1 opening") and the status. Only one is open at a time;
opening or adding one closes the others, and a closed card offers "Change".
The open card gets the amber outline as the active state. A relation between
two neighbours (a corner) sits between their cards as a one-line
`.corner-link` that opens on "Change", and opens itself when it needs a
decision. Settings that belong to the whole list (closed room, corner overlap)
get their own card after the list. On wide screens a `.room-nav` panel beside
the cards lists every card's status and jumps to it; on a phone it is not
shown, because the closed cards are already the overview.

### The Plan Document

Every plan document is read-only: a summary, an overview and selector when the
module has multiple physical items, its details, and module-specific extras.
The review step and saved-plan page render the same document; print follows
that same order. Editing remains an explicit route back to the planner, never
an inline alteration of a saved result.

`components/plan/PlanPageShell` owns the saved-plan loading states, back link,
title, and Print / Modify actions. `PlanSummary` renders the common labelled
summary list. Do not force a common selector: the wallpaper wall picker is
synchronised to the room drawing while the sheet selector is an image overview.

### Wall Picker

`WallPicker` is a segmented radio group for the walls in a wallpaper plan. Its
selected tab has an amber fill and a letter badge, and it stays synchronized
with the selected amber wall in `RoomOverview`; either control may change the
selection. It is not a substitute for view tabs: project views remain
`.project-view-tab` controls.

### Plan Cards

A plan card has one primary action, **Open plan**, then **Print**. Modify,
download, move, and delete actions live under `⋯` so the card stays scannable.
Multi-select controls appear only when a project contains more than one plan.

### The Step Rail

`.plan-steps` — the wayfinding inside an optimizer page. One segment per step
(three to five) at its natural width (never an equal fraction of the page), each
a sequential index (`01`, `02`, `03`), a plain label, and a one-line summary
of what that step settled (`30 parts · 18 700 mm · 3 mm kerf`,
`4 boards · 722 mm offcut`,
`Saved as Chair rails`). It deliberately borrows `.app-nav`'s grammar — the
current segment gets the same 2px amber underline — so it reads as position in
a sequence, not as a second navigation surface. A finished step is a live
button back to itself; a step whose input does not exist yet is `locked` and
shows what it is waiting for. Under 768px the summaries drop and the three
positions remain.

The numbers are load-bearing here: the sequence is the information. This is the
one place in the system where `01 / 02 / 03` is earned rather than decoration.

### Blocked Actions and Recovery

A disabled primary action must state the requirement that blocks it at the point
of action and provide a direct route to fix it. In board cutting, no required
parts shows a status beside the Required parts heading and a “Go to required
parts” link beside the disabled plan action; the link scrolls to and focuses the
heading. Do not rely on off-screen validation or a vague “fix highlighted rows”
message.

### Folds

`.fold` — an advanced option, closed by default, opened by one full-width row:
a rotating chevron, the title, and a hint that states the current setting rather
than restating the title. Used for cost analysis, packing strategy, exact
placements, and the working-limits reference — never for a physical fact the
user should be checking (see The Check-It-Before-You-Cut Rule).

### Info Tips

`InfoTip` / `.info-tip` — a 24px control beside a label that reveals a compact
explanation on hover, keyboard focus, **and** tap/click. It opens downward,
because these sit near the top of a step where an upward bubble would cover the
heading it is explaining. It is progressive disclosure: optional explanation
lives here, while units, constraints, validation, and other error-preventing
guidance stay inline.

### Navigation

- **Style:** `.app-nav` — one top bar, wordmark left, plain links center,
  day/night switch right. The current route's link gets a 2px amber
  underline; nothing else marks "current."
- **Labels match content 1:1.** Each nav link names exactly the tool its
  matching homepage card names ("STL model," "STEP / CAD" as two separate
  links) rather than a combined label that hides that there are two
  different upload targets.
- **Narrow screens:** Under 1024px, links wrap to their own row under the
  wordmark row rather than collapsing into a drawer — there is no hamburger in
  this system. Signed in, the links and account controls do not fit on one
  row below that width in any language.
- **Account:** The signed-in email is cut with an ellipsis (full address in its
  title), so a long address never pushes into the links.
- **Modal header (`.masthead`):** A quieter, separate pattern reused only
  for the Load sheet — plate-paper background, plain title,
  an underlined text "Close" instead of a colored chip.

### Tables

`.cat-table` is a plain hairline-row table: 11px uppercase headers, 1px row
dividers, first column left-aligned as the row key, other columns
right-aligned and tabular. `.is-sum` promotes a row to a 1.5px ink top rule
and weight 800. `.cell-in-plan` fills a used cell with `--accent-bg` and
amber text — no more "bleeding ink" box-shadow trick, just a flat fill.

### The Answer

`.plan-answer` opens the plan step: the boards-or-sheets figure in amber at
display scale, its unit label beneath, and the supporting figures (`material
bought`, `offcut`, `blade takes`, `efficiency`, `cost`) as one plain
`.plan-facts` row of label-over-value pairs beside it — not four stat cards.
Only figures the API actually returns are printed, each conditional on its
value being present; the UI derives no number of its own.

`.answer-field` (the bordered figure card) is the older form of the same idea
and is no longer used by either optimizer.

When a diagram already labels the cut sequence, do not repeat it in a separate
text cut-order panel. Keep complementary information, such as the stock to buy,
but make the diagram the single source for the sequence.

### The Homepage Illustration

`.hp-visual` — one animated isometric illustration
(`src/assets/planqer-hero-animated.svg`, transparent, cropped to the
drawing at 895×490) of the
materials the tools plan: a plywood sheet, oak boards with a hatched
offcut, a tile grid with its amber start tile, wallpaper strips off a roll,
and the cutting plan between them. No card, border, or caption; it fills the
right-hand column so the drawing's edges line up with the tool card below
it. It is
decorative (`aria-hidden`); the headline and tool cards carry the meaning.

**Intentional exception:** this illustration is the only place on the site
that uses material colours (oak, birch, tile cream, sage) and its own drawn
amber marks. They belong to the picture, not to the interface, so they do
not count against the One Accent Rule or the colour palette. Keep any
replacement illustration honest about what the tools do: organic materials
are fine, but cuts are straight and parts rectangular.

The SVG carries its own one-time animation: an amber blade sweeps left to
right, hiding the uncut stock and leaving each material cut into its plan
(about 2.5s). It is inlined, not loaded as an `<img>`, because an SVG image
does not see the page's `prefers-reduced-motion`; inlined, its own rule shows
the finished plans at once. The page only mounts it when it first scrolls
into view, so the sweep is seen on a phone too, where the illustration sits
below the cards; the box keeps its aspect ratio until then, so nothing
shifts.

### Notices

- **Errata (`.alert-danger`):** Revision-tint field, revision border, an
  "Note" label instead of the previous "Errata" — plainer register.
- **Note (`.alert-note`):** Amber-tint field, hairline border — an aside,
  not an alarm.
- **Inserted sheet (`.cat-overlay` / `.cat-sheet`):** A 50%-ink scrim behind
  a rounded, card-colored sheet — this system's modal.

### Day / Night Switch

A 42×24px pill (`{rounded.full}`) with a 1.5px hairline border; off is
plate-paper, on is amber, the thumb is card-colored and slides 120ms linear.
Grows to 52×30px on phones. No icon in the thumb — the position is the
whole affordance, with `aria-label`/`title` covering the rest.

## Do's and Don'ts

### Do:

- **Do** spend the amber accent on exactly one thing per surface: the action,
  or the figure that leads to it.
- **Do** keep every card, input, and control on the radius ladder (4 → 6 →
  8–10 → 12 → 16 → full) rather than inventing an in-between value.
- **Do** hold every label and caption to an 11px floor (12px for
  sentence-case captions like `.synthetic`/`.folio`).
- **Do** give card titles real, sequential heading levels — never skip from
  `h1` straight to `h3` because a card "feels" like a small heading.
- **Do** name a nav link after exactly the tool its matching card names; a
  combined label that hides two different destinations is a bug.
- **Do** print only real, fixed, or API-returned figures as proof. A
  homepage demo is labeled as a fixed example, never presented as live or
  inflated into a round number.
- **Do** reference roles through the CSS custom properties (`var(--ink-3)`,
  `var(--accent)`) so both editions stay one system.

### Don't:

- **Don't** introduce a fifth color, or let revision red and the accent
  amber sit close enough in hue to be confused in a small mark.
- **Don't** add a second navigation surface — trim-edge rail, sidebar, or
  per-page duplicate menu — alongside `.app-nav`.
- **Don't** reintroduce a catalog reference number (folio code, "Section N,"
  "Fig. N.NN") anywhere in copy; a plain sequential index (`01`, `02`…) is
  fine, a fake document citation is not.
- **Don't** put a second step's controls on screen beside the current one, or
  return an optimizer page to a single spread of every input at once. That is
  the specific thing the step flow replaced.
- **Don't** add a shadow, gradient, or glass effect outside the two named
  quiet-lift uses; depth comes from the ground/card brightness step and
  hairline borders first.
- **Don't** let a color pair ship without checking contrast — this system
  has already had to darken both the accent and `--ink-3` once after an
  audit caught sub-4.5:1 pairs that looked fine by eye.

## Notes on incompleteness

Recorded so future work does not mistake these for system rules:

- **The flat type scale on `/cutting`** (an 8-step, 1.4:1 ratio topping out at
  15.5px) was the previous pass's disclosed defect. The step rebuild fixed it:
  each step now opens with a real `.step-h1` at 26px over a 14.5px lede, above
  15px section titles, 14px body, and the 11px label floor — with the answer
  figure at display scale. Roles are distinguishable at a glance rather than
  by 1px increments.

- **Two figures the API returns are still worth watching.** `cost_per_board_type`
  is keyed by `str(float)` (`"5100.0"`) while every plan-side count keys off a
  JSON number (`"5100"`); `CostAnalysisPanel` matches them by numeric value
  because matching the strings printed `0.00` on every cost line beside a
  correct total. The same function returns a *line* total, not a unit price, so
  "each" is derived by division. Both are frontend compensations for API shapes,
  not conventions to copy.
- **The design document is not mechanically enforced.** Component tests protect
  behaviour, but every user-visible frontend change must still review this file
  and update it when the design system, interaction rules, or current
  intentional exceptions change.
