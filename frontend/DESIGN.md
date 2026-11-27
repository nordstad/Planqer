---
name: Partsible
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
  builtin: "#3d6a2c"
  builtin-bg: "#eaf2e3"
  done: "#3d6a2c"
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
  night-builtin: "#9fcb8b"
  night-builtin-bg: "#1c2716"
  night-done: "#9fcb8b"
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
  'title':
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

# Design System: Partsible

## Overview

This is the repository's normative interface contract. Current rules below take
precedence over the historical rationale explicitly identified as such. Obsidian
holds the review programme and evidence, not a second design system. The product
UI is an **Operate** surface; Help and saved instructions prioritize **Read**.
Preserve the existing warm-paper visual identity; remediation is not a restyle.

### Creative North Star: "The Self-Hosted README"

Partsible reads like a well-made open-source project's own homepage, not a printed
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
- Workshop first: measurements, units, material quantities, and their physical
  consequences must be clear before decorative detail
- Accessibility baseline: meet WCAG 2.2 AA for contrast, keyboard access,
  focus visibility, and target sizing
- One top nav on every page — no secondary index, no trim-edge tab rail
- Catalog reference numbers (folio codes, section numbers) are gone; a
  numbered list is now just a plain index (`01`, `02`…), never a fake
  document citation

## Design and UX Principles

These principles guide changes across every page, not just the homepage or one
planner. Product context lives in `PRODUCT.md`.

**Measurement policy (2026-11-27):** New measurement inputs use whole millimetres,
including kerf, joints, gaps, opening positions, stock profiles, and allowances.
Reject fractional, malformed, and out-of-range input rather than truncating it
or accepting a numeric prefix. Keep the existing supported bounds; the smallest
positive whole-mm kerf is 1 mm. Prices, percentages, ratios, and angles are not
millimetre measurements and retain their own contracts.

The model flow explicitly explains that measured geometry is rounded to the
nearest millimetre before grouping and planning. This supersedes the earlier
proposal to preserve fractional model inputs. Computed geometry is not rounded
internally: doing that could change placement and fit. Existing saved records,
stored diagrams, and backups are not migrated or silently rounded. Their
historical fractional instructions remain accurately readable; modifying them
requires correcting unsupported inputs before recalculation or a new save.

- **Consistency across pages:** Reuse the same visual and interaction language
  for equivalent tasks: navigation, actions, fields, validation, loading,
  dialogs, and result summaries. Consistency does not require identical layouts
  for different tasks.
- **Task-first UX:** Make the next action, current state, and error recovery
  clear. Prioritize laptop and desktop workflows, followed by tablets. Mobile
  must look good and work, but must not dictate the main workflow.
- **Keep it simple (KISS):** Remove unnecessary controls, repeated information,
  and decoration. Do not remove measurements, constraints, or guidance needed
  to prevent mistakes merely to make a screen look cleaner.
- **Reuse before inventing:** Use existing tokens and shared components when
  the pattern matches. Fix shared behavior centrally instead of copying it
  into each page. Do not create speculative abstractions for one-off needs.
- **Explicit exceptions:** A page-specific departure needs a task-based reason
  documented here. Distinguish intentional differences from unfinished
  migrations; neither an implementation accident nor a scanner finding alone
  establishes a design rule.

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
- **Hairline** (`{colors.rule-hair}` `#e9e6da`, night `#322d20`): Decorative
  card/table separators. Functional control boundaries use `--field-line`;
  active, focus and error boundaries use their semantic state tokens.

### Color Rules

**The Accent Has Meaning Rule.** Amber identifies the primary next action,
active location/selection, keyboard focus, or a consequential figure. Those
roles may coexist; do not suppress focus or selected state to meet an arbitrary
one-element quota. Decorative accents and equally prominent competing primary
actions are not allowed. Revision red signals errors; existing green `--done`
and catalogue provenance colors are semantic exceptions, not extra brand colors.

**The Redder Than Amber Rule.** Revision red must read as unambiguously red
next to the accent's amber. If a proposed error color and the accent color
could be confused in a small icon or border, the error color is wrong, not
the rule.

## Typography

