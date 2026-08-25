"""
Modern SVG-based visualization system for cutting diagrams.
Replaces matplotlib with pixel-perfect precision and better performance.
"""

import base64
from xml.sax.saxutils import escape
from .visualization_constants import get_css_styles


class SVGCuttingVisualizer:
    """Modern SVG-based cutting diagram generator."""
    
    def __init__(self):
        # A cut cell is paper with an ink rule and its length printed inside;
        # offcut is hatched, kerf is revision red. Each unique part length also
        # gets one of these 8 muted tones (cycling past 8 lengths) so the same
        # part is easy to spot across boards — kept desaturated and clear of
        # amber/red so it never reads as the accent or a kerf mark.
        self.colors = [
            '#c7d9c0', '#bcd9d3', '#c0d3e0', '#c7c9e0',
            '#d6c7dd', '#ddc7d0', '#d9d3b8', '#b8d0c9',
        ]
        
    def _assign_colors_to_parts(self, cut_list: list[list[float]]) -> dict[float, str]:
        """Assign unique colors to each part length."""
        unique_lengths = sorted({round(length, 2) for board in cut_list for length in board})
        return {length: self.colors[i % len(self.colors)] for i, length in enumerate(unique_lengths)}
    
    def _create_svg_header(self, width: int, height: int) -> str:
        """Create SVG document header with responsive viewBox."""
        return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" 
     xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="offcut" width="6" height="6" patternUnits="userSpaceOnUse"
             patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#ecebe4"/>
      <line x1="0" y1="0" x2="0" y2="6" stroke="#8f8d80" stroke-width="1"/>
    </pattern>
    <style>
{get_css_styles('cutting')}
    </style>
  </defs>
  <rect width="100%" height="100%" fill="#ecebe4"/>
