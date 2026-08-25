# Planqer

Planqer is a self-hosted cutting optimization platform for woodworking and
fabrication projects. Give it a part list — or a 3D model you already
designed — and it works out the fewest boards or sheets to buy, and exactly
where every cut goes.

![Planqer homepage](assets/screenshots/homepage.png)

## Why Planqer

- **Self-hosted and private.** Runs on your own machine or homelab via Docker
  Compose. No cloud account, no analytics, no tracking.
- **Kerf-aware.** Every plan subtracts the material your saw blade actually
  removes, so the numbers hold up at the saw.
- **Four ways in.** Type a part list for boards or sheets, or upload an STL or
  STEP file and let Planqer measure the parts for you.
- **AI-ready.** A REST API and an MCP server let an AI assistant drive the
  optimizer in natural language.

## Where to start

<div class="grid cards" markdown>

- :material-rocket-launch:{ .lg .middle } **New here?**

    ---

    Install Planqer with Docker Compose and plan your first cut.

    [:octicons-arrow-right-24: Getting started](getting-started.md)

- :material-ruler:{ .lg .middle } **Cutting boards or lumber?**

    ---

    Turn a part list into a board-by-board cutting plan.

    [:octicons-arrow-right-24: Board cutting](guide/board-cutting.md)

- :material-view-grid:{ .lg .middle } **Cutting sheet goods?**

    ---

    Nest rectangular parts on plywood, MDF, metal or acrylic.

    [:octicons-arrow-right-24: Sheet cutting](guide/sheet-cutting.md)

- :material-cube-outline:{ .lg .middle } **Already have a 3D model?**

    ---

    Upload an STL or STEP file and skip typing part lists by hand.

    [:octicons-arrow-right-24: 3D model / STEP cutlists](guide/model-cutlist.md)

</div>

## What every optimizer gives you

| | |
| --- | --- |
| **Cut plan** | A diagram drawn to one scale, with every cut in the order you make it. |
| **Kerf** | Blade width subtracted at every cut, not estimated afterward. |
| **Offcut / waste** | What's left once the parts and the blade have taken theirs. |
| **Cost** | Optional: price per stock length, totalled for the plan. |
| **Projects** | Saved on your own instance, under your own account. |
| **Units** | Millimetres throughout. No imperial support. |

## Project links

- Source: [github.com/borkempire/planqer](https://github.com/borkempire/planqer)
- License: [MIT](https://opensource.org/licenses/MIT)
- Issues and feature requests: use the repository's issue tracker.
