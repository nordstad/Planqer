"""
Shared constants for visualization modules to avoid duplication.
"""

# Font families used across visualizations
SYSTEM_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
NARROW_FONT_STACK = f"'Archivo Narrow', 'Helvetica Neue', {SYSTEM_FONT_STACK}"
FALLBACK_FONT = "Arial, sans-serif"

# Color constants
COLORS = {
    "primary_text": "#16150f",
    "secondary_text": "#4a483d", 
    "light_text": "#6f6d61",
    "dark_text": "#16150f",
    "white": "#ecebe4",
}

# SVG CSS styles for different visualization types
SVG_STYLES = {
    "cutting": {
        "figure_caption": f"font-family: {NARROW_FONT_STACK}; font-size: 11px; font-weight: 700; fill: {COLORS['primary_text']}; letter-spacing: 0.16em;",
        "board_label": f"font-family: {NARROW_FONT_STACK}; font-size: 11px; font-weight: 700; fill: {COLORS['light_text']}; letter-spacing: 0.14em;",
        "part_label": f"font-family: {SYSTEM_FONT_STACK}; font-size: 10px; font-weight: bold; fill: {COLORS['dark_text']};",
        "part_label_small": f"font-family: {SYSTEM_FONT_STACK}; font-size: 8px; font-weight: bold; fill: {COLORS['dark_text']};",
        "header_text": f"font-family: {NARROW_FONT_STACK}; font-size: 11px; font-weight: 700; fill: {COLORS['primary_text']}; letter-spacing: 0.16em;",
        "legend_text": f"font-family: {NARROW_FONT_STACK}; font-size: 9px; fill: {COLORS['light_text']}; letter-spacing: 0.14em;",
        "checkbox": f"font-family: {SYSTEM_FONT_STACK}; font-size: 14px; fill: {COLORS['light_text']};",
    },
    "sheet": {
        "figure_caption": f"font-family: {NARROW_FONT_STACK}; font-size: 11px; font-weight: 700; fill: {COLORS['primary_text']}; letter-spacing: 0.16em;",
        "sheet_title": f"font-family: {NARROW_FONT_STACK}; font-size: 16px; font-weight: 600; fill: {COLORS['primary_text']};",
        "part_label": f"font-family: {SYSTEM_FONT_STACK}; font-size: 10px; font-weight: bold; fill: {COLORS['primary_text']};",
        "part_label_small": f"font-family: {SYSTEM_FONT_STACK}; font-size: 8px; font-weight: bold; fill: {COLORS['primary_text']};",
        "sheet_info": f"font-family: {SYSTEM_FONT_STACK}; font-size: 12px; fill: {COLORS['secondary_text']};",
        "legend_text": f"font-family: {SYSTEM_FONT_STACK}; font-size: 9px; fill: {COLORS['light_text']};",
    }
}

def get_css_styles(visualization_type: str) -> str:
    """Get CSS styles for a specific visualization type."""
    if visualization_type not in SVG_STYLES:
        raise ValueError(f"Unknown visualization type: {visualization_type}")
    
    styles = SVG_STYLES[visualization_type]
    css_rules = []
    
    for class_name, style in styles.items():
        css_class = class_name.replace('_', '-')  # Convert snake_case to kebab-case
        css_rules.append(f"      .{css_class} {{ {style} }}")
    
    return "\n".join(css_rules)