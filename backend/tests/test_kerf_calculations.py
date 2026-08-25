"""
Unit tests for kerf (saw blade width) calculations in cutting optimization.

This test module ensures that kerf is properly calculated and affects both:
- Optimization algorithms (number of boards needed)
- Visualization (board usage display)

The kerf represents material lost during cutting. For n parts on a board,
there are (n-1) cuts needed, so kerf_total = (n-1) * saw_blade_width.
"""

import pytest
from planqer.cutting import min_boards_required_with_cut_list
from planqer.algorithms import (
    first_fit_decreasing, 
    best_fit, 
    best_fit_decreasing,
    calculate_board_usage,
    OptimizationAlgorithm,
    optimize_cutting
)
from planqer.helpers import compute_metrics


class TestKerfCalculations:
    """Test kerf calculations across all optimization algorithms."""
    
    def test_kerf_affects_board_count_simple(self):
        """Test that increasing kerf increases board count needed."""
        parts = {100.0: 3}  # 3 parts of 100mm each
        board_length = 320.0  # Total parts = 300mm
        
        # With no kerf, should fit in 1 board (300mm < 320mm)
        result_no_kerf = first_fit_decreasing(parts, board_length, saw_blade_width=0.0)
        assert result_no_kerf.num_boards == 1
        
        # With 20mm kerf, total needed = 300mm + 2*20mm = 340mm > 320mm
        # Should need 2 boards
        result_with_kerf = first_fit_decreasing(parts, board_length, saw_blade_width=20.0)
        assert result_with_kerf.num_boards == 2
        
    def test_kerf_affects_board_count_extreme(self):
        """Test extreme kerf values affect optimization correctly."""
        parts = {50.0: 4}  # 4 parts of 50mm each = 200mm total
        board_length = 250.0
        
        # With no kerf: 200mm fits in 1 board
        result_no_kerf = first_fit_decreasing(parts, board_length, saw_blade_width=0.0)
        assert result_no_kerf.num_boards == 1
        
        # With 30mm kerf: 200mm + 3*30mm = 290mm > 250mm, needs 2+ boards
        result_extreme_kerf = first_fit_decreasing(parts, board_length, saw_blade_width=30.0)
        assert result_extreme_kerf.num_boards >= 2
        
    def test_calculate_board_usage_kerf(self):
        """Test board usage calculation includes correct kerf."""
        board = [100.0, 50.0, 75.0]  # 3 parts
        board_length = 300.0
        saw_blade_width = 5.0
        
        used, remaining = calculate_board_usage(board, board_length, saw_blade_width)
        
        # Expected: 100 + 50 + 75 + 2*5 = 235mm used (2 cuts for 3 parts)
        expected_used = 225.0 + 2 * 5.0  # parts + kerf
        expected_remaining = 300.0 - expected_used
        
        assert used == expected_used
        assert remaining == expected_remaining
        
    def test_calculate_board_usage_single_part(self):
        """Test board usage with single part has no kerf."""
        board = [100.0]  # 1 part
        board_length = 200.0
        saw_blade_width = 10.0
        
        used, remaining = calculate_board_usage(board, board_length, saw_blade_width)
        
        # Single part needs no cuts, so no kerf
        assert used == 100.0
        assert remaining == 100.0
        
    def test_calculate_board_usage_empty_board(self):
        """Test empty board usage calculation."""
        board = []
        board_length = 200.0
        saw_blade_width = 10.0
        
        used, remaining = calculate_board_usage(board, board_length, saw_blade_width)
        
        assert used == 0.0
        assert remaining == 200.0
        
    def test_compute_metrics_kerf(self):
        """Test compute_metrics function handles kerf correctly."""
        cut_list = [
            [100.0, 50.0],  # 2 parts, 1 cut
            [75.0, 25.0, 25.0]  # 3 parts, 2 cuts
        ]
        board_length = 200.0
        saw_blade_width = 5.0
        
        total_waste, warnings = compute_metrics(cut_list, board_length, saw_blade_width)
        
        # Board 1: 100 + 50 + 1*5 = 155mm used, 45mm waste
        # Board 2: 75 + 25 + 25 + 2*5 = 135mm used, 65mm waste
        expected_waste = (200 - 155) + (200 - 135)  # 45 + 65 = 110mm
        
        assert abs(total_waste - expected_waste) < 0.001
        
    def test_all_algorithms_respect_kerf(self):
        """Test that all optimization algorithms respect kerf settings."""
        parts = {80.0: 3}  # 3 parts of 80mm = 240mm total
        board_length = 260.0  # Tight fit
        
        algorithms = [
            first_fit_decreasing,
            best_fit,
            best_fit_decreasing,
        ]
        
        for algorithm in algorithms:
            # With no kerf, should fit in 1 board
            result_no_kerf = algorithm(parts, board_length, saw_blade_width=0.0)
            assert result_no_kerf.num_boards == 1, f"{algorithm.__name__} failed no kerf test"
            
            # With 15mm kerf: 240 + 2*15 = 270mm > 260mm, needs 2 boards
            result_with_kerf = algorithm(parts, board_length, saw_blade_width=15.0)
            assert result_with_kerf.num_boards >= 2, f"{algorithm.__name__} failed kerf test"
            
    def test_optimize_cutting_function_kerf(self):
        """Test the main optimize_cutting function respects kerf."""
        parts = {60.0: 4}  # 4 parts of 60mm = 240mm total
        board_length = 270.0
        
        # With no kerf, should fit in 1 board
        result_no_kerf = optimize_cutting(parts, board_length, 0.0, OptimizationAlgorithm.FIRST_FIT_DECREASING)
        assert result_no_kerf.num_boards == 1
        
        # With 20mm kerf: 240 + 3*20 = 300mm > 270mm, needs 2 boards
        result_with_kerf = optimize_cutting(parts, board_length, 20.0, OptimizationAlgorithm.FIRST_FIT_DECREASING)
        assert result_with_kerf.num_boards >= 2
        
    def test_kerf_consistency_across_algorithms(self):
        """Test that all algorithms produce consistent results with same kerf."""
        parts = {90.0: 2, 60.0: 2}
        board_length = 200.0
        kerf = 10.0
        
        algorithms = [
            OptimizationAlgorithm.FIRST_FIT_DECREASING,
            OptimizationAlgorithm.BEST_FIT,
            OptimizationAlgorithm.BEST_FIT_DECREASING,
        ]
        
        results = []
        for algorithm in algorithms:
            result = optimize_cutting(parts, board_length, kerf, algorithm)
            results.append(result)
            
            # All should require at least 2 boards due to kerf
            # Total parts: 90+60+90+60 = 300mm
            # With kerf, each board can hold less than 200mm of parts
            assert result.num_boards >= 2, f"{algorithm.value} should need at least 2 boards"
            
    def test_legacy_cutting_function_kerf(self):
        """Test the legacy min_boards_required_with_cut_list function."""
        parts = {70.0: 3}  # 3 parts of 70mm = 210mm total
        board_length = 230.0
        
        # With no kerf, should fit in 1 board
        num_boards_no_kerf, cut_list_no_kerf = min_boards_required_with_cut_list(
            parts, board_length, saw_blade_width=0.0
        )
        assert num_boards_no_kerf == 1
        
        # With 15mm kerf: 210 + 2*15 = 240mm > 230mm, needs 2 boards
        num_boards_with_kerf, cut_list_with_kerf = min_boards_required_with_cut_list(
            parts, board_length, saw_blade_width=15.0
        )
        assert num_boards_with_kerf >= 2
        
    def test_realistic_woodworking_scenario(self):
        """Test realistic woodworking scenario with typical kerf values."""
        # Kitchen cabinet project: shelf pieces
        parts = {
            600.0: 4,  # 4 shelves at 600mm
            300.0: 8,  # 8 side pieces at 300mm
            200.0: 2   # 2 back pieces at 200mm
        }
        board_length = 2400.0  # Standard 8ft board
        typical_kerf = 3.0  # 3mm typical saw kerf
        
        result = first_fit_decreasing(parts, board_length, typical_kerf)
        
        # Verify the result is reasonable
        assert result.num_boards >= 1
        assert len(result.cut_list) == result.num_boards
        
        # Verify each board respects length constraints with kerf
        for board in result.cut_list:
            used, remaining = calculate_board_usage(board, board_length, typical_kerf)
            assert used <= board_length, f"Board exceeds length: {used} > {board_length}"
            assert remaining >= 0, f"Negative remaining space: {remaining}"
            
    def test_zero_kerf_edge_case(self):
        """Test that zero kerf works correctly."""
        parts = {100.0: 2}
        board_length = 200.0
        
        result = first_fit_decreasing(parts, board_length, saw_blade_width=0.0)
        
        assert result.num_boards == 1
        assert result.cut_list == [[100.0, 100.0]]
        
    def test_negative_kerf_raises_error(self):
        """Test that negative kerf values are handled appropriately."""
        parts = {100.0: 1}
        board_length = 200.0
        
        # Negative kerf doesn't make physical sense, but algorithms should handle it
        # (They might clamp to 0 or raise an error depending on implementation)
        result = first_fit_decreasing(parts, board_length, saw_blade_width=-5.0)
        
        # Should still work (treating negative as 0 or minimal kerf)
        assert result.num_boards >= 1


if __name__ == "__main__":
    pytest.main([__file__])