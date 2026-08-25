def min_boards_required_with_cut_list(
    parts: dict, board_length: float, saw_blade_width: float = 0.3
) -> tuple[int, list[list[float]]]:
    """
    Optimized First Fit Decreasing algorithm for part packing with kerf support.

    Args:
        parts: dict of {length: quantity}
        board_length: max length per board
        saw_blade_width: kerf (gap between parts)

    Returns:
        (number of boards, list of boards)
    """
    # Expand all parts into list
    part_list = []
    for length, count in parts.items():
        length = float(length)
        count = int(count)
        part_list.extend([length] * count)

    part_list.sort(reverse=True)

    boards: list[list[float]] = []

    for part in part_list:
        placed = False
        for i in range(len(boards)):
            used = sum(boards[i])
            kerf_total = (len(boards[i]) - 1) * saw_blade_width if boards[i] else 0.0
            available = board_length - used - kerf_total

            # When adding a part to non-empty board, we need space for part + kerf
            required_space = part + (saw_blade_width if boards[i] else 0)
            if required_space <= available:
                boards[i].append(part)
                placed = True
                break

        if not placed:
            # Start new board
            boards.append([part])

    return len(boards), boards
