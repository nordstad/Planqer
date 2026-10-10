# 3D model / STEP cutlists

Start from the model you already designed instead of typing a part list.
Route: `/model-cutlist`.

![Model cutlist upload](../assets/screenshots/model-cutlist.png)

## Supported files

| Format | What you get |
| --- | --- |
| **STL** | Every solid in the file, split out and measured. |
| **STEP / STP** | The same, plus real component names, materials, and assembly hierarchy — because STEP carries that metadata and STL doesn't. |

Files up to 50 MB. Planqer works in millimetres; the file's own declared unit
is used if it has one.

## Workflow

1. Drop or browse to your file and click **Read the model**.
2. Planqer measures every solid, classifies each as a board-shaped or
   sheet-shaped part, and groups them into cutlists by size.
3. Review the cutlists. For each one you can rename it, choose a material
   (or leave it as *Not specified*), and expand the list of lengths or sizes
   it contains. Untick any you don't want.
4. Either hand one cutlist off on its own with **Plan alone** — the parts and
   the chosen material arrive pre-filled on the [board](board-cutting.md) or
   [sheet](sheet-cutting.md) page — or plan the selected cutlists together.
5. On the save step every cutlist has its own stock lengths (or sheet size),
   cut width and optional prices. **Apply to all board groups** and **Apply to
   all sheet groups** copy one cutlist's stock, cut width and prices to the
   others. Prices are never required: without them a cutlist is planned for
   the least waste; with a price on every length (or the sheet) the saved
   plan carries its cost.
6. Pick or create a project — a new project is pre-named after the model file —
   and save. A link takes you straight to that project.

!!! note "Uploading doesn't need an account"
    Reading and extracting a model works without signing in. Planning and
    saving the resulting cutlist does.

## Limits

- Up to 50 MB per file.
- Splitting relies on the model being composed of separate solids/bodies —
  a single fused solid won't be split into its logical parts.