**Display / Body / Label Font:** Archivo, self-hosted via `@fontsource`
(weights 400–800), one family for everything sentence-case; **Archivo
Narrow** (600–700) for labels and supporting captions.

Delivery retains those exact self-hosted WOFF2 faces, weights, and Unicode
ranges. The build removes only their redundant legacy WOFF sources; no glyph
subset or visual font substitution is used to meet Lite's delivery budget.
`fontDelivery.test.js` compares every retained declaration with Fontsource.

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

### Typography Rules

**The Legible Floor Rule.** No functional or caption text renders below
11px, and running-prose-style captions (`.synthetic`, `.folio`) sit at 12px.
An earlier pass at 10–10.5px (inherited from the previous system's
density-as-trust-signal philosophy) failed a runtime accessibility scan and
was raised across the board; this floor is now load-bearing, not a
suggestion.

**The Narrow-Means-Support Rule.** Archivo Narrow is for tracked micro-labels
and the existing sentence-case `.folio`/`.synthetic` supporting captions.
Running prose and editable values use Archivo. Do not force captions uppercase.
The structured typography values are role defaults, not an exhaustive size
catalogue: the established step heading is 26px (22px below 768px), the lede
14.5px, and functional table fields 32px tall. These intentional density
exceptions must remain readable; do not introduce arbitrary new sizes.

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

Planners are **stepped**, not an inputs-and-answer spread: enter requirements,
read the result, save it. The `.plan-steps` rail renders only the current step.
Simple upload and save forms retain a 620px measure; diagrams use the full
1080px content width. Board, sheet and tile entry share the same `.is-form`
620px measure, with their sections stacked in reading order at every width.
Do not add per-planner desktop columns: user review rejected the uneven
two-column composition, which left empty space without removing scrolling.
Individual related fields may still share a row within a section.
Model batch settings are a separate comparison task: `.is-model-settings`
uses the wider measure at 1000px and above, with two columns of independent
cutlists, not a widened upload field. Below that breakpoint the same DOM returns
to one column. Inputs stay compact, not stretched to fill space.
Optional board pricing/strategy uses `Disclosure`; stock and kerf never collapse.

The global menu is always sticky at the viewport top. The step rail starts in
normal document flow and sticks beneath the menu only when scrolling reaches
it. Its offset follows the menu's measured height, including wrapped mobile
navigation and locale changes; never pin both surfaces at `top: 0`. Focus and
anchor destinations account for both sticky surfaces so headings remain visible.

Sloped-wall controls are HTML `FormField`s outside the drawing's SVG transform.
They flank the outline in roomy containers and reflow below it at 560px and
below. The same five controls follow row-major DOM/focus order in both layouts.
Never shrink a measurement control with a diagram.

Shared headers and summary values must wrap supported long names. Two-dimensional
strip/placement/shopping tables scroll in labelled, keyboard-focusable local
regions; they must not expand the page or hide costs. Test 1440/1024/768/390/320px,
long unbroken names, large part sets, all locales and both themes. Print has its
own paginated layout; screen scrolling is not a print layout.

### Layout Rules

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

Tile calculations follow the board/sheet revision-guard pattern: editing inputs
retires both completed and in-flight layouts and permits a fresh calculation.
Only the current request may publish a result or error, advance to Layout/Keep,
or end the current loading state. An obsolete response must not unlock Keep or
pair old candidate geometry with newly entered measurements when saving.

Wallpaper uses the same revision rule for both Create plan and alternative-start
calculations. Editing wall, roll, pattern, corner, or allowance inputs retires
completed and pending plans and locks Plan/Review/Save until recalculated.
Review/Save also stay locked while an alternative start is pending. A failed
current alternative leaves the last valid plan available for retry; an obsolete
response cannot publish a result/error or end a newer request's loading state.

**The One Global Nav Rule.** `CatalogPage` owns one `.app-nav` on every route.
Do not duplicate global tool links in a second sidebar or rail. Contextual
navigation is intentional: step progress, Help contents, wall/item selectors,
dashboard back links and recovery links serve different tasks and remain.

## Elevation & Depth

