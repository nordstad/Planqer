"""
Cost calculation functionality for Planqer.

Handles material cost analysis, bulk discounts, and cost optimization.
"""

from collections import Counter


def apply_bulk_discount(quantity: int, base_price: float, bulk_discount: float, min_quantity: int) -> float:
    """
    Apply bulk discount if quantity meets minimum requirement.
    
    Args:
        quantity: Number of boards being purchased
        base_price: Base price per board
        bulk_discount: Discount percentage (0.1 = 10%)
        min_quantity: Minimum quantity to qualify for discount
    
    Returns:
        Final price per board after discount
    """
    if quantity >= min_quantity and bulk_discount > 0:
        return base_price * (1 - bulk_discount)
    return base_price


def calculate_boards_needed(cut_list, board_lengths):
    """
    Calculate how many boards of each length are needed based on cut list.
    
    Args:
        cut_list: List of cutting plans, each containing parts for one board
        board_lengths: Available board lengths
    
    Returns:
        Dictionary mapping board length to quantity needed
    """
    boards_needed = Counter()
    
    # For each board in the cut list, determine its length
    for board_cuts in cut_list:
        if not board_cuts:
            continue
            
        # Calculate total length needed for this board (including kerf)
        total_used = sum(board_cuts)
        
        # Find the optimal board length for this cutting plan
        # This should match the logic used in the optimization
        suitable_lengths = [length for length in board_lengths if length >= total_used]
        if suitable_lengths:
            optimal_length = min(suitable_lengths)
            boards_needed[optimal_length] += 1
    
    return dict(boards_needed)


def calculate_material_efficiency(cut_list, board_length, saw_blade_width=3.0):
    """
    Calculate material efficiency as percentage of material actually used.
    
    Args:
        cut_list: Cutting plan
        board_length: Length of boards used
        saw_blade_width: Width of saw kerf
    
    Returns:
        Efficiency percentage (0.0 to 1.0)
    """
    if not cut_list:
        return 0.0
    
    # Count only boards that actually have cuts
    boards_with_cuts = [board for board in cut_list if board]
    if not boards_with_cuts:
        return 0.0
    
    total_material_available = len(boards_with_cuts) * board_length
    total_material_used = 0.0
    
    for board_cuts in boards_with_cuts:
        # Add up all parts cut from this board
        parts_length = sum(board_cuts)
        total_material_used += parts_length
    
    return total_material_used / total_material_available if total_material_available > 0 else 0.0


def calculate_waste_cost(cut_list, board_length, price_per_board, saw_blade_width=3.0):
    """
    Calculate the cost of wasted material.
    
    Args:
        cut_list: Cutting plan
        board_length: Length of boards used
        price_per_board: Price per board
        saw_blade_width: Width of saw kerf
    
    Returns:
        Total cost of wasted material
    """
    if not cut_list:
        return 0.0
    
    total_waste = 0.0
    
    for board_cuts in cut_list:
        if board_cuts:
            parts_length = sum(board_cuts)
            kerf_loss = max(0, len(board_cuts) - 1) * saw_blade_width
            board_waste = board_length - parts_length - kerf_loss
            total_waste += max(0, board_waste)
    
    # Calculate waste cost proportionally
    waste_ratio = total_waste / (len(cut_list) * board_length) if cut_list else 0
    return waste_ratio * len(cut_list) * price_per_board


