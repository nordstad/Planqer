"""
2D Sheet cutting visualization system using SVG.
Generates visual layouts for sheet material optimization results.
"""

import base64
from xml.sax.saxutils import escape
from .visualization_constants import get_css_styles


class SheetSVGVisualizer:
    """SVG-based sheet cutting diagram generator."""
    
    def __init__(self):
        # Every part is paper with an ink rule and its own printed size; each
        # part *type* also gets one of these 8 muted tones (cycling past 8
        # types), so the same part is easy to spot across sheets — kept
        # desaturated and clear of amber/red so it never reads as the accent
        # or a kerf mark.
        self.colors = [
            '#c7d9c0', '#bcd9d3', '#c0d3e0', '#c7c9e0',
            '#d6c7dd', '#ddc7d0', '#d9d3b8', '#b8d0c9',
        ]

    def _assign_colors_to_parts(self, sheets: list) -> dict[str, str]:
        """Assign one color per part type, grouping instances of the same
        part (sheet_optimization builds each instance's id as f"{type}_{n}")
        under their shared type name."""
        type_names = []
        seen = set()
        for sheet in sheets:
            sheet_dict = sheet.__dict__ if hasattr(sheet, '__dict__') else sheet
            for part in sheet_dict.get('parts', []):
                type_name = part['part_id'].rsplit('_', 1)[0]
                if type_name not in seen:
                    seen.add(type_name)
                    type_names.append(type_name)
        return {name: self.colors[i % len(self.colors)] for i, name in enumerate(type_names)}
    
    def _create_svg_header(self, width: int, height: int) -> str:
        """Create SVG document header."""
        return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" 
     xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
{get_css_styles('sheet')}
    </style>
  </defs>
  <rect width="100%" height="100%" fill="#ecebe4"/>