Mostly flat. Depth comes from the `--card` / `--ground` two-step brightness
difference and 1–1.5px hairline borders, not from strong shadows. The named shadow
and focus treatments below are deliberately quiet:

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

### Elevation Rules

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

### Shape Rules

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
use shared `FormField`s with no placeholder. Plan name and project choice are
required. New-project name is optional: its associated visible hint names the
blank/whitespace fallback (plan/model name, otherwise localized "My plans").
The section's completion status must agree with those semantics. Existing
project choices do not create a new group.

Equivalent persistence actions use **Save** for the step, **Name and save** for
entering the save form, **Save this plan** for its heading, and **Save plan**,
**Save to [project]** or **Update plan** for the actual operation. "Keep" is
ordinary explanatory prose, not a competing action name. Model batch planning
may say **Plan and save** because that operation also calculates. Help uses
the same action vocabulary.

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
- **Tile dimensions on phones:** Surface width / height, tile width / height,
  and joint / perimeter gap remain paired in two columns, including on narrow
  screens. Keep labels, units, and error states readable within each column;
  related measurements should not consume two rows merely because the screen
  is a phone.
- **Tile thickness:** New tile plans start at an editable 10 mm. This is a
  convenient common starting point, not a universal tile specification;
  thickness is saved but does not currently affect the calculation. The field
  stays visible and required, and clearing it blocks calculation.
- **Sheet thickness:** New sheet plans also start at an editable 10 mm, not a
  claim about the stock. A catalogue product's thickness replaces the default;
  an explicitly cleared thickness still blocks planning. Thickness is saved
  but does not currently change the sheet placement calculation.
- **Sheet part quantities:** Accept complete whole-number values from 1 to 1000
  per row. Never truncate fractional or partially numeric input. Invalid counts
  block planning and serialization for both calculation and saving; totals count
  only valid rows while the existing row status explains what needs correction.
- **Board part quantities:** Apply the same complete-value rule with the existing
  1–10,000 per-row limit. Counts, length demand, and calculation/save payloads
  must agree; valid whole counts in exponent notation retain their full value.
  Invalid counts block submission and serialization rather than being truncated
  or silently omitted.
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
- **Conditional setup code:** Registration's setup code is not unconditionally
  required or optional. Its visible, associated hint states the local/network
  condition; do not infer the server's configured secret or mark this field
  universally optional. Other auth fields and editable Defaults use the shared
  required cues; catalogue creation requires kind/type/dimensions while its
  stock lists, provenance and detail overrides are optional.
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

Optional work uses a disclosure with a current-setting summary (board cutting's
"Prices & cost optimisation · No prices · Least waste"), or an optional card
where the task needs persistent context. A card's title is the section's
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
Where the workflow has a document Review step (wallpaper), Review and saved pages
share the document formatter. Other planners may use task-specific live result
controls rather than pretend to be identical saved documents. Shared facts must
keep the same meaning. Print follows the document's information order. Editing
is an explicit route back to the planner, never an inline saved-result mutation.

Board profiles are labelled **Board thickness × width**; tile dimensions are
**Tile size**, never Sheet size. Wallpaper summaries include actual repeat and
matching values, and costs retain cents and known currency. Live Review, Print
and Save pass the same pricing context. Historical missing currency is stated
as unrecorded, never inferred from today's Defaults.

Saved board/sheet diagrams expose **View the full diagram** through shared
`DiagramInspection` and `Modal`: original SVG/PNG bytes, intrinsic-size image
and a bounded, keyboard-scrollable region. Inspecting never enters Modify or
regenerates an image; Escape returns to its trigger. Tables remain accessible
outside the overlay. Live sheet **Download all sheets** always exports the
combined returned asset, independently of the selected on-screen sheet.

Model board grouping keeps length totals for comparison and separate named
source rows for handoff. `boardPartsForGroup` feeds both standalone and batch
paths. Equal lengths from distinct named components retain their own names and
counts; missing names remain blank. Never assign the first component's name to
unrelated rows. Legacy unnamed length maps still load.