'''
    
    def _create_board_row(self, board: list[float], board_length: float, 
                         y_pos: int, part_colors: dict[float, str], 
                         saw_blade_width: float, scale: float, 
                         board_index: int) -> str:
        """Create SVG elements for a single board row showing the optimal cutting pattern."""
        svg_elements = []
        row_height = 60
        left_margin = 80
        
        # Board label positioned consistently above the board rectangle
        label_y = y_pos - 12  # Fixed distance above board
        svg_elements.append(f'''
        <text x="{left_margin}" y="{label_y}" class="board-label" text-anchor="start">B{board_index + 1} · {board_length:.0f} MM</text>
        ''')
        
        # Board outline (full length)
        board_width = board_length * scale
        svg_elements.append(f'''
        <rect x="{left_margin}" y="{y_pos}" width="{board_width}" height="{row_height}" 
              fill="none" stroke="#16150f" stroke-width="2"/>
        ''')
        
        # Parts and kerf cuts - show the actual cutting pattern
        x_pos = left_margin
        for idx, part in enumerate(board):
            part_width = part * scale
            color = part_colors[round(part, 2)]
            label = f"{part:.0f}"
            
            # Part rectangle with proper scaling
            svg_elements.append(f'''
            <rect x="{x_pos}" y="{y_pos}" width="{part_width}" height="{row_height}" 
                  fill="{color}" stroke="#16150f" stroke-width="1" opacity="1"/>
            ''')
            
            # Part label (rotate if too narrow)
            text_x = x_pos + part_width / 2
            text_y = y_pos + row_height / 2 + 3
            
            if part_width < 13:
                # Too narrow to letter without bleeding past the rules. The page's
                # CUT ORDER table lists every cut in order, so nothing is lost.
                pass
            elif part_width < 40:  # set on its side, but only where it still fits
                svg_elements.append(f'''
                <text x="{text_x}" y="{text_y}" class="part-label-small" 
                      text-anchor="middle" transform="rotate(-90 {text_x} {text_y})">{label}</text>
                ''')
            else:
                svg_elements.append(f'''
                <text x="{text_x}" y="{text_y}" class="part-label" text-anchor="middle">{label}</text>
                ''')
            
            x_pos += part_width
            
            # Add kerf cut visualization (gray line) between parts
            if idx < len(board) - 1:
                kerf_width = saw_blade_width * scale
                svg_elements.append(f'''
                <rect x="{x_pos}" y="{y_pos}" width="{kerf_width}" height="{row_height}" 
                      fill="#cc2200" stroke="none"/>
                ''')
                x_pos += kerf_width
        
        # Show remaining waste area if any
        used_length = sum(board) + saw_blade_width * (len(board) - 1 if len(board) > 1 else 0)
        waste_length = board_length - used_length
        if waste_length > 0:
            waste_width = waste_length * scale
            # Light gray area for waste
            svg_elements.append(f'''
            <rect x="{x_pos}" y="{y_pos}" width="{waste_width}" height="{row_height}" 
                  fill="url(#offcut)" stroke="#16150f" stroke-width="1" opacity="1"/>
            ''')
            
            # Add "WASTE" label if waste area is wide enough
            if waste_width > 30:
                waste_text_x = x_pos + waste_width / 2
                waste_text_y = y_pos + row_height / 2 + 3
                svg_elements.append(f'''
                <text x="{waste_text_x}" y="{waste_text_y}" class="part-label-small" 
                      text-anchor="middle" fill="#6f6d61">OFFCUT</text>
                ''')
        
        return ''.join(svg_elements)
    
    def _create_header_section(self, width: int, project_name: str = None,
                              board_lengths = None, total_waste: float = 0, is_mixed: bool = False) -> str:
        """Create header with the job name, so a downloaded or printed image
        can still be told apart from another once it has left the page that
        was showing the name above it."""
        if not project_name:
            return ''

        return f'''
        <text x="80" y="16" class="figure-caption" text-anchor="start">{escape(project_name)}</text>
        '''
    
    def _create_legend(self, part_colors: dict[float, str], width: int, height: int) -> str:
        """Create color legend for parts."""
        svg_elements = []
        legend_y = height - 40
        items_per_row = 5
        
        # Calculate total width needed for all items to center them
        total_items = len(part_colors)
        items_per_row = min(total_items, items_per_row)
        item_spacing = 120  # Width per item including text
        
        for idx, (length, color) in enumerate(part_colors.items()):
            col = idx % items_per_row
            row = idx // items_per_row
            
            # For multi-row legends, recalculate centering for each row
            items_in_current_row = min(items_per_row, total_items - (row * items_per_row))
            row_width = items_in_current_row * item_spacing
            row_start_x = (width - row_width) // 2
            
            x_pos = row_start_x + (col * item_spacing)
            y_pos = legend_y + row * 20
            
            # Color square
            svg_elements.append(f'''
            <rect x="{x_pos}" y="{y_pos - 8}" width="12" height="12" fill="{color}" stroke="#16150f"/>
            ''')
            
            # Label
            svg_elements.append(f'''
            <text x="{x_pos + 18}" y="{y_pos}" class="legend-text">{length:.0f}</text>
            ''')
        
        return ''.join(svg_elements)
    
    def generate_svg_cut_list(self, cut_list: list[list[float]], board_length, 
                             saw_blade_width: float = 3.0, project_name: str = None) -> str:
        """Generate complete SVG cutting diagram."""
        if not cut_list:
            return self._create_empty_svg()
        
        # Handle both single board length and mixed board lengths
        if isinstance(board_length, (int, float)):
            # Single board length - all boards are the same length
            board_lengths = [board_length] * len(cut_list)
            is_mixed_lengths = False
        elif isinstance(board_length, (list, tuple)):
            # Mixed board lengths - each board has its own length
            board_lengths = list(board_length)
            is_mixed_lengths = len(set(board_lengths)) > 1
            if len(board_lengths) != len(cut_list):
                # Fallback: use first board length for all if mismatch
                board_lengths = [board_lengths[0] if board_lengths else 1000] * len(cut_list)
                is_mixed_lengths = False
        else:
            # Fallback to default
            board_lengths = [1000] * len(cut_list)
            is_mixed_lengths = False
        
        # Calculate dimensions
        num_boards = len(cut_list)
        # Scale to fit nicely in viewport - adjust based on max board length
        max_board_length = max(max(board_lengths), 1000)  # Minimum scale reference
        scale = min(800 / max_board_length, 1.0)  # Scale to fit in ~800px width max
        
        width = 1000
        header_height = 22  # just enough air for the one-line job-name caption
        row_height = 95  # Increased spacing for better visual separation between boards
        legend_height = 10  # no legend: each cell already prints its own length
        # Add extra space for board labels positioned above each board
        label_padding = 25
        height = header_height + (num_boards * row_height) + legend_height + label_padding
        
        # Assign colors
        part_colors = self._assign_colors_to_parts(cut_list)
        
        # Calculate total waste
        total_waste = 0.0
        for idx, board in enumerate(cut_list):
            used = sum(board) + saw_blade_width * (len(board) - 1 if len(board) > 1 else 0)
            current_board_length = board_lengths[idx]
            waste = current_board_length - used
            total_waste += waste
        
        # Build SVG
        svg_parts = [self._create_svg_header(width, height)]
        svg_parts.append(self._create_header_section(width, project_name, board_lengths, total_waste, is_mixed_lengths))
        
        # Add board rows with space for labels above
        current_y = header_height + 18  # room for the first board label
        for idx, board in enumerate(cut_list):
            current_board_length = board_lengths[idx]
            svg_parts.append(self._create_board_row(
                board, current_board_length, current_y, part_colors, 
                saw_blade_width, scale, idx
            ))
            current_y += row_height
        
        # Add legend
        svg_parts.append('</svg>')
        
        return ''.join(svg_parts)
    
    def _create_empty_svg(self) -> str:
        """Create empty SVG for error cases."""
        return '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="200" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ecebe4"/>
  <text x="200" y="100" text-anchor="middle" font-family="{FALLBACK_FONT}" 
        font-size="16" fill="#6f6d61">No cutting plan yet</text>
</svg>'''
    

