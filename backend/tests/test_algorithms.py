"""
Tests for advanced optimization algorithms.
"""

import pytest
from planqer.algorithms import (
    OptimizationAlgorithm,
    first_fit_decreasing,
    best_fit,
    best_fit_decreasing,
    genetic_algorithm,
    branch_and_bound,
    optimize_cutting,
    get_algorithm_recommendation,
    expand_parts_list,
    calculate_board_usage
)


def test_expand_parts_list():
    """Test expanding parts dictionary to sorted list."""
    parts = {100.0: 2, 50.0: 3, 200.0: 1}
    expanded = expand_parts_list(parts)
    
    # Should be sorted in descending order
    expected = [200.0, 100.0, 100.0, 50.0, 50.0, 50.0]
    assert expanded == expected


def test_calculate_board_usage():
    """Test board usage calculation."""
    board = [100.0, 50.0, 25.0]
    board_length = 300.0
    saw_blade_width = 3.0
    
    used, remaining = calculate_board_usage(board, board_length, saw_blade_width)
    
    # Parts: 175, Kerf: (3-1)*3=6, Total used: 181, Remaining: 119
    assert used == 175.0 + 6.0  # 3 parts need 2 cuts
    assert remaining == 300.0 - 181.0
    
    # Test empty board
    used_empty, remaining_empty = calculate_board_usage([], board_length, saw_blade_width)
    assert used_empty == 0.0
    assert remaining_empty == board_length


def test_first_fit_decreasing():
    """Test First Fit Decreasing algorithm."""
    parts = {100.0: 2, 50.0: 2}
    board_length = 200.0
    saw_blade_width = 3.0
    
    result = first_fit_decreasing(parts, board_length, saw_blade_width)
    
    assert result.algorithm_used == OptimizationAlgorithm.FIRST_FIT_DECREASING
    assert result.num_boards > 0
    assert len(result.cut_list) == result.num_boards
    assert result.total_waste >= 0
    
    # Verify all parts are accounted for
    total_parts_placed = sum(len(board) for board in result.cut_list)
    total_parts_requested = sum(parts.values())
    assert total_parts_placed == total_parts_requested


def test_best_fit():
    """Test Best Fit algorithm."""
    parts = {75.0: 2, 25.0: 2, 50.0: 1}
    board_length = 200.0
    saw_blade_width = 3.0
    
    result = best_fit(parts, board_length, saw_blade_width)
    
    assert result.algorithm_used == OptimizationAlgorithm.BEST_FIT
    assert result.num_boards > 0
    assert len(result.cut_list) == result.num_boards
    
    # Verify all parts are placed
    total_parts_placed = sum(len(board) for board in result.cut_list)
    total_parts_requested = sum(parts.values())
    assert total_parts_placed == total_parts_requested


def test_best_fit_decreasing():
    """Test Best Fit Decreasing algorithm."""
    parts = {30.0: 3, 80.0: 2, 60.0: 2}
    board_length = 200.0
    saw_blade_width = 3.0
    
    result = best_fit_decreasing(parts, board_length, saw_blade_width)
    
    assert result.algorithm_used == OptimizationAlgorithm.BEST_FIT
    assert result.num_boards > 0
    
    # Should often produce same or better results than first fit
    ffd_result = first_fit_decreasing(parts, board_length, saw_blade_width)
    assert result.num_boards <= ffd_result.num_boards or result.total_waste <= ffd_result.total_waste


def test_genetic_algorithm():
    """Test Genetic Algorithm."""
    parts = {50.0: 4, 30.0: 3, 20.0: 2}  # 9 parts total - should use genetic
    board_length = 150.0
    saw_blade_width = 3.0
    
    result = genetic_algorithm(parts, board_length, saw_blade_width, 
                             population_size=20, generations=10)
    
    assert result.algorithm_used == OptimizationAlgorithm.GENETIC_ALGORITHM
    assert result.num_boards > 0
    
    # For very small problems, should fall back to FFD
    small_parts = {50.0: 1, 30.0: 1}  # 2 parts - should fall back
    small_result = genetic_algorithm(small_parts, board_length, saw_blade_width)
    assert small_result.algorithm_used == OptimizationAlgorithm.FIRST_FIT_DECREASING


def test_branch_and_bound():
    """Test Branch and Bound algorithm."""
    # Small problem suitable for exact algorithm (5 parts - should use B&B)
    parts = {60.0: 2, 40.0: 2, 30.0: 1}
    board_length = 150.0
    saw_blade_width = 3.0
    
    result = branch_and_bound(parts, board_length, saw_blade_width)
    
    assert result.algorithm_used == OptimizationAlgorithm.BRANCH_AND_BOUND
    assert result.num_boards > 0
    
    # For large problems, should fall back to genetic algorithm
    large_parts = {i: 1 for i in range(10, 25)}  # 15 parts - should fall back to genetic
    large_result = branch_and_bound(large_parts, board_length, saw_blade_width)
    assert large_result.algorithm_used == OptimizationAlgorithm.GENETIC_ALGORITHM