Saved board, sheet, tile, and wallpaper routes expose only the current route's
document, title, Print, and Modify actions. Changing the plan ID retires the
previous document immediately and shows the existing loading state; missing
state is reset for the new request. Obsolete success/failure responses cannot
replace the current document or its loading/missing state, including A→B→A
navigation. This guards response eligibility, not network cancellation.

A board plan's document and printout include **Parts to cut** (name, length,
and quantity) before the cutting diagram. This is distinct from the project
shopping list: the former is the job's cut specification, while the latter
aggregates raw stock to buy.

Board diagram cells prioritise the cut length, with a part name only when it
also fits. A cut schedule is included in the image only when a piece is too
narrow to label. The live diagram downloads as PNG. The live "What to buy"
table uses the available width and keeps stock dimensions separate from length.
The board result summary uses one consistent label-and-value style, and shows
the stock profile only once when it is already present in the product name.
Do not repeat a comparison/answer metric as a second dashboard. Tile candidate
cards own purchase-with-allowance, utilization and distinct-size comparison;
the selected detail table adds needed-before-allowance, cut/reuse counts and
edge/sliver constraints. The sheet answer pairs its count with **Sheets to buy**
and shows utilization once in its facts. Repeating a quantity in a stock total
or physical sheet selector serves a different task and is intentional, not
another hero.

**The Measurement Comes First Rule.** A part description must never replace
its actual cut length. Show the length first, preserve decimal precision, and
add a description only if it fits without obscuring the measurement. If a
piece is too small for its length, a standalone diagram must retain a readable
fallback schedule: removing redundant text must never remove a required cut.

Live sheet results, saved sheet documents, and generated sheet Print instructions
preserve decimal dimensions and coordinates through the shared measurement
formatter, following the existing board-results number format. Saved summaries
also retain stock thickness and dimensions; diagram descriptions retain the
returned sheet dimensions. A semicolon separates x and y so decimal commas
cannot be mistaken for coordinate separators. Existing stored diagram images
are not regenerated by these presentation fixes.

Saved board documents and generated board Print instructions use that same
formatter for stock profiles, stock lengths, required-part lengths, and cut
schedules. Board selection must not change measurement precision. Named rows
and legacy length-to-quantity records follow the same display rule; stored
measurements and diagram images are left untouched.

`components/plan/PlanPageShell` owns the saved-plan loading states, back link,
title, and Print / Modify actions. `PlanSummary` renders the common labelled
summary list. On phones, its facts form one bordered list with labels on the
left, values on the right, and hairline row dividers; print keeps its own
layout. Do not force a common selector: the wallpaper wall picker is
synchronised to the room drawing while the sheet selector is an image overview.

### Tile Diagrams and Cut Lists

The full-width diagram precedes the cut list. The list uses proportional,
colour-matched shape swatches, intact measurements, quantities and a quiet
**View cut** action. Avoid repeating a cut type or edge measurements in the
row when the template already gives the details. Older plans without a
template retain a description instead. On phones, rows stack their facts
without breaking a measurement across lines.

Hovering or focusing a row subtly highlights it and its matching pieces;
hovering a piece highlights the matching row without moving the page. A
pointer-adjacent preview shows the cut's size and quantity even if its row is
off-screen. Selecting a cut opens its template, which can navigate to the
matching row and keep it highlighted. A full tile explains that no cut is
needed and has no cut action. When an older diagram cannot be matched safely
to its tiles, leave the cut-list actions available rather than guessing.

**Rejected experiment:** A side-by-side diagram and independently scrolling
cut list kept both in view, but made the diagram too small, broke measurements
across lines, and introduced nested scrolling. Do not reintroduce that layout
to solve an off-screen hover state. The current interaction does not promise
that both the hovered piece and its highlighted row are simultaneously visible.

Tile diagrams show centred cut letters only when they fit inside the piece.
They omit repeated dimensions and labels on notched pieces; the cut list and
templates carry those details. Dense or diagonal diagrams must not let labels
overlap or cross tile edges.

The live tile diagram puts the surface dimensions and matching secondary
enlarge / PNG actions above the drawing, with a legible HTML legend below it.
Its on-screen SVG is cropped to the surface; the downloadable image retains
its own caption and legend. The exported image uses a title (the saved plan
name when available) and a separate surface-size line, not a run-on ranking
summary. Saved diagrams are stored images: changes to diagram generation do
not retroactively redraw existing plans.