def calculate_cost_analysis(
    cut_list,
    board_lengths,
    board_costs,
    currency="SEK",
    saw_blade_width=3.0,
    board_lengths_used=None,
):
    """
    Calculate comprehensive cost analysis for a cutting plan.
    
    Args:
        cut_list: Optimized cutting plan
        board_lengths: Available board lengths
        board_costs: Cost information for each board length
        currency: Currency code
        saw_blade_width: Saw kerf width
    
    Returns:
        Detailed cost analysis dictionary
    """
    if not cut_list or not board_costs:
        return None
    
    # The plan already knows which stock length each board came from, kerf
    # included. Trust it; only fall back to re-deriving when it is absent.
    if board_lengths_used:
        boards_needed = dict(Counter(board_lengths_used))
    else:
        boards_needed = calculate_boards_needed(cut_list, board_lengths)
    
    # Calculate costs for each board type
    total_cost = 0.0
    cost_per_board_type = {}
    cost_breakdown = {}
    
    for board_length, quantity in boards_needed.items():
        if board_length in board_costs:
            cost_info = board_costs[board_length]
            base_price = cost_info.get("price_per_board", 0.0)
            bulk_discount = cost_info.get("bulk_discount", 0.0)
            min_quantity = cost_info.get("minimum_quantity", 1)
            
            # Apply bulk discount
            final_price = apply_bulk_discount(quantity, base_price, bulk_discount, min_quantity)
            board_type_cost = final_price * quantity
            
            cost_per_board_type[board_length] = board_type_cost
            total_cost += board_type_cost
    
    # Efficiency and waste cost against the material actually bought, so these
    # agree with the diagram and the answer field instead of guessing at a
    # single "primary" board length.
    total_useful = sum(sum(board_cuts) for board_cuts in cut_list)
    if board_lengths_used:
        material_bought = sum(board_lengths_used)
        material_efficiency = (total_useful / material_bought) if material_bought else 0.0
        kerf_loss = sum(max(len(board_cuts) - 1, 0) for board_cuts in cut_list) * saw_blade_width
        offcut = material_bought - total_useful - kerf_loss
        waste_cost = total_cost * (offcut / material_bought) if material_bought else 0.0
    else:
        primary_board_length = max(boards_needed.keys()) if boards_needed else max(board_lengths)
        material_efficiency = calculate_material_efficiency(cut_list, primary_board_length, saw_blade_width)
        primary_cost_info = board_costs.get(primary_board_length, {})
        primary_price = primary_cost_info.get("price_per_board", 0.0)
        waste_cost = calculate_waste_cost(cut_list, primary_board_length, primary_price, saw_blade_width)
    
    # Calculate total useful material length
    total_useful_material = sum(sum(board_cuts) for board_cuts in cut_list)
    cost_per_useful_material = total_cost / total_useful_material if total_useful_material > 0 else 0.0
    
    # Build cost breakdown
    cost_breakdown = {
        "material_cost": total_cost,
        "waste_cost": waste_cost,
        "total_project_cost": total_cost
    }
    
    return {
        "total_cost": round(total_cost, 2),
        "currency": currency,
        "cost_per_board_type": {str(k): round(v, 2) for k, v in cost_per_board_type.items()},
        "boards_needed_by_type": {str(k): v for k, v in boards_needed.items()},
        "waste_cost": round(waste_cost, 2),
        "material_efficiency": round(material_efficiency * 100, 1),  # Convert to percentage
        "cost_per_useful_material": round(cost_per_useful_material, 4),
        "cost_breakdown": {k: round(v, 2) for k, v in cost_breakdown.items()}
    }


# Currency conversion rates (1 SEK equals X of other currency)
# In a real application, these would be fetched from a currency API
CURRENCY_RATES = {
    "SEK": 1.0,      # Swedish Krona (base)
    "NOK": 0.95,     # 1 SEK = 0.95 NOK
    "DKK": 0.67,     # 1 SEK = 0.67 DKK
    "EUR": 0.095,    # 1 SEK = 0.095 EUR
    "USD": 0.089     # 1 SEK = 0.089 USD
}


def convert_currency(amount: float, from_currency: str, to_currency: str) -> float:
    """
    Convert amount between supported currencies.
    
    Args:
        amount: Amount to convert
        from_currency: Source currency code
        to_currency: Target currency code
    
    Returns:
        Converted amount
    """
    if from_currency == to_currency:
        return amount
    
    if from_currency not in CURRENCY_RATES or to_currency not in CURRENCY_RATES:
        return amount  # Return original if conversion not supported
    
    # Convert to SEK first, then to target currency
    if from_currency == "SEK":
        return amount * CURRENCY_RATES[to_currency]
    elif to_currency == "SEK":
        return amount / CURRENCY_RATES[from_currency]
    else:
        # Convert via SEK
        sek_amount = amount / CURRENCY_RATES[from_currency]
        return sek_amount * CURRENCY_RATES[to_currency]


def get_supported_currencies():
    """Get list of supported currency codes."""
    return list(CURRENCY_RATES.keys())