def test_optimize_cutting_dispatch():
    """Test that optimize_cutting correctly dispatches to algorithms."""
    parts = {100.0: 3, 50.0: 3, 25.0: 2}  # 8 parts - enough for genetic to work
    board_length = 200.0
    saw_blade_width = 3.0
    
    # Test each algorithm
    for algorithm in OptimizationAlgorithm:
        result = optimize_cutting(parts, board_length, saw_blade_width, algorithm)
        assert result.num_boards > 0
        assert len(result.cut_list) == result.num_boards
        
        # Verify correct algorithm was used (accounting for fallbacks)
        if algorithm == OptimizationAlgorithm.BEST_FIT_DECREASING:
            # This falls back to BEST_FIT
            assert result.algorithm_used == OptimizationAlgorithm.BEST_FIT
        elif algorithm == OptimizationAlgorithm.GENETIC_ALGORITHM:
            # Should use genetic for 8 parts
            assert result.algorithm_used == OptimizationAlgorithm.GENETIC_ALGORITHM
        elif algorithm == OptimizationAlgorithm.BRANCH_AND_BOUND:
            # Should use branch and bound for 8 parts (within limit)
            assert result.algorithm_used == OptimizationAlgorithm.BRANCH_AND_BOUND
        else:
            assert result.algorithm_used == algorithm


def test_get_algorithm_recommendation():
    """Test algorithm recommendation logic."""
    # Very small problem -> Branch and Bound
    small_parts = {100.0: 2, 50.0: 2}  # 4 parts
    assert get_algorithm_recommendation(small_parts) == OptimizationAlgorithm.BRANCH_AND_BOUND
    
    # Small-medium problem -> Genetic Algorithm
    medium_parts = {100.0: 3, 80.0: 3, 60.0: 2}  # 8 parts
    assert get_algorithm_recommendation(medium_parts) == OptimizationAlgorithm.GENETIC_ALGORITHM
    
    # Large problem with repetition -> First Fit Decreasing
    large_parts = {100.0: 50, 50.0: 30}  # 80 parts, low diversity (2/80 = 0.025)
    assert get_algorithm_recommendation(large_parts) == OptimizationAlgorithm.FIRST_FIT_DECREASING
    
    # High diversity problem -> Best Fit Decreasing
    high_diversity = {i: 1 for i in range(10, 30)}  # 20 parts, high diversity (20/20 = 1.0)
    assert get_algorithm_recommendation(high_diversity) == OptimizationAlgorithm.BEST_FIT_DECREASING


def test_algorithm_consistency():
    """Test that algorithms produce consistent, valid results."""
    parts = {100.0: 2, 80.0: 2, 60.0: 2, 40.0: 2}  # Simpler case
    board_length = 300.0  # Larger board to avoid edge cases
    saw_blade_width = 3.0
    
    results = []
    for algorithm in OptimizationAlgorithm:
        result = optimize_cutting(parts, board_length, saw_blade_width, algorithm)
        results.append(result)
        
        # Basic validation
        assert result.num_boards > 0
        assert result.total_waste >= 0
        assert len(result.cut_list) == result.num_boards
        
        # Check that all parts fit in their assigned boards
        for i, board in enumerate(result.cut_list):
            used, remaining = calculate_board_usage(board, board_length, saw_blade_width)
            assert used <= board_length, f"Algorithm {algorithm.value} - Board {i} overloaded: {board} -> {used} > {board_length}"
            assert remaining >= 0, f"Algorithm {algorithm.value} - Board {i} negative remaining space: {remaining}"
        
        # Check total parts count
        total_placed = sum(len(board) for board in result.cut_list)
        total_expected = sum(parts.values())
        assert total_placed == total_expected, f"Part count mismatch: {total_placed} != {total_expected}"
    
    # All algorithms should produce valid solutions
    assert all(r.num_boards > 0 for r in results)


def test_invalid_algorithm():
    """Test error handling for invalid algorithm."""
    parts = {100.0: 2}
    board_length = 200.0
    saw_blade_width = 3.0
    
    with pytest.raises(ValueError, match="Unknown algorithm"):
        optimize_cutting(parts, board_length, saw_blade_width, "invalid_algorithm")


def test_empty_parts():
    """Test handling of empty parts dictionary."""
    parts = {}
    board_length = 200.0
    saw_blade_width = 3.0
    
    # Should handle empty parts gracefully
    with pytest.raises(ValueError, match="Parts dictionary cannot be empty"):
        optimize_cutting(parts, board_length, saw_blade_width)


def test_algorithm_performance_comparison():
    """Test that different algorithms can produce different solutions."""
    # Use a problem where different algorithms might produce different results
    parts = {90.0: 3, 70.0: 3, 50.0: 3, 30.0: 3}
    board_length = 200.0
    saw_blade_width = 3.0
    
    ffd_result = optimize_cutting(parts, board_length, saw_blade_width, 
                                OptimizationAlgorithm.FIRST_FIT_DECREASING)
    bf_result = optimize_cutting(parts, board_length, saw_blade_width, 
                               OptimizationAlgorithm.BEST_FIT)
    
    # Both should be valid solutions
    assert ffd_result.num_boards > 0
    assert bf_result.num_boards > 0
    
    # Results might be different (this is not guaranteed, but often true)
    # At minimum, both should be valid solutions
    assert ffd_result.total_waste >= 0
    assert bf_result.total_waste >= 0