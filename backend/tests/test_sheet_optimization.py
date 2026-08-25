"""
Tests for sheet material optimization functionality.

This module tests the 2D bin packing algorithms and sheet optimization features
including the Bottom-Left Fill algorithm, rotation support, and waste calculation.
"""

import pytest
from planqer.sheet_optimization import (
    Rectangle,
    SheetLayout,
    expand_sheet_parts,
    bottom_left_fill_algorithm,
    optimize_sheet_cutting,
    SheetOptimizationAlgorithm,
    get_sheet_algorithm_recommendation
)


class TestRectangle:
    """Test Rectangle class functionality."""
    
    def test_rectangle_creation(self):
        """Test basic rectangle creation and properties."""
        rect = Rectangle(width=100, height=200, x=10, y=20, part_id="test_1")
        
        assert rect.width == 100
        assert rect.height == 200
        assert rect.x == 10
        assert rect.y == 20
        assert rect.part_id == "test_1"
        assert rect.area == 20000  # 100 * 200
        assert not rect.rotated
    
    def test_rectangle_rotation(self):
        """Test rectangle rotation functionality."""
        rect = Rectangle(width=100, height=200, part_id="test_1")
        rotated = rect.rotate()
        
        assert rotated.width == 200  # Original height
        assert rotated.height == 100  # Original width
        assert rotated.rotated is True
        assert rotated.part_id == "test_1"
        
        # Original should be unchanged
        assert rect.width == 100
        assert rect.height == 200
        assert not rect.rotated
    
    def test_rectangle_fits_in_sheet(self):
        """Test rectangle fitting within sheet boundaries."""
        rect = Rectangle(width=100, height=200)
        
        # Should fit in larger sheet
        assert rect.fits_in(300, 300)
        assert rect.fits_in(100, 200)  # Exact fit
        
        # Should not fit in smaller sheet
        assert not rect.fits_in(50, 200)
        assert not rect.fits_in(100, 150)
        
        # Test with kerf
        assert not rect.fits_in(100, 200, kerf=1)  # No room for kerf
        assert rect.fits_in(101, 201, kerf=1)  # Room for kerf
    
    def test_rectangle_overlap_detection(self):
        """Test rectangle overlap detection."""
        rect1 = Rectangle(width=100, height=100, x=0, y=0)
        rect2 = Rectangle(width=100, height=100, x=50, y=50)
        rect3 = Rectangle(width=100, height=100, x=200, y=200)
        
        # Should overlap
        assert rect1.overlaps_with(rect2)
        assert rect2.overlaps_with(rect1)
        
        # Should not overlap
        assert not rect1.overlaps_with(rect3)
        assert not rect3.overlaps_with(rect1)
        
        # Test with kerf
        rect4 = Rectangle(width=100, height=100, x=100, y=0)  # Adjacent
        assert not rect1.overlaps_with(rect4)  # Should not overlap
        assert rect1.overlaps_with(rect4, kerf=1)  # Should overlap with kerf