Fresh tile calculations localize semantic candidate names and recognized generated
SVG annotations through `tileLocalization`; switching locale re-renders from the
original response. The same localized current image feeds live, enlarged, PNG
export and new saves. Template measurements/letters are locale-neutral and their
HTML instructions translate normally. User plan/opening names and geometry are
never translated. Saved images remain immutable language snapshots, including
older English legends; the surrounding saved-page controls follow the current
locale without claiming the stored image was regenerated.
New saves include a `layout_result.diagram_labels` snapshot so the shared
backend/Lite saved-SVG redraw uses the same translated annotations. API callers
that omit it keep the English rendering default.

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

### Project Shopping List

The shopping list is a **workshop order sheet**, not a spreadsheet: one framed
material sheet with a plate-paper heading band, strong stock names, and a
quietly tinted **To buy** column that makes the actionable purchase quantity
the visual anchor. Its 12px, weight-800 column labels are intentionally more
prominent than a standard table's micro-labels. It remains a semantic table so
stock, size, quantity, optional unit price, and cost stay easy to scan and
export. **Needed** is secondary context in that cell, not another competing
purchase column. The visible explanation states the configured board/sheet
reserve, rounded up per combined size; tile/wallpaper retain their saved
allowance without adding it twice. Print/CSV expose the same two counts plus
source-plan provenance. Unpriced rows are deliberately quiet;
the subtotal and note explain
when the visible cost is incomplete.

Tile purchase aggregation includes known thickness as well as material, width,
and height; use stored measurements, never rounded labels, as identity. Unknown
thickness must not inherit a known thickness by merging. Identical tile rows
still aggregate under the existing pricing rules and retain the planner's
purchase quantity without applying the project spare allowance a second time.
The screen, CSV, and generated shopping Print use the same purchase rows.

Wallpaper purchases include each known product code in structured identity,
alongside the existing name, manufacturer, and roll dimensions. Shopping labels
show the name, manufacturer, and code when present so distinct purchases remain
identifiable on screen, in CSV, and in generated Print. Missing codes must not
inherit known ones; identical coded products retain existing pricing and
reserve behavior. Codes are preserved as stored, not inferred or case-folded.
Known repeat, match, roll offset, and batch reference also participate in purchase
identity and are visible in the shared screen/CSV/Print label. Missing metadata
does not inherit known values by merging. Identical metadata still aggregates
without a second reserve allowance.

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

Language, day/night edition, and Lite-notice dismissal are optional browser
preferences. Denied storage getters, reads, or writes must not blank the app.
Language falls back to a supported browser language, then English; switching
still updates the active language and document language. Only a saved boolean
`true` enables the night edition; malformed values use the day edition. When
storage is unreadable, keep the current document's theme across navigation.
Lite-notice dismissal still works in the current view if it cannot be remembered.
These fallbacks do not imply that saved work is available, persistent, or
backed up.

Self-hosted sign-in storage is not an optional preference: an unreadable token
must not be treated as a missing token or trigger token deletion. Finish loading
with an explicit storage-specific alert and a reload recovery action; do not
offer sign-in/setup or expose protected routes while identity is unknown.
This alert has its own translated heading, not the generated "Note" prefix.
Public content and language/theme controls remain available. A failed logout
must not claim success if token removal failed. This does not change credential
storage policy, IndexedDB behavior, or introduce an ephemeral work-store fallback.

Optional catalogue/release caches and last-project preferences must not turn a
successful fetch, save, or move into an apparent failure when their write fails.
Model handoff is different: a failed transfer write keeps the source model and
offers an explicit retry instruction without navigating. A failed destination
read leaves a visible recovery message rather than crashing the planner.

