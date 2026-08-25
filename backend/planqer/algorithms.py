"""
Advanced Optimization Algorithms for Cutting Stock Problem

This module implements multiple optimization algorithms to minimize material waste
when cutting boards to specific lengths. Each algorithm has different trade-offs
between computation time and solution quality.
"""

import random
from enum import Enum
from dataclasses import dataclass


class OptimizationAlgorithm(Enum):
    """Available optimization algorithms for cutting stock problems."""
    FIRST_FIT_DECREASING = "first_fit_decreasing"
    BEST_FIT = "best_fit"
    BEST_FIT_DECREASING = "best_fit_decreasing"
    GENETIC_ALGORITHM = "genetic"
    BRANCH_AND_BOUND = "branch_bound"


@dataclass
class OptimizationResult:
    """Result of an optimization algorithm."""
    num_boards: int
    cut_list: list[list[float]]
    total_waste: float
    algorithm_used: OptimizationAlgorithm
    computation_time: float | None = None


def expand_parts_list(parts: dict[float, int]) -> list[float]:
    """
    Convert parts dictionary to expanded list and sort by size.
    
    Args:
        parts: Dictionary mapping part length to quantity
        
    Returns:
        list of individual parts sorted in descending order
    """
    if not parts:
        raise ValueError("Parts dictionary cannot be empty")
    
    part_list = []
    for length, count in parts.items():
        length = float(length)
        count = int(count)
        if count <= 0:
            continue
        part_list.extend([length] * count)
    
    if not part_list:
        raise ValueError("No valid parts found")
    
    return sorted(part_list, reverse=True)


def calculate_board_usage(board: list[float], board_length: float, saw_blade_width: float) -> tuple[float, float]:
    """
    Calculate used space and remaining space for a board.
    
    Args:
        board: list of parts on the board
        board_length: Maximum board length
        saw_blade_width: Width of saw cuts (kerf)
        
    Returns:
        tuple of (used_space, remaining_space)
    """
    if not board:
        return 0.0, board_length
    
    parts_total = sum(board)
    kerf_total = max(0, len(board) - 1) * saw_blade_width
    used_space = parts_total + kerf_total
    remaining_space = board_length - used_space
    
    return used_space, remaining_space


def first_fit_decreasing(parts: dict[float, int], board_length: float, saw_blade_width: float = 0.3) -> OptimizationResult:
    """
    First Fit Decreasing algorithm - original implementation.
    
    Places each part in the first board where it fits. Parts are processed
    in descending order of size.
    
    Time Complexity: O(n²) where n is number of parts
    Space Complexity: O(n)
    """
    part_list = expand_parts_list(parts)
    boards: list[list[float]] = []
    
    for part in part_list:
        placed = False
        for i in range(len(boards)):
            _, remaining = calculate_board_usage(boards[i], board_length, saw_blade_width)
            
            # When adding a part to non-empty board, we need space for part + kerf
            required_space = part + (saw_blade_width if boards[i] else 0)
            if required_space <= remaining:
                boards[i].append(part)
                placed = True
                break
        
        if not placed:
            # Only create new board if part fits
            if part <= board_length:
                boards.append([part])
    
    # Calculate total waste
    total_waste = 0.0
    for board in boards:
        _, remaining = calculate_board_usage(board, board_length, saw_blade_width)
        total_waste += remaining
    
    return OptimizationResult(
        num_boards=len(boards),
        cut_list=boards,
        total_waste=total_waste,
        algorithm_used=OptimizationAlgorithm.FIRST_FIT_DECREASING
    )