class TestSheetLayout:
    """Test SheetLayout class functionality."""
    
    def test_sheet_layout_creation(self):
        """Test basic sheet layout creation."""
        sheet = SheetLayout(
            sheet_width=1220,
            sheet_height=2440,
            parts=[],
            material_type="plywood",
            kerf_width=3.0
        )
        
        assert sheet.sheet_width == 1220
        assert sheet.sheet_height == 2440
        assert sheet.material_type == "plywood"
        assert sheet.kerf_width == 3.0
        assert len(sheet.parts) == 0
        assert sheet.total_area == 1220 * 2440
        assert sheet.used_area == 0
        assert sheet.waste_area == sheet.total_area
        assert sheet.efficiency == 0.0
    
    def test_sheet_layout_with_parts(self):
        """Test sheet layout metrics with parts."""
        part1 = Rectangle(width=300, height=400, x=0, y=0, part_id="part1")
        part2 = Rectangle(width=200, height=300, x=310, y=0, part_id="part2")
        
        sheet = SheetLayout(
            sheet_width=1220,
            sheet_height=2440,
            parts=[part1, part2],
            kerf_width=3.0
        )
        
        expected_used_area = (300 * 400) + (200 * 300)  # 120000 + 60000 = 180000
        assert sheet.used_area == expected_used_area
        assert sheet.waste_area == sheet.total_area - expected_used_area
        assert sheet.efficiency == (expected_used_area / sheet.total_area) * 100
    
    def test_can_place_part(self):
        """Test part placement validation."""
        sheet = SheetLayout(sheet_width=1000, sheet_height=1000, parts=[], kerf_width=3)
        
        # Add existing part at (200, 200) with size 200x200
        existing_part = Rectangle(width=200, height=200, x=200, y=200)
        sheet.parts.append(existing_part)
        
        # Test valid placements (should not overlap considering kerf)
        new_part = Rectangle(width=100, height=100)
        assert sheet.can_place_part(new_part, 0, 0)  # Bottom-left corner, should not overlap
        assert sheet.can_place_part(new_part, 0, 403)  # Above existing part (200+200+1.5+1.5=403)
        assert sheet.can_place_part(new_part, 403, 200)  # Right of existing part 
        
        # Test invalid placements
        assert not sheet.can_place_part(new_part, 950, 0)  # Would exceed sheet width (950+100 > 1000)
        assert not sheet.can_place_part(new_part, 0, 950)  # Would exceed sheet height (950+100 > 1000)
        assert not sheet.can_place_part(new_part, 250, 250)  # Would overlap existing part
        assert not sheet.can_place_part(new_part, 150, 200)  # Too close horizontally
    
    def test_place_part(self):
        """Test successful part placement."""
        sheet = SheetLayout(sheet_width=1000, sheet_height=1000, parts=[], kerf_width=3)
        part = Rectangle(width=100, height=200, part_id="test_part")
        
        # Should successfully place part
        result = sheet.place_part(part, 50, 100)
        assert result is True
        assert len(sheet.parts) == 1
        
        placed_part = sheet.parts[0]
        assert placed_part.width == 100
        assert placed_part.height == 200
        assert placed_part.x == 50
        assert placed_part.y == 100
        assert placed_part.part_id == "test_part"
        
        # Should fail to place overlapping part
        overlapping_part = Rectangle(width=100, height=100, part_id="overlap")
        result = sheet.place_part(overlapping_part, 75, 125)
        assert result is False
        assert len(sheet.parts) == 1  # No new part added


