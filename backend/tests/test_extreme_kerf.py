"""
Test extreme kerf values similar to the user's reported issue.

This test ensures that the kerf bug fix handles edge cases and extreme values properly.
"""

import pytest
from planqer.algorithms import first_fit_decreasing, optimize_cutting, OptimizationAlgorithm
from planqer.cutting import min_boards_required_with_cut_list


class TestExtremeKerfValues:
    """Test extreme kerf values that users might input."""
    
    def test_user_reported_case_30mm_kerf(self):
        """Test the exact case reported by the user: 30mm kerf."""
        # This simulates the user setting kerf to 30mm in the UI
        # In the API, this gets divided by 10, so it becomes 3.0mm
        # But let's test both the UI value and the API value
        
        parts = {200.0: 3}  # 3 parts of 200mm
        board_length = 650.0
        
        # Test extreme kerf as user input (30mm)
        extreme_kerf = 30.0
        result = first_fit_decreasing(parts, board_length, extreme_kerf)
        
        # With 30mm kerf: 3 parts need 200+200+200 + 2*30 = 660mm > 650mm
        # Should need at least 2 boards
        assert result.num_boards >= 2
        
        # Verify no board is overloaded
        for board in result.cut_list:
            if board:
                used = sum(board) + max(0, len(board) - 1) * extreme_kerf
                assert used <= board_length, f"Board overloaded: {used} > {board_length}"
        
    def test_api_conversion_scenario(self):
        """Test the API conversion from UI mm to internal mm."""
        # User enters 30mm in UI, API converts to 3.0mm
        parts = {100.0: 4}  # 4 parts of 100mm = 400mm total
        board_length = 420.0
        
        ui_kerf = 30.0  # What user enters
        api_kerf = ui_kerf / 10.0  # What API does: 3.0mm
        
        result = first_fit_decreasing(parts, board_length, api_kerf)
        
        # With 3mm kerf: 400mm + 3*3mm = 409mm < 420mm, should fit in 1 board
        assert result.num_boards == 1
        
        # But with actual 30mm kerf: 400mm + 3*30mm = 490mm > 420mm, needs 2+ boards
        result_extreme = first_fit_decreasing(parts, board_length, ui_kerf)
        assert result_extreme.num_boards >= 2
        
    def test_very_large_kerf(self):
        """Test with extremely large kerf values."""
        parts = {50.0: 5}  # 5 small parts
        board_length = 300.0
        kerf = 100.0  # Extremely large kerf
        
        result = first_fit_decreasing(parts, board_length, kerf)
        
        # With 100mm kerf, each cut takes 100mm, so very few parts per board
        # Each board can only fit 1-2 parts max
        assert result.num_boards >= 3  # Should need multiple boards
        
        # Verify no board is overloaded
        for board in result.cut_list:
            if board:
                used = sum(board) + max(0, len(board) - 1) * kerf
                assert used <= board_length, f"Board overloaded: {used} > {board_length}"
                
    def test_kerf_larger_than_parts(self):
        """Test when kerf is larger than individual parts."""
        parts = {30.0: 4}  # 4 small parts
        board_length = 200.0
        kerf = 50.0  # Kerf larger than parts
        
        result = first_fit_decreasing(parts, board_length, kerf)
        
        # Should still work, just very inefficient
        assert result.num_boards >= 1
        
        # Verify no board is overloaded
        for board in result.cut_list:
            if board:
                used = sum(board) + max(0, len(board) - 1) * kerf
                assert used <= board_length, f"Board overloaded: {used} > {board_length}"
                
    def test_kerf_equals_board_length(self):
        """Test edge case where kerf equals board length."""
        parts = {50.0: 2}
        board_length = 100.0
        kerf = 100.0  # Kerf equals board length
        
        result = first_fit_decreasing(parts, board_length, kerf)
        
        # Should put only 1 part per board (can't make any cuts)
        assert result.num_boards == 2
        for board in result.cut_list:
            assert len(board) == 1, f"Board should have only 1 part: {board}"
            
    def test_all_algorithms_extreme_kerf(self):
        """Test all algorithms handle extreme kerf correctly."""
        parts = {80.0: 3}
        board_length = 300.0
        extreme_kerf = 50.0
        
        algorithms = [
            OptimizationAlgorithm.FIRST_FIT_DECREASING,
            OptimizationAlgorithm.BEST_FIT,
            OptimizationAlgorithm.BEST_FIT_DECREASING,
        ]
        
        for algorithm in algorithms:
            result = optimize_cutting(parts, board_length, extreme_kerf, algorithm)
            
            # Should need multiple boards due to large kerf
            assert result.num_boards >= 2, f"{algorithm.value} should need multiple boards"
            
            # Verify no board is overloaded
            for board in result.cut_list:
                if board:
                    used = sum(board) + max(0, len(board) - 1) * extreme_kerf
                    assert used <= board_length, f"{algorithm.value} overloaded board: {used} > {board_length}"
                    
    def test_legacy_function_extreme_kerf(self):
        """Test legacy function with extreme kerf."""
        parts = {60.0: 4}
        board_length = 300.0
        extreme_kerf = 40.0
        
        num_boards, cut_list = min_boards_required_with_cut_list(
            parts, board_length, extreme_kerf
        )
        
        # Should need multiple boards
        assert num_boards >= 2
        
        # Verify no board is overloaded
        for board in cut_list:
            if board:
                used = sum(board) + max(0, len(board) - 1) * extreme_kerf
                assert used <= board_length, f"Legacy function overloaded board: {used} > {board_length}"
                
    def test_visualization_extreme_kerf(self):
        """Test that visualization handles extreme kerf correctly."""
        from planqer.svg_visualization import SVGCuttingVisualizer
        
        parts = {100.0: 2}
        board_length = 300.0
        extreme_kerf = 50.0
        
        result = first_fit_decreasing(parts, board_length, extreme_kerf)
        
        # Generate visualization
        visualizer = SVGCuttingVisualizer()
        svg_content = visualizer.generate_svg_cut_list(
            result.cut_list, board_length, extreme_kerf
        )
        
        # Should generate valid SVG without errors
        assert svg_content.startswith('<?xml version="1.0"')
        assert '</svg>' in svg_content
        assert 'WASTE' in svg_content or len(result.cut_list) == 1  # Should show waste or minimal boards


if __name__ == "__main__":
    pytest.main([__file__, "-v"])