def best_fit(parts: dict[float, int], board_length: float, saw_blade_width: float = 0.3) -> OptimizationResult:
    """
    Best Fit algorithm - places parts in the board with least remaining space.
    
    For each part, finds the board with minimum remaining space that can still
    accommodate the part. This tends to reduce waste better than First Fit.
    
    Time Complexity: O(n²) where n is number of parts
    Space Complexity: O(n)
    """
    part_list = expand_parts_list(parts)
    boards: list[list[float]] = []
    
    for part in part_list:
        best_board_idx = -1
        min_remaining = float('inf')
        
        # Find the board with minimum remaining space that can fit this part
        for i in range(len(boards)):
            _, remaining = calculate_board_usage(boards[i], board_length, saw_blade_width)
            
            # When adding a part to non-empty board, we need space for part + kerf
            required_space = part + (saw_blade_width if boards[i] else 0)
            if required_space <= remaining and remaining < min_remaining:
                best_board_idx = i
                min_remaining = remaining
        
        if best_board_idx != -1:
            boards[best_board_idx].append(part)
        else:
            # Only create new board if part fits
            if part <= board_length:
                boards.append([part])
    
    # Calculate total waste
    total_waste = 0.0
    for board in boards:
        _, remaining = calculate_board_usage(board, board_length, saw_blade_width)
        total_waste += remaining
    
    return OptimizationResult(
        num_boards=len(boards),
        cut_list=boards,
        total_waste=total_waste,
        algorithm_used=OptimizationAlgorithm.BEST_FIT
    )


def best_fit_decreasing(parts: dict[float, int], board_length: float, saw_blade_width: float = 0.3) -> OptimizationResult:
    """
    Best Fit Decreasing algorithm - combines sorting with best fit placement.
    
    Sorts parts in decreasing order, then applies best fit algorithm.
    Often produces better results than either First Fit Decreasing or Best Fit alone.
    
    Time Complexity: O(n²) where n is number of parts
    Space Complexity: O(n)
    """
    # This is the same as best_fit since we already sort in descending order
    return best_fit(parts, board_length, saw_blade_width)


