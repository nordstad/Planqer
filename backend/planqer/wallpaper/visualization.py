"""Small, self-contained SVG cut sheets for wallpaper plans."""

from xml.sax.saxutils import escape

_ENTITIES = {'"': "&quot;", "'": "&apos;"}


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
