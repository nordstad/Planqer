"""
Tests for cost calculation functionality.
"""

import pytest
from planqer.cost_calculator import (
    apply_bulk_discount,
    calculate_boards_needed,
    calculate_material_efficiency,
    calculate_waste_cost,
    calculate_cost_analysis,
    convert_currency,
    get_supported_currencies
)


def test_apply_bulk_discount():
    """Test bulk discount calculation."""
    # No discount applied if below minimum quantity
    assert apply_bulk_discount(5, 100.0, 0.1, 10) == 100.0
    
    # Discount applied if above minimum quantity
    assert apply_bulk_discount(10, 100.0, 0.1, 10) == 90.0
    assert apply_bulk_discount(15, 200.0, 0.15, 10) == 170.0
    
    # No discount if discount is 0
    assert apply_bulk_discount(20, 100.0, 0.0, 10) == 100.0


def test_calculate_boards_needed():
    """Test calculation of boards needed by type."""
    cut_list = [
        [2700, 300],  # Should use 3000mm board
        [2800, 150],  # Should use 3000mm board  
        [4500, 400],  # Should use 5000mm board
    ]
    board_lengths = [3000, 4000, 5000]
    
    result = calculate_boards_needed(cut_list, board_lengths)
    expected = {3000: 2, 5000: 1}  # 2 boards of 3000mm, 1 board of 5000mm
    
    assert result == expected


def test_calculate_boards_needed_empty():
    """Test with empty cut list."""
    result = calculate_boards_needed([], [3000, 4000])
    assert result == {}


def test_calculate_material_efficiency():
    """Test material efficiency calculation."""
    cut_list = [
        [2700, 270],  # 2970mm used from 3000mm board (98% efficiency before kerf)
        [2900]        # 2900mm used from 3000mm board (96.7% efficiency before kerf)
    ]
    board_length = 3000
    saw_blade_width = 3.0
    
    efficiency = calculate_material_efficiency(cut_list, board_length, saw_blade_width)
    
    # Total parts: 2700 + 270 + 2900 = 5870mm
    # Total available: 2 * 3000 = 6000mm  
    # Efficiency: 5870 / 6000 = 0.978
    assert abs(efficiency - 0.978) < 0.01


def test_calculate_waste_cost():
    """Test waste cost calculation."""
    cut_list = [
        [2700, 270],  # Uses 2970 + 3 kerf = 2973, waste = 27mm
        [2900]        # Uses 2900, waste = 100mm
    ]
    board_length = 3000
    price_per_board = 100.0
    saw_blade_width = 3.0
    
    waste_cost = calculate_waste_cost(cut_list, board_length, price_per_board, saw_blade_width)
    
    # Total waste: 27 + 100 = 127mm
    # Waste ratio: 127 / (2 * 3000) = 0.0212
    # Waste cost: 0.0212 * 2 * 100 = 4.23
    assert abs(waste_cost - 4.23) < 0.1


def test_calculate_cost_analysis():
    """Test comprehensive cost analysis."""
    cut_list = [
        [2700, 270],  # 3000mm board
        [2900],       # 3000mm board
        [4500]        # 5000mm board
    ]
    board_lengths = [3000, 5000]
    board_costs = {
        3000: {
            "price_per_board": 95.0,
            "supplier": "Bauhaus",
            "bulk_discount": 0.0,
            "minimum_quantity": 1
        },
        5000: {
            "price_per_board": 158.0,
            "supplier": "Bauhaus", 
            "bulk_discount": 0.0,
            "minimum_quantity": 1
        }
    }
    currency = "SEK"
    saw_blade_width = 3.0
    
    result = calculate_cost_analysis(cut_list, board_lengths, board_costs, currency, saw_blade_width)
    
    assert result is not None
    assert result["currency"] == "SEK"
    assert result["total_cost"] == 348.0  # 2 * 95 + 1 * 158
    assert "3000" in result["cost_per_board_type"]
    assert "5000" in result["cost_per_board_type"]
    assert result["cost_per_board_type"]["3000"] == 190.0  # 2 * 95
    assert result["cost_per_board_type"]["5000"] == 158.0  # 1 * 158
    assert "3000" in result["boards_needed_by_type"]
    assert "5000" in result["boards_needed_by_type"]
    assert result["boards_needed_by_type"]["3000"] == 2
    assert result["boards_needed_by_type"]["5000"] == 1


