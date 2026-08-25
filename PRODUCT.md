# Product

## Platform

web

## Users

**Primary: hobbyist woodworkers and makers**, planning a build in a home shop or
garage. They are about to buy material at a retailer with their own money, they
have a list of parts (often from a model they designed themselves), and they
want to know how many boards or sheets to buy and where to cut them.

**Secondary: small professional shops** — joinery, carpentry, fabrication —
cutting to a client's order with real margins. Planqer serves them, but when a
design decision splits the two, it favors the hobbyist: less shop-floor jargon,
more guidance, no assumption that the user owns CAD or shop-management software.

Design consequence: the user is frequently standing in a workshop or a lumber
aisle, not sitting at a desk. Confidence in the number matters more than
density of numbers.

## Product Purpose

Planqer turns a list of parts — or a 3D model — into a cutting plan that
minimizes wasted material, and shows where every cut goes. Success is a user who
buys the right amount of material and makes the cuts without re-planning at the
saw.

## Positioning

Two claims a neighboring cutting optimizer could not truthfully copy:

1. **Model → cutlist.** Upload an STL or a STEP file and Planqer extracts the
   individual components with dimensions, and for STEP also real component
   names, materials, and assembly hierarchy. Competing optimizers start from a
   list the user types in; Planqer starts from the thing the user designed.
2. **Self-hosted and private.** The whole stack runs on the user's own machine
   or homelab via Docker Compose. Any account is a
   **local** account on that same instance — never a cloud account — and the
   designs never go to someone else's server. Signing in is required to plan
   and save a cutlist, but that account still lives entirely on the same
   self-hosted instance; there is no cloud tier to opt into or avoid.

## Operating Context

- Users arrive with either a part list in their head/on paper, or a model file
  exported from their CAD tool (STL, STEP/STP).
- Materials are metric, in millimeters: boards up to 6000 mm, sheet stock in
  standard panel sizes (e.g. 1220 × 2440 mm).
- Kerf (saw blade width, typically ~3 mm) is a real physical loss the plan must
  account for; a plan that ignores it is wrong at the saw.
- The output gets used away from the computer — read off a screen in a workshop
  or exported as a diagram image.
- Board and sheet cutting require a local account to plan and save a cutlist
  (uploading and extracting a model on `/3d-cutlist` and `/step-cutlist` does
  not). Running a plan computes and returns it; **keeping** it is a deliberate
  step where the user names it and picks its project, and only then does it
  persist server-side on the same self-hosted instance and follow them across
  browsers and devices. Runs were previously auto-saved under a timestamp name,
  which meant every re-run left another unnamed record behind.
- An AI assistant can also drive the optimizer over MCP, in natural language,
  instead of the user filling in the form.

## Capabilities and Constraints

Four optimizers, one per route:

- `/cutting` — 1D linear cutting (boards, lumber, bars, pipe).
- `/sheet-cutting` — 2D rectangular packing (plywood, MDF, metal, glass,
  fabric), with optional 90° rotation and multiple strategies (Bottom-Left
  Fill, Best Fit, Genetic, Guillotine) plus auto-selection.
- `/3d-cutlist` — STL upload, component splitting, board/sheet classification,
  hand-off to an optimizer.
- `/step-cutlist` — STEP/STP upload with names, materials, assembly structure.

Also: `/help` (in-app documentation), cost analysis with bulk-discount pricing,
generated cutting diagrams (PNG/SVG), waste and efficiency metrics, local
project save/load, optional local accounts with server-side project sync and
an admin panel for managing the instance's own users, a day/night mode switch
(day is the default edition).

Constraints:

- Metric only; millimeters throughout. No imperial support.
- Limits from `backend/config.yaml`: part and board length max 6000 mm. API
  limits: 1000 parts, 1000 per part quantity. Rate limit 10 req/min.
- Optimization is heuristic, not proven-optimal; results are good plans, not
  guaranteed minima.
- Export is PNG/SVG diagrams only. CSV and PDF are **not** implemented. The
  PNG is rasterized from the SVG in the browser, so export needs nothing
  installed on the host.
- **Docker Compose is the only supported install.** Running the services
  directly from source is a contributor path, not a documented way to use
  Planqer — it is the only way to keep one tested configuration that behaves
  the same on Linux, macOS and Windows. There is no Helm chart; the empty
  `helm-chart/` directory is local scaffolding and has never been in the repo.
- No backend dependency requires a native system library. This is a standing
  constraint, not an accident: one that does (cairosvg did, and was removed)
  turns installing into a per-OS problem and makes contributors' machines
  diverge from the image.
- Free, MIT-licensed, no cloud accounts, no analytics, no data collection.
  Accounts, where used, are local to the user's own self-hosted instance.

## Brand Commitments

- **The product is named Planqer, everywhere — one name, no exceptions.** It
  was renamed from an earlier working title, and for a while that title was
  allowed to survive "only in code": environment variables, package names,
  Prometheus metric names, the license, alert rule names. That concession was
  withdrawn before the repo went public, because two names for one product is
  something every contributor has to learn and nobody benefits from. Env vars
  are `PLANQER_*`, metrics are `planqer_*`, the MCP package is
  `planqer-mcp-server`. The old title is not to be reintroduced anywhere,
  code included — and note that a global find-and-replace will happily rewrite
  a sentence like this one, so name it in a commit message, not in a file.
- Existing assets: `frontend/public/planqer_icon*.png`,
  `planqer-logo.png`, `planqer-logo-text.png`, `planqer-text-logo-cropped.png`.
  The saw (🪚) is the established motif.
- Sweden is **not** the audience. "Made for Swedish Lumber" in the footer and
  the Swedish pricing/market framing in the help pages reflect where the author
  lives, not a product decision — treat both as copy to remove, and do not
  reintroduce a national market as positioning.

## Evidence on Hand

Real:

- Working optimizers with generated diagrams — the product can demonstrate
  itself with actual runs; solver output (boards used, waste, efficiency per
  plan) is reproducible and is the honest source for any efficiency claim.
- Sample payloads and demo projects in the MCP server and `example/`.
- MIT license, open-source repository.

Absent — must not be fabricated:

- **No measured performance claims.** The homepage figures "98%+ Material
  Efficiency", "50%+ Waste Reduction", "75%+ Time Savings" and "tested across
  thousands of cutting projects" are placeholders that were never measured.
  They are to be removed, and no future surface may restate them or invent
  replacements.
- No users, customers, testimonials, case studies, press, or download counts.
- No pricing, plans, or commercial offering.
- No photography of real projects made with Planqer.

## Product Principles

1. **The plan must survive the workshop.** Every result has to be readable and
   trustworthy away from the desk, where the user can't re-check the inputs.
2. **Physical truth over clean math.** Kerf, real board sizes, and material cost
   are the point; never present a plan that quietly ignores them.
3. **Start from what the user already made.** The model file is the shortest
   path to a cutlist — treat manual entry as the fallback, not the front door.
4. **Earn trust by showing the work.** Waste, efficiency, and cost are shown
   because the user is spending real money, and heuristics deserve scrutiny.
5. **Claim only what a run can prove.** With no users or benchmarks to cite,
   credibility comes from the demonstrable output, never from asserted numbers.

## Accessibility & Inclusion

No product-specific standard has been established. Note the operating context:
the interface is read in workshop lighting and often on a phone, so contrast and
touch-target quality carry more weight here than on a desk-bound tool.