class TestSheetOptimization:
    """Test sheet optimization algorithms."""
    
    def test_expand_sheet_parts(self):
        """Test conversion of parts dictionary to rectangle list."""
        parts = {
            "shelf_back": {"width": 800, "height": 400, "quantity": 2},
            "shelf_side": {"width": 300, "height": 400, "quantity": 4}
        }
        
        rectangles = expand_sheet_parts(parts)
        
        # Should have 6 total parts (2 + 4)
        assert len(rectangles) == 6
        
        # Should be sorted by area (largest first)
        areas = [rect.area for rect in rectangles]
        assert areas == sorted(areas, reverse=True)
        
        # Check part IDs and dimensions
        shelf_backs = [r for r in rectangles if r.part_id.startswith("shelf_back")]
        shelf_sides = [r for r in rectangles if r.part_id.startswith("shelf_side")]
        
        assert len(shelf_backs) == 2
        assert len(shelf_sides) == 4
        
        for back in shelf_backs:
            assert back.width == 800
            assert back.height == 400
        
        for side in shelf_sides:
            assert side.width == 300
            assert side.height == 400
    
    def test_bottom_left_fill_simple(self):
        """Test bottom-left fill algorithm with simple case."""
        parts = {
            "small_rect": {"width": 100, "height": 100, "quantity": 2}
        }
        
        result = bottom_left_fill_algorithm(
            parts=parts,
            sheet_width=500,
            sheet_height=500,
            kerf_width=3,
            allow_rotation=False
        )
        
        assert result.algorithm_used == SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL
        assert result.total_sheets == 1
        assert len(result.sheets) == 1
        
        sheet = result.sheets[0]
        assert len(sheet.parts) == 2
        assert sheet.efficiency > 0
        assert sheet.waste_area < sheet.total_area
    
    def test_bottom_left_fill_multiple_sheets(self):
        """Test bottom-left fill when multiple sheets are needed."""
        parts = {
            "large_rect": {"width": 600, "height": 600, "quantity": 4}  # Too big for one 700x700 sheet
        }
        
        result = bottom_left_fill_algorithm(
            parts=parts,
            sheet_width=700,
            sheet_height=700,
            kerf_width=3,
            allow_rotation=False
        )
        
        assert result.total_sheets >= 2  # Should need multiple sheets
        assert len(result.sheets) >= 2
        
        # Verify all parts were placed
        total_parts_placed = sum(len(sheet.parts) for sheet in result.sheets)
        assert total_parts_placed == 4
    
    def test_optimization_with_rotation(self):
        """Test optimization with rotation enabled."""
        parts = {
            "rect": {"width": 200, "height": 500, "quantity": 1}  # Tall rectangle
        }
        
        # Test without rotation - should fail or use multiple sheets
        result_no_rotation = bottom_left_fill_algorithm(
            parts=parts,
            sheet_width=600,
            sheet_height=300,  # Too short for tall rectangle
            kerf_width=3,
            allow_rotation=False
        )
        
        # Test with rotation - should fit by rotating
        result_with_rotation = bottom_left_fill_algorithm(
            parts=parts,
            sheet_width=600,
            sheet_height=300,
            kerf_width=3,
            allow_rotation=True
        )
        
        # With rotation, should fit in one sheet
        assert len(result_with_rotation.sheets) == 1
        placed_part = result_with_rotation.sheets[0].parts[0]
        # Should be rotated to fit (width=500, height=200)
        assert placed_part.width == 500 and placed_part.height == 200
        assert placed_part.rotated is True
    
    def test_optimize_sheet_cutting_main_function(self):
        """Test main optimization function."""
        parts = {
            "part1": {"width": 200, "height": 300, "quantity": 1},
            "part2": {"width": 150, "height": 250, "quantity": 1}
        }
        
        result = optimize_sheet_cutting(
            parts=parts,
            sheet_width=800,
            sheet_height=600,
            kerf_width=3,
            material_type="plywood",
            algorithm=SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL,
            allow_rotation=True
        )
        
        assert isinstance(result.sheets, list)
        assert result.total_sheets > 0
        assert result.overall_efficiency >= 0
        assert result.total_waste_area >= 0
        assert result.algorithm_used == SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL
    
    def test_get_sheet_algorithm_recommendation(self):
        """Test algorithm recommendation logic."""
        # Very small problem
        small_parts = {
            "part1": {"width": 100, "height": 100, "quantity": 3}
        }
        alg = get_sheet_algorithm_recommendation(small_parts)
        assert alg == SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL
        
        # Medium problem with diverse sizes (should recommend GENETIC_2D due to high diversity)
        diverse_parts = {
            "large": {"width": 800, "height": 600, "quantity": 2},
            "medium": {"width": 300, "height": 200, "quantity": 5},
            "small": {"width": 100, "height": 50, "quantity": 15}
        }
        alg = get_sheet_algorithm_recommendation(diverse_parts)
        assert alg == SheetOptimizationAlgorithm.GENETIC_2D
        
        # Medium problem with uniform sizes (should recommend GUILLOTINE_CUT)
        uniform_parts = {
            f"part{i}": {"width": 200, "height": 200, "quantity": 1}
            for i in range(30)
        }
        alg = get_sheet_algorithm_recommendation(uniform_parts)
        assert alg == SheetOptimizationAlgorithm.GUILLOTINE_CUT
        
        # Large problem (should default to BOTTOM_LEFT_FILL for speed)
        large_parts = {
            f"part{i}": {"width": 100, "height": 100, "quantity": 1}
            for i in range(100)
        }
        alg = get_sheet_algorithm_recommendation(large_parts)
        assert alg == SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL
    
    def test_best_fit_2d_algorithm(self):
        """Test the Best Fit 2D algorithm."""
        parts = {
            "large": {"width": 400, "height": 300, "quantity": 1},
            "small": {"width": 100, "height": 100, "quantity": 4}
        }
        
        result = optimize_sheet_cutting(
            parts=parts,
            sheet_width=800,
            sheet_height=600,
            kerf_width=3,
            algorithm=SheetOptimizationAlgorithm.BEST_FIT_2D,
            allow_rotation=True
        )
        
        assert result.algorithm_used == SheetOptimizationAlgorithm.BEST_FIT_2D
        assert result.total_sheets == 1
        assert len(result.sheets[0].parts) == 5  # 1 large + 4 small
        assert result.overall_efficiency > 0
    
    def test_guillotine_cut_algorithm(self):
        """Test the Guillotine Cut algorithm."""
        parts = {
            "rect1": {"width": 200, "height": 300, "quantity": 2},
            "rect2": {"width": 300, "height": 200, "quantity": 2}
        }
        
        result = optimize_sheet_cutting(
            parts=parts,
            sheet_width=1000,
            sheet_height=800,
            kerf_width=3,
            algorithm=SheetOptimizationAlgorithm.GUILLOTINE_CUT,
            allow_rotation=True
        )
        
        assert result.algorithm_used == SheetOptimizationAlgorithm.GUILLOTINE_CUT
        assert result.total_sheets >= 1
        total_parts_placed = sum(len(sheet.parts) for sheet in result.sheets)
        assert total_parts_placed == 4
    
    def test_algorithm_comparison(self):
        """Test that different algorithms can handle the same problem."""
        parts = {
            "part1": {"width": 300, "height": 200, "quantity": 2},
            "part2": {"width": 150, "height": 100, "quantity": 4}
        }
        
        algorithms = [
            SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL,
            SheetOptimizationAlgorithm.BEST_FIT_2D,
            SheetOptimizationAlgorithm.GUILLOTINE_CUT
        ]
        
        results = []
        for algorithm in algorithms:
            result = optimize_sheet_cutting(
                parts=parts,
                sheet_width=800,
                sheet_height=600,
                kerf_width=3,
                algorithm=algorithm,
                allow_rotation=True
            )
            results.append(result)
            
            # All should place all parts
            total_parts = sum(len(sheet.parts) for sheet in result.sheets)
            assert total_parts == 6  # 2 + 4 parts
            assert result.overall_efficiency > 0
        
        # Results should vary but all be valid
        assert len(set(r.algorithm_used for r in results)) == 3
    
    def test_genetic_2d_algorithm(self):
        """Test the Genetic 2D algorithm."""
        parts = {
            "large": {"width": 500, "height": 400, "quantity": 1},
            "medium": {"width": 300, "height": 200, "quantity": 2},
            "small": {"width": 100, "height": 100, "quantity": 4}
        }
        
        result = optimize_sheet_cutting(
            parts=parts,
            sheet_width=1000,
            sheet_height=800,
            kerf_width=3,
            algorithm=SheetOptimizationAlgorithm.GENETIC_2D,
            allow_rotation=True
        )
        
        assert result.algorithm_used == SheetOptimizationAlgorithm.GENETIC_2D
        assert result.total_sheets >= 1
        total_parts_placed = sum(len(sheet.parts) for sheet in result.sheets)
        assert total_parts_placed == 7  # 1 + 2 + 4 parts
        assert result.overall_efficiency > 0
    
    def test_genetic_algorithm_small_fallback(self):
        """Test that genetic algorithm falls back to simpler algorithm for small problems."""
        parts = {
            "part1": {"width": 200, "height": 200, "quantity": 2}
        }
        
        result = optimize_sheet_cutting(
            parts=parts,
            sheet_width=800,
            sheet_height=600,
            kerf_width=3,
            algorithm=SheetOptimizationAlgorithm.GENETIC_2D,
            allow_rotation=True
        )
        
        # Should fallback to BEST_FIT_2D for small problems
        assert result.algorithm_used == SheetOptimizationAlgorithm.BEST_FIT_2D
        assert result.total_sheets == 1
        assert len(result.sheets[0].parts) == 2