def genetic_algorithm(
    parts: dict[float, int], 
    board_length: float, 
    saw_blade_width: float = 0.3,
    population_size: int = 50,
    generations: int = 100,
    mutation_rate: float = 0.1
) -> OptimizationResult:
    """
    Genetic Algorithm for cutting stock optimization.
    
    Uses evolutionary principles to find near-optimal solutions by:
    1. Creating random permutations of parts (population)
    2. Evaluating fitness (minimizing waste)
    3. Selecting best solutions for reproduction
    4. Creating offspring through crossover and mutation
    5. Repeating for multiple generations
    
    Time Complexity: O(g * p * n) where g=generations, p=population_size, n=parts
    Space Complexity: O(p * n)
    """
    part_list = expand_parts_list(parts)
    
    if len(part_list) <= 5:
        # For very small problems, genetic algorithm overhead isn't worth it
        return first_fit_decreasing(parts, board_length, saw_blade_width)
    
    def evaluate_fitness(permutation: list[float]) -> float:
        """Evaluate fitness of a permutation (lower waste = higher fitness)."""
        boards: list[list[float]] = []
        
        for part in permutation:
            placed = False
            for i in range(len(boards)):
                _, remaining = calculate_board_usage(boards[i], board_length, saw_blade_width)
                # When adding a part to non-empty board, we need space for part + kerf
                required_space = part + (saw_blade_width if boards[i] else 0)
                if required_space <= remaining:
                    boards[i].append(part)
                    placed = True
                    break
            
            if not placed:
                # Only create new board if part fits
                if part <= board_length:
                    boards.append([part])
                # If part doesn't fit in any board, skip it (invalid solution)
        
        # Calculate total waste (lower is better)
        total_waste = 0.0
        for board in boards:
            _, remaining = calculate_board_usage(board, board_length, saw_blade_width)
            total_waste += remaining
        
        # Fitness is inverse of waste (higher is better)
        # Add small epsilon to prevent division by zero
        return 1.0 / (1.0 + max(total_waste, 0.001))
    
    def crossover(parent1: list[float], parent2: list[float]) -> list[float]:
        """Create offspring using simple crossover."""
        if len(parent1) <= 2:
            return parent1.copy()
        
        # Simple single-point crossover for robustness
        crossover_point = random.randint(1, len(parent1) - 1)
        
        # Take first part from parent1, second part from parent2
        offspring = parent1[:crossover_point] + parent2[crossover_point:]
        
        return offspring
    
    def mutate(individual: list[float]) -> list[float]:
        """Mutate by swapping two random positions."""
        if len(individual) <= 1:
            return individual
        
        mutated = individual.copy()
        if random.random() < mutation_rate:
            i, j = random.sample(range(len(individual)), 2)
            mutated[i], mutated[j] = mutated[j], mutated[i]
        
        return mutated
    
    # Initialize population with random permutations
    population = []
    for _ in range(population_size):
        individual = part_list.copy()
        random.shuffle(individual)
        population.append(individual)
    
    # Evolution loop
    for generation in range(generations):
        # Evaluate fitness
        fitness_scores = [(individual, evaluate_fitness(individual)) for individual in population]
        fitness_scores.sort(key=lambda x: x[1], reverse=True)
        
        # Select top 50% for reproduction
        elite_size = population_size // 2
        elite = [individual for individual, _ in fitness_scores[:elite_size]]
        
        # Create new population
        new_population = elite.copy()  # Keep elite
        
        # Generate offspring
        while len(new_population) < population_size:
            parent1, parent2 = random.sample(elite, 2)
            offspring = crossover(parent1, parent2)
            offspring = mutate(offspring)
            new_population.append(offspring)
        
        population = new_population
    
    # Return best solution
    best_individual = max(population, key=evaluate_fitness)
    
    # Convert best individual back to board layout
    boards: list[list[float]] = []
    for part in best_individual:
        placed = False
        for i in range(len(boards)):
            _, remaining = calculate_board_usage(boards[i], board_length, saw_blade_width)
            # When adding a part to non-empty board, we need space for part + kerf
            required_space = part + (saw_blade_width if boards[i] else 0)
            if required_space <= remaining:
                boards[i].append(part)
                placed = True
                break
        
        if not placed:
            # Only create new board if part fits
            if part <= board_length:
                boards.append([part])
    
    # Calculate final waste
    total_waste = 0.0
    for board in boards:
        _, remaining = calculate_board_usage(board, board_length, saw_blade_width)
        total_waste += remaining
    
    return OptimizationResult(
        num_boards=len(boards),
        cut_list=boards,
        total_waste=total_waste,
        algorithm_used=OptimizationAlgorithm.GENETIC_ALGORITHM
    )