def test_calculate_cost_analysis_with_bulk_discount():
    """Test cost analysis with bulk discount."""
    cut_list = [
        [2700] for _ in range(10)  # 10 boards of 3000mm
    ]
    board_lengths = [3000]
    board_costs = {
        3000: {
            "price_per_board": 100.0,
            "supplier": "Bauhaus",
            "bulk_discount": 0.15,  # 15% discount
            "minimum_quantity": 10
        }
    }
    
    result = calculate_cost_analysis(cut_list, board_lengths, board_costs, "SEK", 3.0)
    
    # Should get bulk discount: 10 * 100 * 0.85 = 850
    assert result["total_cost"] == 850.0


def test_calculate_cost_analysis_empty_data():
    """Test cost analysis with empty or missing data."""
    # Empty cut list
    result = calculate_cost_analysis([], [3000], {}, "SEK", 3.0)
    assert result is None
    
    # No cost data
    result = calculate_cost_analysis([[2700]], [3000], {}, "SEK", 3.0)
    assert result is None


def test_convert_currency():
    """Test currency conversion."""
    # Same currency
    assert convert_currency(100.0, "SEK", "SEK") == 100.0
    
    # SEK to NOK (0.95 rate)
    result = convert_currency(100.0, "SEK", "NOK")
    assert abs(result - 95.0) < 0.1
    
    # NOK to SEK
    result = convert_currency(95.0, "NOK", "SEK")
    assert abs(result - 100.0) < 0.1
    
    # SEK to EUR (0.095 rate)  
    result = convert_currency(100.0, "SEK", "EUR")
    assert abs(result - 9.5) < 0.1


def test_convert_currency_unsupported():
    """Test currency conversion with unsupported currencies."""
    # Should return original amount if currency not supported
    result = convert_currency(100.0, "SEK", "JPY")
    assert result == 100.0
    
    result = convert_currency(100.0, "GBP", "SEK")
    assert result == 100.0


def test_get_supported_currencies():
    """Test getting list of supported currencies."""
    currencies = get_supported_currencies()
    expected = ["SEK", "NOK", "DKK", "EUR", "USD"]
    
    assert isinstance(currencies, list)
    assert len(currencies) == 5
    assert all(curr in currencies for curr in expected)


def test_material_efficiency_edge_cases():
    """Test material efficiency with edge cases."""
    # Empty cut list
    assert calculate_material_efficiency([], 3000, 3.0) == 0.0
    
    # Cut list with empty boards (empty boards are ignored)
    cut_list = [[], [2700], []]
    efficiency = calculate_material_efficiency(cut_list, 3000, 3.0)
    # Only 2700mm used from 1 * 3000mm (empty boards ignored) = 0.9
    assert abs(efficiency - 0.9) < 0.01


def test_waste_cost_edge_cases():
    """Test waste cost calculation with edge cases."""
    # Empty cut list
    assert calculate_waste_cost([], 3000, 100.0, 3.0) == 0.0
    
    # Perfect fit (no waste)
    cut_list = [[3000]]  # Exactly fills the board
    waste_cost = calculate_waste_cost(cut_list, 3000, 100.0, 0.0)
    assert waste_cost == 0.0


def test_cost_analysis_integration():
    """Integration test with realistic woodworking scenario."""
    # Cabinet project: shelves, back panels, sides
    cut_list = [
        [800, 600, 400, 300],    # Mixed small parts - 3000mm board
        [1200, 800, 600],        # Medium parts - 3000mm board  
        [2400, 500],             # Large + small - 3000mm board
        [1800, 1100],            # Two medium parts - 3000mm board
    ]
    
    board_lengths = [3000]
    board_costs = {
        3000: {
            "price_per_board": 125.0,  # Typical Swedish lumber price
            "supplier": "Bauhaus",
            "bulk_discount": 0.0,
            "minimum_quantity": 1
        }
    }
    
    result = calculate_cost_analysis(cut_list, board_lengths, board_costs, "SEK", 3.2)
    
    assert result is not None
    assert result["currency"] == "SEK"
    assert result["total_cost"] == 500.0  # 4 boards * 125 SEK
    assert result["boards_needed_by_type"]["3000"] == 4
    assert result["material_efficiency"] > 70.0  # Should be efficient cutting
    assert result["waste_cost"] > 0.0  # Some waste expected
    assert result["cost_per_useful_material"] > 0.0