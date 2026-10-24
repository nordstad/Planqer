"""Self-contained SVG output for wallpaper plan review and cutting."""

import base64
from xml.sax.saxutils import escape

_ENTITIES = {'"': "&quot;", "'": "&apos;"}


def render_plan_svg(room: dict, plan: dict, *, project_name: str) -> str:
    """Render the approved room plan without re-solving it.

    This compact review sheet is deliberately based on the stored strips and
    measurements, so dashboard, export and print always show the exact plan
    the user accepted.
    """
    walls = room.get("walls", [])
    strips = plan.get("strips", [])
    width, card_height, columns = 1000, 280, 2
    rows = max(1, (len(walls) + columns - 1) // columns)
    height = 100 + rows * card_height
    cards = []
    for index, wall in enumerate(walls):
        card_x = 30 + (index % columns) * 480
        card_y = 85 + (index // columns) * card_height
        wall_width = max(float(wall.get(key, 0)) for key in ("width_top", "width_middle", "width_bottom"))
        wall_height = max(float(wall.get(key, 0)) for key in ("height_left", "height_middle", "height_right"))
        if wall_width <= 0 or wall_height <= 0:
            continue
        drawing_x, drawing_y, drawing_width, drawing_height = card_x + 45, card_y + 35, 390, 160
        x_scale, y_scale = drawing_width / wall_width, drawing_height / wall_height
        wall_name = escape(str(wall.get("name", f"Wall {index + 1}")), _ENTITIES)
        profile = wall.get("profile", "rectangle")
        lower_left = wall_height - float(wall.get("height_left", wall_height)) if profile == "over_stairs" else 0
        lower_right = wall_height - float(wall.get("height_right", wall_height)) if profile == "over_stairs" else 0
        top_left = wall_height if profile == "over_stairs" else float(wall.get("height_left", wall_height))
        top_right = wall_height if profile == "over_stairs" else float(wall.get("height_right", wall_height))
        path = " ".join((
            f"M {drawing_x:.1f} {drawing_y + drawing_height - lower_left * y_scale:.1f}",
            f"L {drawing_x + drawing_width:.1f} {drawing_y + drawing_height - lower_right * y_scale:.1f}",
            f"L {drawing_x + drawing_width:.1f} {drawing_y + drawing_height - top_right * y_scale:.1f}",
            f"L {drawing_x:.1f} {drawing_y + drawing_height - top_left * y_scale:.1f} Z",
        ))
        clip_id = f"wall-{index}-clip"
        card = [
            f'<text x="{card_x}" y="{card_y + 16}" class="title">{wall_name}</text>',
            f'<defs><clipPath id="{clip_id}"><path d="{path}"/></clipPath></defs>',
            f'<path d="{path}" class="wall"/>',
        ]
        segments = (
            segment
            for strip in strips
            # Plans saved before connected strips have no segments.
            for segment in strip.get("segments") or [strip]
        )
        for segment in (item for item in segments if item.get("wall_index") == index):
            seam = drawing_x + float(segment["x_end"]) * x_scale
            card.append(f'<line x1="{seam:.1f}" y1="{drawing_y}" x2="{seam:.1f}" y2="{drawing_y + drawing_height}" class="seam" clip-path="url(#{clip_id})"/>')
        for cutout in wall.get("cutouts", []):
            x = drawing_x + float(cutout.get("x", 0)) * x_scale
            cutout_width = float(cutout.get("width", 0)) * x_scale
            cutout_height = float(cutout.get("height", 0)) * y_scale
            y = drawing_y + drawing_height - (float(cutout.get("y", 0)) * y_scale + cutout_height)
            label = escape(str(cutout.get("label") or cutout.get("kind", "opening")).replace("_", " "), _ENTITIES)
            card.extend((
                f'<rect x="{x:.1f}" y="{y:.1f}" width="{cutout_width:.1f}" height="{cutout_height:.1f}" class="opening"/>',
                f'<text x="{x + cutout_width / 2:.1f}" y="{y + cutout_height / 2:.1f}" text-anchor="middle" class="small">{label}</text>',
                f'<text x="{x + cutout_width / 2:.1f}" y="{y + cutout_height / 2 + 13:.1f}" text-anchor="middle" class="small">{round(float(cutout.get("width", 0)))} × {round(float(cutout.get("height", 0)))} mm</text>',
            ))
        card.extend((
            f'<text x="{drawing_x + drawing_width / 2}" y="{drawing_y + drawing_height + 20}" text-anchor="middle" class="small">width {round(wall_width)} mm · height {round(wall_height)} mm</text>',
            f'<text x="{drawing_x}" y="{drawing_y + drawing_height + 39}" class="small">Origin: {"local stair edge" if profile == "over_stairs" else "bottom-left"}</text>',
        ))
        cards.extend(card)
    title = escape(project_name, _ENTITIES)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<style>.title{{font:700 18px Arial,sans-serif;fill:#16150f}}.small{{font:12px Arial,sans-serif;fill:#5c594c}}.wall{{fill:#f2efe6;stroke:#16150f;stroke-width:2}}.opening{{fill:#fff;stroke:#16150f;stroke-width:1.5}}.seam{{stroke:#a34f18;stroke-width:1.5;stroke-dasharray:5 4}}</style>
<rect width="100%" height="100%" fill="#fafaf7"/><text x="30" y="38" class="title">{title}</text><text x="30" y="62" class="small">{plan.get("rolls_to_buy", "—")} rolls to buy · dimensioned wall elevations</text>{''.join(cards)}</svg>'''
    return f"data:image/svg+xml;base64,{base64.b64encode(svg.encode()).decode()}"


def render_piece_svg(piece: dict, *, wall_name: str = "Wall", repeat: float = 0) -> str:
    """Render one table-cut instruction with dimensions and pattern warning."""
    label = escape(str(piece["id"]), _ENTITIES)
    wall = escape(wall_name, _ENTITIES)
    length = round(piece["length"])
    phase = round(piece["phase"])
    repeat_note = f"Repeat {round(repeat)} mm · " if repeat else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420">
<style>text{{font-family:Arial,sans-serif;fill:#16150f}}.s{{font-size:14px}}.l{{font-size:22px;font-weight:bold}}.d{{stroke:#a34f18;stroke-width:2;stroke-dasharray:6 4}}</style>
<rect width="720" height="420" fill="#ecebe4"/><text x="36" y="42" class="l">{label} · {wall}</text><text x="650" y="42" class="l">UP ↑</text>
<rect x="180" y="82" width="280" height="240" fill="#e9e1d2" stroke="#16150f" stroke-width="2"/><line x1="150" y1="82" x2="150" y2="322" class="d"/>
<text x="36" y="214" class="s" transform="rotate(-90 36 214)">precut {length} mm</text><text x="180" y="350" class="s">phase {phase} mm · {repeat_note}visually align motif before cutting</text>
</svg>'''


def render_roll_svg(roll: dict, *, roll_length: float, repeat: float = 0) -> str:
    """Render the chronological roll sequence, including alignment gaps."""
    cuts = roll["cuts"]
    scale = 620 / roll_length
    shapes = ["<rect x=\"50\" y=\"70\" width=\"620\" height=\"76\" fill=\"#e9e1d2\" stroke=\"#16150f\"/>"]
    for cut in cuts:
        x, width = 50 + cut["start"] * scale, (cut["end"] - cut["start"]) * scale
        if cut["alignment_gap"]:
            gap_x = x - cut["alignment_gap"] * scale
            shapes.append(f'<rect x="{gap_x:.1f}" y="70" width="{cut["alignment_gap"] * scale:.1f}" height="76" fill="#f3d6c0"/>')
        shapes.append(f'<line x1="{x:.1f}" y1="70" x2="{x:.1f}" y2="146" stroke="#a34f18" stroke-width="2"/><text x="{x + width / 2:.1f}" y="112" text-anchor="middle" class="s">{escape(cut["piece_id"], _ENTITIES)}</text>')
    ruler = f" · repeat {round(repeat)} mm" if repeat else " · plain/free match"
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="720" height="190" viewBox="0 0 720 190"><style>text{{font-family:Arial,sans-serif;fill:#16150f}}.s{{font-size:13px}}.l{{font-size:20px;font-weight:bold}}</style><rect width="720" height="190" fill="#ecebe4"/><text x="50" y="38" class="l">Roll {roll["number"]}{ruler}</text>{"".join(shapes)}<text x="50" y="174" class="s">Orange gaps are pattern alignment waste or reusable offcut.</text></svg>'