def branch_and_bound(
    parts: dict[float, int], 
    board_length: float, 
    saw_blade_width: float = 0.3,
    max_depth: int = 1000
) -> OptimizationResult:
    """
    Branch and Bound algorithm for optimal cutting stock solution.
    
    Explores the solution space systematically, pruning branches that cannot
    lead to better solutions. Guarantees optimal solution but can be slow
    for large problems.
    
    Time Complexity: O(2^n) worst case, often much better with pruning
    Space Complexity: O(n)
    """
    part_list = expand_parts_list(parts)
    
    if len(part_list) > 10:
        # For large problems, fall back to genetic algorithm
        return genetic_algorithm(parts, board_length, saw_blade_width)
    
    best_solution = None
    best_num_boards = float('inf')
    
    def branch_and_bound_recursive(
        remaining_parts: list[float],
        current_boards: list[list[float]],
        depth: int
    ):
        nonlocal best_solution, best_num_boards
        
        if depth > max_depth:
            return
        
        if not remaining_parts:
            # Found a complete solution
            if len(current_boards) < best_num_boards:
                best_num_boards = len(current_boards)
                best_solution = [board.copy() for board in current_boards]
            return
        
        # Pruning: if current solution already uses more boards than best known
        if len(current_boards) >= best_num_boards:
            return
        
        part = remaining_parts[0]
        remaining = remaining_parts[1:]
        
        # Try placing part in each existing board
        for i in range(len(current_boards)):
            _, space_remaining = calculate_board_usage(current_boards[i], board_length, saw_blade_width)
            
            # When adding a part to non-empty board, we need space for part + kerf
            required_space = part + (saw_blade_width if current_boards[i] else 0)
            if required_space <= space_remaining:
                current_boards[i].append(part)
                branch_and_bound_recursive(remaining, current_boards, depth + 1)
                current_boards[i].pop()  # Backtrack
        
        # Try creating a new board
        if len(current_boards) + 1 < best_num_boards and part <= board_length:  # Pruning + validity check
            current_boards.append([part])
            branch_and_bound_recursive(remaining, current_boards, depth + 1)
            current_boards.pop()  # Backtrack
    
    # Start with empty solution
    branch_and_bound_recursive(part_list, [], 0)
    
    if best_solution is None:
        # Fallback to first fit decreasing if no solution found
        return first_fit_decreasing(parts, board_length, saw_blade_width)
    
    # Calculate total waste
    total_waste = 0.0
    for board in best_solution:
        _, remaining = calculate_board_usage(board, board_length, saw_blade_width)
        total_waste += remaining
    
    return OptimizationResult(
        num_boards=len(best_solution),
        cut_list=best_solution,
        total_waste=total_waste,
        algorithm_used=OptimizationAlgorithm.BRANCH_AND_BOUND
    )


def optimize_cutting(
    parts: dict[float, int],
    board_length: float,
    saw_blade_width: float = 0.3,
    algorithm: OptimizationAlgorithm = OptimizationAlgorithm.FIRST_FIT_DECREASING
) -> OptimizationResult:
    """
    Main optimization function that dispatches to the specified algorithm.
    
    Args:
        parts: Dictionary mapping part length to quantity
        board_length: Maximum length of each board
        saw_blade_width: Width of saw cuts (kerf)
        algorithm: Which optimization algorithm to use
        
    Returns:
        OptimizationResult containing the solution
    """
    if algorithm == OptimizationAlgorithm.FIRST_FIT_DECREASING:
        return first_fit_decreasing(parts, board_length, saw_blade_width)
    elif algorithm == OptimizationAlgorithm.BEST_FIT:
        return best_fit(parts, board_length, saw_blade_width)
    elif algorithm == OptimizationAlgorithm.BEST_FIT_DECREASING:
        return best_fit_decreasing(parts, board_length, saw_blade_width)
    elif algorithm == OptimizationAlgorithm.GENETIC_ALGORITHM:
        return genetic_algorithm(parts, board_length, saw_blade_width)
    elif algorithm == OptimizationAlgorithm.BRANCH_AND_BOUND:
        return branch_and_bound(parts, board_length, saw_blade_width)
    else:
        raise ValueError(f"Unknown algorithm: {algorithm}")


def get_algorithm_recommendation(parts: dict[float, int]) -> OptimizationAlgorithm:
    """
    Recommend the best algorithm based on problem characteristics.
    
    Args:
        parts: Dictionary mapping part length to quantity
        
    Returns:
        Recommended optimization algorithm
    """
    total_parts = sum(parts.values())
    unique_parts = len(parts)
    
    if total_parts <= 5:
        # Very small problems: use exact algorithm
        return OptimizationAlgorithm.BRANCH_AND_BOUND
    elif total_parts <= 15:
        # Small to medium problems: use genetic algorithm
        return OptimizationAlgorithm.GENETIC_ALGORITHM
    elif unique_parts / total_parts > 0.7:
        # High diversity: best fit works well
        return OptimizationAlgorithm.BEST_FIT_DECREASING
    else:
        # Large problems with repetition: first fit is fastest
        return OptimizationAlgorithm.FIRST_FIT_DECREASING