def generate_cut_list_image(cut_list: list[list[float]], board_length,
                           output_file: str, saw_blade_width: float = 3.0,
                           project_name: str = None) -> str:
    """
    Generate cutting diagram using modern SVG system.
    Maintains compatibility with existing matplotlib function signature.
    """
    visualizer = SVGCuttingVisualizer()
    
    # Generate SVG content
    svg_content = visualizer.generate_svg_cut_list(
        cut_list, board_length, saw_blade_width, project_name
    )
    
    # For API endpoints, return as an SVG data URL. Kept as SVG rather than
    # rasterized: the diagram's text and rules are drawn from this system's own
    # CSS, and a PNG fallback here would silently swap that in for every caller.
    if output_file.startswith('data:') or 'temp' in output_file:
        svg_b64 = base64.b64encode(svg_content.encode('utf-8')).decode('utf-8')
        return f"data:image/svg+xml;base64,{svg_b64}"

    # For file output, save SVG directly
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(svg_content)
        return output_file
    except Exception as e:
        print(f"Failed to save SVG file: {e}")
        svg_b64 = base64.b64encode(svg_content.encode('utf-8')).decode('utf-8')
        return f"data:image/svg+xml;base64,{svg_b64}"


def generate_saved_diagram(cut_list: list[list[float]], board_length,
                           saw_blade_width: float = 3.0,
                           project_name: str = None) -> str:
    """
    Generate the SVG data URL stored with a saved project.

    This used to return an (SVG, PNG) pair, rasterizing the second half with
    CairoSVG. CairoSVG needs the native libcairo on the host, which pip cannot
    provide — so on any install without it the "PNG" was an SVG data URL under
    a PNG name, and the download endpoint refused to serve it. The frontend now
    rasterizes in the browser, which needs nothing installed anywhere, so
    libcairo is no longer a dependency of this project on any platform.
    """
    visualizer = SVGCuttingVisualizer()
    svg_content = visualizer.generate_svg_cut_list(cut_list, board_length, saw_blade_width, project_name)

    svg_b64 = base64.b64encode(svg_content.encode('utf-8')).decode('utf-8')
    return f"data:image/svg+xml;base64,{svg_b64}"