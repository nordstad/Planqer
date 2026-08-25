# 3D model / STEP cutlists

Start from the model you already designed instead of typing a part list.
Route: `/model-cutlist`.

![Model cutlist upload](../assets/screenshots/model-cutlist.png)

## Supported files

| Format | What you get |
| --- | --- |
| **STL** | Every solid in the file, split out and measured. |
| **STEP / STP** | The same, plus real component names, materials, and assembly hierarchy — because STEP carries that metadata and STL doesn't. |

Files up to 50 MB. Units are selectable on upload (mm, cm, m, in, ft) and
converted to millimetres internally.

## Workflow

1. Drop or browse to your file and click **Read the model**.
2. Planqer measures every solid, classifies each as a board-shaped or
   sheet-shaped part, and groups them into cutlists by size.
3. Pick the cutlist(s) you want and hand them off to the
   [board](board-cutting.md) or [sheet](sheet-cutting.md) optimizer — the
   parts arrive pre-filled.
4. Optionally save the read model's cutlist for later, the same way a
   board/sheet plan is saved.

!!! note "Uploading doesn't need an account"
    Reading and extracting a model works without signing in. Planning and
    saving the resulting cutlist does.

## Limits

- Up to 50 MB per file.
- Splitting relies on the model being composed of separate solids/bodies —
  a single fused solid won't be split into its logical parts.