'''
    
    def _create_sheet_layout(self, sheet_data, sheet_index: int, x_offset: int, y_offset: int, scale: float, part_colors: dict[str, str]) -> str:
        """Create SVG elements for a single sheet layout."""
        svg_elements = []
        
        sheet_width = sheet_data['width'] * scale
        sheet_height = sheet_data['height'] * scale
        
        # Sheet title
        svg_elements.append(f'''
        <text x="{x_offset}" y="{y_offset - 10}" class="sheet-title">Sheet {sheet_index + 1}</text>
        ''')
        
        # Sheet outline (positioned below the info text)
        sheet_y_pos = y_offset + 25  # Move sheet down to make room for info text
        svg_elements.append(f'''
        <rect x="{x_offset}" y="{sheet_y_pos}" width="{sheet_width}" height="{sheet_height}" 
              fill="#ecebe4" stroke="#16150f" stroke-width="2"/>
        ''')
        
        # Parts
        for i, part in enumerate(sheet_data['parts']):
            part_x = x_offset + part['x'] * scale
            part_y = sheet_y_pos + part['y'] * scale
            part_width = part['width'] * scale
            part_height = part['height'] * scale
            color = part_colors[part['part_id'].rsplit('_', 1)[0]]
            
            # Part rectangle
            svg_elements.append(f'''
            <rect x="{part_x}" y="{part_y}" width="{part_width}" height="{part_height}" 
                  fill="{color}" stroke="#16150f" stroke-width="1" opacity="1"/>
            ''')
            
            # Part label
            label_x = part_x + part_width / 2
            label_y = part_y + part_height / 2
            full_part_name = part['part_id'].replace('_', ' ')  # Full name with spaces
            
            if part_width > 30 and part_height > 20:  # Only show label if part is large enough
                font_class = "part-label" if part_width > 60 else "part-label-small"
                
                # For larger parts, try to fit full name; for smaller parts, use shortened version
                if part_width > 80 and part_height > 40:
                    # Large enough for full name
                    label_text = full_part_name
                elif part_width > 50:
                    # Medium size - use full name but smaller font
                    label_text = full_part_name
                    font_class = "part-label-small"
                else:
                    # Small size - use first word only
                    label_text = part['part_id'].split('_')[0]
                
                svg_elements.append(f'''
                <text x="{label_x}" y="{label_y}" class="{font_class}" text-anchor="middle" dominant-baseline="middle">{label_text}</text>
                ''')
                
                # Add rotation indicator if rotated
                if part.get('rotated', False):
                    svg_elements.append(f'''
                    <text x="{label_x}" y="{label_y + 12}" class="part-label-small" text-anchor="middle" dominant-baseline="middle">R</text>
                    ''')
        
        # Sheet info - positioned under the sheet title
        efficiency = sheet_data.get('efficiency', 0)
        parts_count = len(sheet_data['parts'])
        svg_elements.append(f'''
        <text x="{x_offset}" y="{y_offset + 15}" class="sheet-info">
            {efficiency:.1f}% efficient, {parts_count} parts
        </text>
        ''')
        
        return ''.join(svg_elements)
    
    def _create_header_section(self, width: int, project_name: str = None,
                              total_sheets: int = 0, efficiency: float = 0,
                              total_waste: float = 0) -> str:
        """Create header with the job name, so a downloaded or printed image
        can still be told apart from another once it has left the page that
        was showing the name above it."""
        if not project_name:
            return ''

        return f'''
        <text x="50" y="16" class="figure-caption" text-anchor="start">{escape(project_name)}</text>
        '''
    
    def generate_sheet_visualization(self, optimization_result, project_name: str = None) -> str:
        """Generate complete SVG visualization for sheet cutting results."""
        if not optimization_result or not optimization_result.get('sheets'):
            return self._create_empty_svg()
        
        sheets = optimization_result['sheets']
        total_sheets = len(sheets)
        
        # Calculate layout dimensions - handle both dict and object formats
        max_sheet_width = 0
        max_sheet_height = 0
        
        for sheet in sheets:
            if hasattr(sheet, '__dict__'):
                sheet_dict = sheet.__dict__
            else:
                sheet_dict = sheet
                
            width = sheet_dict.get('sheet_width', 0)
            height = sheet_dict.get('sheet_height', 0)
            max_sheet_width = max(max_sheet_width, width)
            max_sheet_height = max(max_sheet_height, height)
        
        if max_sheet_width == 0 or max_sheet_height == 0:
            return self._create_empty_svg()
        
        # Scale to fit nicely (target around 800px width)
        scale = min(800 / max_sheet_width, 600 / max_sheet_height, 1.0)
        
        # Calculate SVG dimensions
        scaled_sheet_width = max_sheet_width * scale
        scaled_sheet_height = max_sheet_height * scale
        
        # Layout sheets in a grid
        sheets_per_row = min(3, total_sheets)  # Max 3 sheets per row
        rows = (total_sheets + sheets_per_row - 1) // sheets_per_row
        
        margin = 50
        sheet_spacing = 40
        header_height = 40 if project_name else 20
        
        total_width = (scaled_sheet_width + sheet_spacing) * sheets_per_row + margin * 2
        total_height = header_height + (scaled_sheet_height + sheet_spacing + 75) * rows + margin  # Extra space for efficiency text
        
        # Build SVG
        svg_parts = [self._create_svg_header(int(total_width), int(total_height))]
        svg_parts.append(self._create_header_section(
            int(total_width), project_name, total_sheets, 
            optimization_result.get('overall_efficiency', 0),
            optimization_result.get('total_waste_area', 0)
        ))
        
        part_colors = self._assign_colors_to_parts(sheets)

        # Add sheet layouts
        for i, sheet in enumerate(sheets):
            row = i // sheets_per_row
            col = i % sheets_per_row
            
            x_offset = margin + col * (scaled_sheet_width + sheet_spacing)
            y_offset = header_height + row * (scaled_sheet_height + sheet_spacing + 75)
            
            # Handle both dict and object formats
            if hasattr(sheet, '__dict__'):
                sheet_dict = sheet.__dict__
            else:
                sheet_dict = sheet
            
            # Convert sheet format for visualization
            sheet_data = {
                'width': sheet_dict.get('sheet_width', 0),
                'height': sheet_dict.get('sheet_height', 0), 
                'efficiency': sheet_dict.get('efficiency', 0),
                'parts': sheet_dict.get('parts', [])
            }
            
            svg_parts.append(self._create_sheet_layout(
                sheet_data, i, int(x_offset), int(y_offset), scale, part_colors
            ))
        
        svg_parts.append('</svg>')
        return ''.join(svg_parts)
    
    def _create_empty_svg(self) -> str:
        """Create empty SVG for error cases."""
        return '''<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="200" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ecebe4"/>
  <text x="200" y="100" text-anchor="middle" font-family="{FALLBACK_FONT}" 
        font-size="16" fill="#666">No sheet layout available</text>
</svg>'''
    
    def svg_to_base64(self, svg_content: str) -> str:
        """Convert SVG to base64 data URL."""
        svg_b64 = base64.b64encode(svg_content.encode('utf-8')).decode('utf-8')
        return f"data:image/svg+xml;base64,{svg_b64}"


def generate_sheet_cutting_visualization(optimization_result, project_name: str = None) -> str:
    """
    Generate sheet cutting visualization using SVG system.
    Compatible with existing API response format.
    """
    visualizer = SheetSVGVisualizer()
    svg_content = visualizer.generate_sheet_visualization(optimization_result, project_name)
    return visualizer.svg_to_base64(svg_content)


def generate_saved_sheet_diagram(optimization_result, project_name: str = None) -> str:
    """
    Generate the SVG data URL stored with a saved sheet project. See
    svg_visualization.generate_saved_diagram for why there is no PNG here.
    """
    visualizer = SheetSVGVisualizer()
    svg_content = visualizer.generate_sheet_visualization(optimization_result, project_name)
    return visualizer.svg_to_base64(svg_content)