Saved-plan failures distinguish confirmed not-found from inaccessible or
temporarily unavailable data and offer an in-place retry. Unknown collections
must not render a known-empty library. Failed renames/settings edits retain the
draft, block duplicate pending commits, and permit retry or cancellation.
Unknown routes and failed route rendering retain navigation and honest
reload/home recovery; reloading may discard unsaved input.
Recovery resets on navigation after a failure without remounting healthy pages:
consuming an edit/import query or following a fragment must preserve loaded work.
Wallpaper saves announce their pending state and lock the save fields and step
navigation until completion. Failures retain the draft for retry. Leaving the
planner retires completion handling and prevents an unsent plan write after
project creation; it cannot cancel a write already sent. A secondary wallpaper-
library failure must not imply that the completed plan save failed.
Skipped model geometry retains its part name and a localized explanation for
known reasons, with a safe correction hint for unrecognized reasons. Keep these
diagnostics available even when no usable cutlists remain; replacing or removing
the source file clears them. A geometry warning alone does not prove that an
assembly container was intended as a physical part.

Registration and password reset explain the server's actual policy: at least
eight Unicode characters, ASCII uppercase/lowercase, a digit and a special
character, with a maximum of 72 UTF-8 bytes. Reset uses a password field with
retry/cancel, never a plain-text browser prompt. Login is not subjected to
new-password validation.

Lite backup import reports success only after all imported record writes commit
in one transaction across the affected stores. A failed or aborted import must
leave both existing records and unrelated work unchanged; successful individual
write requests are not evidence of a committed restore. This atomic-write rule
does not replace record validation or explicit conflict/replacement confirmation.
Before writing, imports reject unsupported formats, duplicate IDs within a store,
invalid saved-record shapes, and missing project-group references in the merged
library. Validation preserves the original supported metadata rather than
normalizing it or re-solving plans. Rejection leaves storage unchanged and tells
the user to keep the original file and try another backup.

Choosing an import file prepares a read-only inline review in the existing backup
panel; it never writes immediately. Show additions/replacements for each affected
record type, with expandable record names, IDs, and current replacement names.
Matching IDs count as replacements even when their contents are identical,
including Defaults and catalogue entries. Require an unchecked-by-default explicit
replacement approval before enabling the destructive restore action.

Changing the file, cancelling, leaving the panel, or a failed/stale restore
retires the current UI approval. Pending obsolete file reads/previews cannot
restore eligibility or feedback. A restore is single-use and locks its actions
until commit/rollback; cancellation is available before, not during, that write.
Reread the selected file before handing off the write; changed or unreadable
contents cannot be restored using the previous preview.
Empty backups remain read-only. Move keyboard focus to the ready review heading
and back to Import after cancellation or a completed restore attempt.

Preview owns an immutable copy of the validated file and a consistent snapshot
of affected IDs plus referenced retained groups. The write transaction rechecks
those records before enqueueing any writes, including absent IDs that might have
become replacements. A relevant mismatch aborts without writes and requires a
fresh preview and new approval. Unrelated record changes do not invalidate it.
Backup maintenance stays below the dashboard's project/Defaults content behind a
collapsed-by-default **Backup** button disclosure, not a competing full-width
card. Export history, transfer controls, storage details, and persistence requests
are disclosed inline. Backup reminders, unprotected/unknown storage warnings,
persistence refusals, and action feedback stay visible even while collapsed.
The native button exposes expanded state and its controlled content; hidden
controls are not keyboard stops. Collapsing cancels an uncommitted review and
retires its approval, with focus on Backup. Disable collapse during a restore
write; normal cancellation/completion still returns focus to Import.
After a successful restore commit, invalidate catalogue caches and notify mounted
project/Defaults/catalogue views to reload their stored data. Failure/rollback
does not emit a success notification. Keep the backup disclosure mounted so its
feedback and focus recovery survive. This is same-document refresh, not a promise
of automatic cross-tab synchronization or crash durability.

Defaults are editable and saveable only after a successful read for the current
user. A pending read shows the existing loader; a failed read shows the load error
and a localized Retry action, not an editable fallback form. Retry never writes
preferences. Failed saves retain the loaded draft for correction or retry.
Changing user retires the previous draft/actions; obsolete load/save completions
cannot change current eligibility, feedback, language, or catalogue choice.
Save also rejects direct submissions while settings are unknown or a save is
pending. This protects response eligibility, not already-sent request cancellation;
there is no implicit reset-to-defaults behavior.