class TestEdgeCases:
    """Test edge cases and error conditions."""
    
    def test_empty_parts_dict(self):
        """Test handling of empty parts dictionary."""
        with pytest.raises(ValueError):
            expand_sheet_parts({})
    
    def test_zero_quantity_part(self):
        """Test handling of parts with zero quantity."""
        parts = {
            "valid_part": {"width": 100, "height": 100, "quantity": 1},
            "zero_part": {"width": 200, "height": 200, "quantity": 0}
        }
        
        rectangles = expand_sheet_parts(parts)
        assert len(rectangles) == 1  # Only the valid part
        assert rectangles[0].part_id == "valid_part_1"
    
    def test_part_too_large_for_sheet(self):
        """Test handling of parts too large for any sheet."""
        parts = {
            "huge_part": {"width": 2000, "height": 2000, "quantity": 1}
        }
        
        result = bottom_left_fill_algorithm(
            parts=parts,
            sheet_width=1000,
            sheet_height=1000,
            kerf_width=3,
            allow_rotation=False
        )
        
        # Should handle gracefully (might create empty sheets or skip parts)
        assert isinstance(result.sheets, list)
    
    def test_invalid_algorithm(self):
        """Test error handling for invalid algorithm."""
        parts = {"part1": {"width": 100, "height": 100, "quantity": 1}}
        
        # Create a fake algorithm by monkey-patching the enum temporarily
        from planqer.sheet_optimization import SheetOptimizationAlgorithm
        fake_algorithm = type('FakeAlgorithm', (), {'value': 'fake_algorithm'})()
        
        with pytest.raises(ValueError, match="not yet implemented"):
            optimize_sheet_cutting(
                parts=parts,
                sheet_width=500,
                sheet_height=500,
                algorithm=fake_algorithm
            )


if __name__ == "__main__":
    pytest.main([__file__])