The admin catalogue's resolved country owns its rows, vocabulary, edit/add drafts,
suggestion panels, and delete/revert confirmations. Changing that country retires
those together and shows the existing loader, while keeping the country selector
available. Search and filter choices persist. Rows and mutations become available
only after the matching list and vocabulary load. Requests and mutations capture
their country; obsolete load/mutation successes and failures cannot replace
current data, close a new country's form, or end its pending state. Already-sent
mutations may finish in their original country; this is not network cancellation.

A disabled primary action must state the requirement that blocks it at the point
of action and provide a direct route to fix it. In board cutting, no required
parts shows a status beside the Required parts heading and a “Go to required
parts” link beside the disabled plan action; the link scrolls to and focuses the
heading. Do not rely on off-screen validation or a vague “fix highlighted rows”
message.

Correction links in board, sheet, tile, and model batch settings focus the first
invalid field in DOM order, then an empty required field, never an unrelated
empty optional field. Their scroll respects reduced motion. Edited invalid tile
openings expose field-specific feedback while calculation is disabled; untouched
empty openings stay neutral. Shared field feedback associates only the faulty
control with its error and clears that association after correction.
Committed Lite restores also refresh mounted product-picker suggestions without
rewriting selected product snapshots or current planner inputs.

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

**Accessible interaction contract (2026-11-27).** `CatalogPage` owns exactly one
`main#main-content` and a visible-on-focus skip link; saved-plan shells must not
nest another main. Projects, Defaults and administration retain meaningful h1
headings, including project rename mode. Route titles are localized and identify
the current tool or supplied saved/loading/error state, never an obsolete plan.

Genuine pathname transitions focus the destination heading (or main while no
heading is available) without scrolling it into view. New routes scroll
immediately to the page top, keeping the global menu and step rail in their
initial positions rather than moving them under the next pointer activation.
Non-interactive destination headings do not draw a focus box; keyboard focus
indicators remain on links, buttons and fields. POP navigation does not force
scroll. Query consumption
must preserve working context. Help hashes focus their section heading and expose
`aria-current="location"`. `PlanSteps` reveals/focuses the new heading only when
the step changes, not during same-step repricing. Destination scrolling respects
reduced motion.

`Modal` owns focus entry, forward/backward containment, Escape/backdrop dismissal,
background isolation and trigger recovery for confirmation, authentication,
saved-plan loading and diagram/template overlays. Existing sheet styling and
bounded internal scrolling remain. First-run setup can be cancelled to return to
the page; cancellation never bypasses protected-route setup requirements.
An explicit destination such as Show in cut list takes precedence over trigger
recovery after the overlay has released background isolation.

Board/admin selectors use ordinary selected buttons (`aria-pressed`), not tab
roles. Plan actions and nested Move destinations are disclosures with normal
Tab/Enter buttons, expanded/control associations and nearest-trigger Escape
recovery, not application menus. Keep working sheet buttons and wall radios.
Model file-input keyboard focus is reflected on its visible label. Meaningful
warnings use theme-aware semantic colors; enabled catalogue rows are never faded
through ancestor opacity. Field errors describe only affected controls; related
opening fields may share one explanation without repeating live alerts.

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

`.plan-answer` opens the plan step. Sheet and tile plans use an amber
display-scale answer with supporting facts beside it; the board plan instead
uses one consistent row of label-over-value pairs for its board count and
supporting figures (`material bought`, `offcut`, `blade takes`, `efficiency`,
`cost`). Neither treatment uses a grid of separate stat cards.
Only figures the API actually returns are printed, each conditional on its
value being present; the UI derives no number of its own.

`.answer-field` (the bordered figure card) is the older form of the same idea
and is no longer used by either optimizer.

When a diagram already labels the cut sequence, do not repeat it in a separate
text cut-order panel. Keep complementary information, such as the stock to buy,
but make the diagram the single source for the sequence.

### The Homepage Illustration

`.hp-visual` — one animated isometric illustration
(`src/assets/partsible-hero-animated.svg`, transparent, cropped to the
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

### The Logo

The mark is a 3 by 3 grid of rounded parts in dark green-grey (`#4c5951`),
with the last two pieces in burnt orange (`#d87328`): the offcuts. In the
interface use the flat symbol (`public/partsible-symbol-flat.svg`) on the
light theme and the dark symbol (`public/partsible-symbol-dark.svg`, parts
`#e9e6da`) on the dark theme, switched with the same `isDark` check as the
rest of the theme. The wordmark is lower case ("partsible") in the lockups
and "Partsible" in prose. Keep clear space of at least one part around the
mark. Do not recolour the orange pieces, add gradients to the interface
versions, or redraw the grid. The gradient master and the lockups live in
`docs/assets/brand/` for the README and the docs.

### Footer and Support Link

The self-hosted homepage footer (`.hp-footer`) and the Partsible Lite footer end
with one plain text link, "Buy me a coffee", to `https://ko-fi.com/nordstad`.
It looks like its neighbours (Help, Source, Licence): same type, same colour,
no icon, no button, no banner or popup. It opens in a new tab with
`rel="noopener noreferrer"`. Self-hosted tools omit this link; Lite keeps it in
its shared footer, never inside a working form or result action group. It has no
analytics event, and it does not load a Ko-fi widget or script, so the app
makes no third-party request until the link is clicked.

The Lite shell places its footer at the bottom on short pages. Only the footer
may stick, and only on roomy viewports (at least 700px wide and 720px high);
the quiet dismissible notice stays in normal flow. Narrow/short screens and
print keep both in flow so chrome does not take over the workspace. Focused
content must remain reachable above sticky chrome; test browser zoom as well
as CSS viewport sizes. Homepage footer destinations wrap rather than overflow.

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

### Do

- **Do** reserve amber for the primary action, active state, focus and a
  consequential figure; do not let decorative accents compete.
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

### Don't

- **Don't** introduce a fifth color, or let revision red and the accent
  amber sit close enough in hue to be confused in a small mark.
- **Don't** duplicate global navigation alongside `.app-nav`; keep purposeful
  local wayfinding and recovery.
- **Don't** reintroduce a catalog reference number (folio code, "Section N,"
  "Fig. N.NN") anywhere in copy; a plain sequential index (`01`, `02`…) is
  fine, a fake document citation is not.
- **Don't** put a second step's controls on screen beside the current one, or
  return an optimizer page to a single spread of every input at once. That is
  the specific thing the step flow replaced.
- **Don't** add a shadow, gradient, or glass effect outside the named
  quiet-lift uses; depth comes from the ground/card brightness step and
  hairline borders first.
- **Don't** let a color pair ship without checking contrast — this system
  has already had to darken both the accent and `--ink-3` once after an
  audit caught sub-4.5:1 pairs that looked fine by eye.

## Notes on incompleteness

Recorded so future work does not mistake these for system rules:

### Verification inventory

| Contract | Automated evidence |
| --- | --- |
| Complete mm/count values; historical precision | Measurement/parts tests |
| Modal entry/trap/recovery/isolation | `Modal.test.jsx`; interaction E2E |
| Main/skip, destinations, field errors | `AccessibleInteraction` tests |
| Document facts and export scope | Document/result component tests |
| Original-image inspection and focus return | `DiagramInspection.test.jsx` |
| Source-named model board handoffs | `modelGroups.test.js`; model flow tests |
| Tile locale adapter; unchanged geometry/names | `tileLocalization.test.js` |
| Optional project-name fallback | `ProjectPicker` / `useProjectChoice` tests |
| Needed/To buy; reserve; purchase identity | Shopping/material-list tests |
| Scrolling, long names, viewports | `documents-layout` browser E2E |
| Build separation and delivery budgets | Both builds; Lite/self-hosted guards |

Browser checks must include actual SVG/PNG rendering and keyboard interaction,
not jsdom sizing assertions. Native Print/PDF dialogs, assistive technology,
physical touch, zoom/history breadth and quota/crash durability still require
explicit manual evidence; green automation is not certification. Parent review
findings remain open where that evidence or consumer breadth is incomplete.
Authentication, Defaults and catalogue required/optional cues must follow the
shared rule above; remaining migrations are not intentional exceptions merely
because their current markup differs.

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
