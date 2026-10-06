"""
Sheet Material Optimization for 2D Cutting Stock Problem

This module implements 2D bin packing algorithms to minimize material waste
when cutting rectangular parts from sheet materials like plywood, metal sheets, etc.

Key Features:
- Bottom-Left Fill (BLF) algorithm for efficient rectangular packing
- Support for multiple sheet sizes and materials
- Kerf consideration for saw blade width
- Rotation support for better space utilization
- Waste calculation and optimization metrics
"""

import logging
from dataclasses import dataclass
from enum import Enum
from itertools import combinations

from planqer.validation import validate_sheet_workload

logger = logging.getLogger(__name__)


class SheetOptimizationAlgorithm(Enum):
    """Available algorithms for 2D sheet optimization."""

    BOTTOM_LEFT_FILL = "bottom_left_fill"
    BEST_FIT_2D = "best_fit_2d"
    GENETIC_2D = "genetic_2d"
    GUILLOTINE_CUT = "guillotine_cut"


@dataclass
class Rectangle:
    """Represents a rectangular part or placement."""

    width: float
    height: float
    x: float = 0.0
    y: float = 0.0
    part_id: str = ""
    rotated: bool = False

    @property
    def area(self) -> float:
        """Calculate area of the rectangle."""
        return self.width * self.height

    def rotate(self) -> "Rectangle":
        """Return a rotated version of this rectangle."""
        return Rectangle(
            width=self.height,
            height=self.width,
            x=self.x,
            y=self.y,
            part_id=self.part_id,
            rotated=not self.rotated,
        )

    def copy(self) -> "Rectangle":
        """Return an independent copy of the rectangle."""
        return Rectangle(
            width=self.width,
            height=self.height,
            x=self.x,
            y=self.y,
            part_id=self.part_id,
            rotated=self.rotated,
        )

    def fits_in(
        self, sheet_width: float, sheet_height: float, kerf: float = 0.0
    ) -> bool:
        """Check if rectangle fits within sheet dimensions considering kerf."""
        return self.width + kerf <= sheet_width and self.height + kerf <= sheet_height

    def overlaps_with(self, other: "Rectangle", kerf: float = 0.0) -> bool:
        """Check if this rectangle overlaps with another considering kerf."""
        # Expand both rectangles by kerf/2 on all sides
        # Two rectangles overlap if their expanded versions overlap

        self_left = self.x - kerf / 2
        self_right = self.x + self.width + kerf / 2
        self_bottom = self.y - kerf / 2
        self_top = self.y + self.height + kerf / 2

        other_left = other.x - kerf / 2
        other_right = other.x + other.width + kerf / 2
        other_bottom = other.y - kerf / 2
        other_top = other.y + other.height + kerf / 2

        # Check if expanded rectangles overlap
        return not (
            self_right <= other_left
            or other_right <= self_left
            or self_top <= other_bottom
            or other_top <= self_bottom
        )


@dataclass
class SheetLayout:
    """Represents the layout of parts on a single sheet."""

    sheet_width: float
    sheet_height: float
    parts: list[Rectangle]
    material_type: str = "plywood"
    kerf_width: float = 3.0  # Default 3mm kerf

    @property
    def used_area(self) -> float:
        """Calculate total area used by parts."""
        return sum(part.area for part in self.parts)

    @property
    def total_area(self) -> float:
        """Calculate total sheet area."""
        return self.sheet_width * self.sheet_height

    @property
    def waste_area(self) -> float:
        """Calculate waste area."""
        return self.total_area - self.used_area

    @property
    def efficiency(self) -> float:
        """Calculate material efficiency percentage."""
        if self.total_area == 0:
            return 0.0
        return (self.used_area / self.total_area) * 100

    def can_place_part(self, part: Rectangle, x: float, y: float) -> bool:
        """Check if a part can be placed at given coordinates."""
        test_part = Rectangle(part.width, part.height, x, y, part.part_id)

        # Check sheet boundaries (part must fit completely within sheet)
        if x + part.width > self.sheet_width or y + part.height > self.sheet_height:
            return False

        # Check overlaps with existing parts
        for existing_part in self.parts:
            if test_part.overlaps_with(existing_part, self.kerf_width):
                return False

        return True

    def place_part(self, part: Rectangle, x: float, y: float) -> bool:
        """Attempt to place a part at given coordinates."""
        if self.can_place_part(part, x, y):
            placed_part = Rectangle(
                part.width, part.height, x, y, part.part_id, part.rotated
            )
            self.parts.append(placed_part)
            return True
        return False


@dataclass
class SheetOptimizationResult:
    """Result of sheet optimization containing multiple sheets."""

    sheets: list[SheetLayout]
    algorithm_used: SheetOptimizationAlgorithm
    total_sheets: int
    total_waste_area: float
    overall_efficiency: float
    computation_time: float | None = None

    @property
    def total_used_area(self) -> float:
        """Calculate total area used across all sheets."""
        return sum(sheet.used_area for sheet in self.sheets)

    @property
    def total_sheet_area(self) -> float:
        """Calculate total area of all sheets."""
        return sum(sheet.total_area for sheet in self.sheets)


def expand_sheet_parts(parts: dict[str, dict]) -> list[Rectangle]:
    """
    Convert parts dictionary to list of Rectangle objects.

    Args:
        parts: dict with format:
            {
                "part_id": {
                    "width": float,
                    "height": float,
                    "quantity": int
                }
            }

    Returns:
        list of Rectangle objects sorted by area (largest first)
    """
    if not parts:
        raise ValueError("Parts dictionary cannot be empty")

    rectangles = []

    for part_id, specs in parts.items():
        width = float(specs["width"])
        height = float(specs["height"])
        quantity = int(specs["quantity"])

        if quantity <= 0:
            continue  # Skip parts with zero or negative quantity

        for i in range(quantity):
            rect = Rectangle(width=width, height=height, part_id=f"{part_id}_{i + 1}")
            rectangles.append(rect)

    if not rectangles:
        raise ValueError("No valid parts found with positive quantities")

    # Sort by area (largest first) for better packing
    return sorted(rectangles, key=lambda r: r.area, reverse=True)


def _validate_parts_fit(
    rectangles: list[Rectangle],
    sheet_width: float,
    sheet_height: float,
    allow_rotation: bool,
) -> None:
    """Reject parts that cannot fit on any sheet in an allowed orientation."""
    for rectangle in rectangles:
        fits = rectangle.width <= sheet_width and rectangle.height <= sheet_height
        rotated_fits = (
            rectangle.height <= sheet_width and rectangle.width <= sheet_height
        )
        if not fits and not (allow_rotation and rotated_fits):
            raise ValueError(f"Part {rectangle.part_id} does not fit on the sheet")


def bottom_left_fill_algorithm(
    parts: dict[str, dict],
    sheet_width: float,
    sheet_height: float,
    kerf_width: float = 3.0,
    allow_rotation: bool = True,
) -> SheetOptimizationResult:
    """
    Bottom-Left Fill algorithm for 2D rectangular packing.

    Places each rectangle at the lowest possible position, then the leftmost
    position at that height. This is a simple but effective heuristic.

    Args:
        parts: Dictionary of parts with dimensions and quantities
        sheet_width: Width of each sheet
        sheet_height: Height of each sheet
        kerf_width: Width of saw cuts (kerf)
        allow_rotation: Whether to allow 90-degree rotation of parts

    Returns:
        SheetOptimizationResult with optimized layout
    """
    rectangles = expand_sheet_parts(parts)
    _validate_parts_fit(rectangles, sheet_width, sheet_height, allow_rotation)
    sheets = []
    current_sheet = SheetLayout(sheet_width, sheet_height, [], kerf_width=kerf_width)

    for rect in rectangles:
        placed = False

        # Try both orientations if rotation is allowed
        orientations = [rect]
        if allow_rotation and rect.width != rect.height:
            orientations.append(rect.rotate())

        for orientation in orientations:
            # Check if part can fit in sheet at all
            if orientation.width > sheet_width or orientation.height > sheet_height:
                continue  # Try next orientation

            # Try to place in current sheet using bottom-left strategy
            best_position = find_bottom_left_position(current_sheet, orientation)

            if best_position:
                x, y = best_position
                if current_sheet.place_part(orientation, x, y):
                    placed = True
                    break

        if not placed:
            # Start new sheet
            if current_sheet.parts:  # Only add if has parts
                sheets.append(current_sheet)

            current_sheet = SheetLayout(
                sheet_width, sheet_height, [], kerf_width=kerf_width
            )

            # Try to place in new sheet
            for orientation in orientations:
                # Check if part can fit in sheet at all
                if orientation.width > sheet_width or orientation.height > sheet_height:
                    continue  # Try next orientation

                if current_sheet.place_part(orientation, 0, 0):
                    placed = True
                    break

            if not placed:
                raise ValueError(f"Part {rect.part_id} could not be placed")

    # Add the last sheet if it has parts
    if current_sheet.parts:
        sheets.append(current_sheet)

    # Calculate metrics
    total_waste = sum(sheet.waste_area for sheet in sheets)
    total_used = sum(sheet.used_area for sheet in sheets)
    total_area = sum(sheet.total_area for sheet in sheets)
    overall_efficiency = (total_used / total_area * 100) if total_area > 0 else 0

    return SheetOptimizationResult(
        sheets=sheets,
        algorithm_used=SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL,
        total_sheets=len(sheets),
        total_waste_area=total_waste,
        overall_efficiency=overall_efficiency,
    )


def find_bottom_left_position(
    sheet: SheetLayout, part: Rectangle
) -> tuple[float, float] | None:
    """
    Find the bottom-left position where a part can be placed.

    Args:
        sheet: Current sheet layout
        part: Part to place

    Returns:
        (x, y) coordinates if position found, None otherwise
    """
    # Generate candidate positions
    candidates = [(0, 0)]  # Always try bottom-left corner

    # Add positions based on existing parts
    for existing_part in sheet.parts:
        # Right edge of existing part
        candidates.append(
            (existing_part.x + existing_part.width + sheet.kerf_width, existing_part.y)
        )

        # Top edge of existing part
        candidates.append(
            (existing_part.x, existing_part.y + existing_part.height + sheet.kerf_width)
        )

    # Sort candidates by y-coordinate first (bottom), then x-coordinate (left)
    candidates.sort(key=lambda pos: (pos[1], pos[0]))

    # Find first valid position
    for x, y in candidates:
        if sheet.can_place_part(part, x, y):
            return (x, y)

    return None


def best_fit_2d_algorithm(
    parts: dict[str, dict],
    sheet_width: float,
    sheet_height: float,
    kerf_width: float = 3.0,
    allow_rotation: bool = True,
) -> SheetOptimizationResult:
    """
    Best Fit 2D algorithm for sheet optimization.

    For each part, finds the sheet and position that minimizes the occupied
    envelope, then uses deterministic tie-breakers. Unlike total sheet waste,
    the envelope changes with placement and captures how much usable geometry
    a candidate leaves fragmented.
    """
    rectangles = expand_sheet_parts(parts)
    _validate_parts_fit(rectangles, sheet_width, sheet_height, allow_rotation)
    sheets = []

    for rect in rectangles:
        best_sheet_idx = -1
        best_position = None
        best_placement_score = None
        best_orientation = rect

        # Try both orientations if rotation is allowed
        orientations = [rect]
        if allow_rotation and rect.width != rect.height:
            orientations.append(rect.rotate())

        # Try placing in existing sheets
        for i, sheet in enumerate(sheets):
            for orientation in orientations:
                if orientation.width > sheet_width or orientation.height > sheet_height:
                    continue

                position = find_best_fit_position(sheet, orientation)
                if position:
                    x, y = position
                    placement_score = _placement_score(sheet, orientation, position)
                    if (
                        best_placement_score is None
                        or placement_score < best_placement_score
                    ):
                        best_placement_score = placement_score
                        best_sheet_idx = i
                        best_position = (x, y)
                        best_orientation = orientation

        # Place in best existing sheet if found
        if best_sheet_idx != -1 and best_position:
            x, y = best_position
            sheets[best_sheet_idx].place_part(best_orientation, x, y)
        else:
            # Create new sheet
            new_sheet = SheetLayout(
                sheet_width, sheet_height, [], kerf_width=kerf_width
            )

            # Try to place in new sheet
            placed = False
            for orientation in orientations:
                if orientation.width > sheet_width or orientation.height > sheet_height:
                    continue
                if new_sheet.place_part(orientation, 0, 0):
                    placed = True
                    break

            if placed:
                sheets.append(new_sheet)
            else:
                raise ValueError(f"Part {rect.part_id} could not be placed")

    # Calculate metrics
    total_waste = sum(sheet.waste_area for sheet in sheets)
    total_used = sum(sheet.used_area for sheet in sheets)
    total_area = sum(sheet.total_area for sheet in sheets)
    overall_efficiency = (total_used / total_area * 100) if total_area > 0 else 0

    return SheetOptimizationResult(
        sheets=sheets,
        algorithm_used=SheetOptimizationAlgorithm.BEST_FIT_2D,
        total_sheets=len(sheets),
        total_waste_area=total_waste,
        overall_efficiency=overall_efficiency,
    )


def find_best_fit_position(
    sheet: SheetLayout, part: Rectangle
) -> tuple[float, float] | None:
    """
    Find the position that minimizes placement-sensitive fragmentation.
    """
    # Generate more candidate positions than bottom-left
    candidates = [(0, 0)]

    # Add positions from existing parts
    for existing_part in sheet.parts:
        # Four corners around each existing part
        candidates.extend(
            [
                (
                    existing_part.x + existing_part.width + sheet.kerf_width,
                    existing_part.y,
                ),
                (
                    existing_part.x,
                    existing_part.y + existing_part.height + sheet.kerf_width,
                ),
                (
                    existing_part.x + existing_part.width + sheet.kerf_width,
                    existing_part.y + existing_part.height + sheet.kerf_width,
                ),
                (existing_part.x - part.width - sheet.kerf_width, existing_part.y),
                (existing_part.x, existing_part.y - part.height - sheet.kerf_width),
            ]
        )

    # Filter out invalid positions and score the resulting occupied envelope.
    valid_positions = []
    for x, y in candidates:
        if x >= 0 and y >= 0 and sheet.can_place_part(part, x, y):
            valid_positions.append(((x, y), _placement_score(sheet, part, (x, y))))

    if not valid_positions:
        return None

    return min(valid_positions, key=lambda candidate: candidate[1])[0]


def _placement_score(
    sheet: SheetLayout, part: Rectangle, position: tuple[float, float]
) -> tuple[float, float, float, float, float, float]:
    """Score a candidate by the geometry it leaves behind.

    Total sheet waste is invariant for every position of the same part. The
    occupied envelope is not: a compact envelope leaves larger contiguous
    residual regions than a placement that stretches the layout in both axes.
    The remaining tuple entries make equal envelopes deterministic and prefer
    the lower/left placement without relying on candidate iteration order.
    """
    x, y = position
    right = x + part.width
    top = y + part.height
    left = min([0.0, *(existing.x for existing in sheet.parts), x])
    bottom = min([0.0, *(existing.y for existing in sheet.parts), y])
    right = max([right, *(existing.x + existing.width for existing in sheet.parts)])
    top = max([top, *(existing.y + existing.height for existing in sheet.parts)])
    envelope_width = right - left
    envelope_height = top - bottom
    envelope_area = envelope_width * envelope_height
    envelope_perimeter = 2 * (envelope_width + envelope_height)
    return (envelope_area, envelope_perimeter, right, top, y, x)


def guillotine_cut_algorithm(
    parts: dict[str, dict],
    sheet_width: float,
    sheet_height: float,
    kerf_width: float = 3.0,
    allow_rotation: bool = True,
) -> SheetOptimizationResult:
    """
    Guillotine Cut algorithm - ensures all cuts are straight lines.

    This algorithm maintains the property that cuts can be made with straight
    lines from edge to edge, which is important for some manufacturing processes.
    """
    rectangles = expand_sheet_parts(parts)
    _validate_parts_fit(rectangles, sheet_width, sheet_height, allow_rotation)
    sheets = []

    # For each sheet, maintain a list of free rectangles
    for rect in rectangles:
        placed = False

        # Try both orientations
        orientations = [rect]
        if allow_rotation and rect.width != rect.height:
            orientations.append(rect.rotate())

        # Try existing sheets first
        for sheet in sheets:
            for orientation in orientations:
                if _place_with_guillotine(sheet, orientation):
                    placed = True
                    break
            if placed:
                break

        if not placed:
            # Create new sheet
            new_sheet = SheetLayout(
                sheet_width, sheet_height, [], kerf_width=kerf_width
            )
            new_sheet.free_rectangles = [Rectangle(sheet_width, sheet_height, 0, 0)]

            for orientation in orientations:
                if _place_with_guillotine(new_sheet, orientation):
                    sheets.append(new_sheet)
                    placed = True
                    break
            if not placed:
                raise ValueError(f"Part {rect.part_id} could not be placed")

    # Calculate metrics
    total_waste = sum(sheet.waste_area for sheet in sheets)
    total_used = sum(sheet.used_area for sheet in sheets)
    total_area = sum(sheet.total_area for sheet in sheets)
    overall_efficiency = (total_used / total_area * 100) if total_area > 0 else 0

    return SheetOptimizationResult(
        sheets=sheets,
        algorithm_used=SheetOptimizationAlgorithm.GUILLOTINE_CUT,
        total_sheets=len(sheets),
        total_waste_area=total_waste,
        overall_efficiency=overall_efficiency,
    )


def _place_with_guillotine(sheet: SheetLayout, part: Rectangle) -> bool:
    """Helper function for guillotine algorithm."""
    if not hasattr(sheet, "free_rectangles"):
        sheet.free_rectangles = [Rectangle(sheet.sheet_width, sheet.sheet_height, 0, 0)]

    # Find a free rectangle that can fit the part
    for i, free_rect in enumerate(sheet.free_rectangles):
        if part.width <= free_rect.width and part.height <= free_rect.height:
            # Place the part at the free rectangle's position
            placed_part = Rectangle(
                part.width,
                part.height,
                free_rect.x,
                free_rect.y,
                part.part_id,
                part.rotated,
            )
            sheet.parts.append(placed_part)

            # Remove the used free rectangle
            del sheet.free_rectangles[i]

            # Add new free rectangles from the split
            if free_rect.width > part.width:
                # Right split
                right_rect = Rectangle(
                    free_rect.width - part.width - sheet.kerf_width,
                    free_rect.height,
                    free_rect.x + part.width + sheet.kerf_width,
                    free_rect.y,
                )
                if right_rect.width > 0:
                    sheet.free_rectangles.append(right_rect)

            if free_rect.height > part.height:
                # Top split
                top_rect = Rectangle(
                    part.width,
                    free_rect.height - part.height - sheet.kerf_width,
                    free_rect.x,
                    free_rect.y + part.height + sheet.kerf_width,
                )
                if top_rect.height > 0:
                    sheet.free_rectangles.append(top_rect)

            return True

    return False


def genetic_2d_algorithm(
    parts: dict[str, dict],
    sheet_width: float,
    sheet_height: float,
    kerf_width: float = 3.0,
    allow_rotation: bool = True,
    population_size: int = 30,
    generations: int = 50,
) -> SheetOptimizationResult:
    """
    Genetic Algorithm for 2D sheet optimization.

    Uses evolutionary principles to find near-optimal sheet layouts by:
    1. Creating random layouts (population)
    2. Evaluating fitness (minimizing sheets and waste)
    3. Selecting best layouts for reproduction
    4. Creating offspring through crossover and mutation
    5. Repeating for multiple generations

    This is the most sophisticated algorithm and can handle complex multi-sheet optimization.
    """
    import random

    rectangles = expand_sheet_parts(parts)
    _validate_parts_fit(rectangles, sheet_width, sheet_height, allow_rotation)

    if len(rectangles) <= 5:
        # For very small problems, use simpler algorithm
        return best_fit_2d_algorithm(
            parts, sheet_width, sheet_height, kerf_width, allow_rotation
        )

    def create_individual() -> list[Rectangle]:
        """Create a random permutation of rectangles with random rotations."""
        individual = [rectangle.copy() for rectangle in rectangles]
        random.shuffle(individual)

        if allow_rotation:
            for rect in individual:
                if rect.width != rect.height and random.random() < 0.5:
                    # Randomly rotate some rectangles
                    rotated = rect.rotate()
                    rect.width, rect.height = rotated.width, rotated.height
                    rect.rotated = rotated.rotated

        return individual

    def evaluate_fitness(individual: list[Rectangle]) -> float:
        """Evaluate fitness of an individual (lower is better)."""
        # Use bottom-left fill to place the rectangles in this order
        sheets = []
        current_sheet = SheetLayout(
            sheet_width, sheet_height, [], kerf_width=kerf_width
        )

        for rect in individual:
            # Try to place in current sheet
            position = find_bottom_left_position(current_sheet, rect)

            if position and current_sheet.can_place_part(
                rect, position[0], position[1]
            ):
                current_sheet.place_part(rect, position[0], position[1])
            else:
                # Start new sheet
                if current_sheet.parts:
                    sheets.append(current_sheet)
                current_sheet = SheetLayout(
                    sheet_width, sheet_height, [], kerf_width=kerf_width
                )

                # Place in new sheet (should always work for valid parts)
                if rect.width <= sheet_width and rect.height <= sheet_height:
                    current_sheet.place_part(rect, 0, 0)
                else:
                    raise ValueError(f"Part {rect.part_id} could not be placed")

        if current_sheet.parts:
            sheets.append(current_sheet)

        if sum(len(sheet.parts) for sheet in sheets) != len(individual):
            return float("inf")

        # Fitness function: minimize sheets first, then minimize total waste
        num_sheets = len(sheets)
        total_waste = sum(sheet.waste_area for sheet in sheets)

        # Heavily penalize additional sheets, then minimize waste
        fitness = num_sheets * 10000000 + total_waste
        return fitness

    def crossover(
        parent1: list[Rectangle], parent2: list[Rectangle]
    ) -> list[Rectangle]:
        """Create offspring using order crossover (OX)."""
        if len(parent1) <= 2:
            return parent1.copy()

        # Order crossover: take a segment from parent1, fill the rest from parent2
        start = random.randint(0, len(parent1) - 2)
        end = random.randint(start + 1, len(parent1))

        # Create mapping by part_id to handle duplicates properly
        offspring = [None] * len(parent1)

        # Copy segment from parent1
        segment_ids = set()
        for i in range(start, end):
            offspring[i] = parent1[i].copy()
            segment_ids.add(parent1[i].part_id)

        # Fill remaining positions from parent2
        parent2_filtered = [
            rect.copy() for rect in parent2 if rect.part_id not in segment_ids
        ]
        p2_index = 0

        for i in range(len(offspring)):
            if offspring[i] is None and p2_index < len(parent2_filtered):
                offspring[i] = parent2_filtered[p2_index]
                p2_index += 1

        # Fill any remaining None values
        for i in range(len(offspring)):
            if offspring[i] is None:
                # Find a rectangle we haven't used yet
                for rect in rectangles:
                    if rect.part_id not in [
                        r.part_id for r in offspring if r is not None
                    ]:
                        offspring[i] = rect.copy()
                        break

        return [r for r in offspring if r is not None]

    def mutate(individual: list[Rectangle]) -> list[Rectangle]:
        """Mutate by swapping positions and rotating parts."""
        mutated = [rect.copy() for rect in individual]

        # Swap mutation
        if random.random() < 0.7 and len(mutated) > 1:
            i, j = random.sample(range(len(mutated)), 2)
            mutated[i], mutated[j] = mutated[j], mutated[i]

        # Rotation mutation
        if allow_rotation and random.random() < 0.3:
            for rect in mutated:
                if rect.width != rect.height and random.random() < 0.2:
                    # Flip rotation
                    rect.width, rect.height = rect.height, rect.width
                    rect.rotated = not rect.rotated

        return mutated

    # Initialize population
    population = [create_individual() for _ in range(population_size)]

    best_fitness = float("inf")
    best_individual = None

    # Evolution loop
    for generation in range(generations):
        # Evaluate fitness
        fitness_scores = []
        for individual in population:
            fitness = evaluate_fitness(individual)
            fitness_scores.append((individual, fitness))

            if fitness < best_fitness or best_individual is None:
                best_fitness = fitness
                best_individual = [rect.copy() for rect in individual]

        # Sort by fitness (lower is better)
        fitness_scores.sort(key=lambda x: x[1])

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

    if best_individual is None or best_fitness == float("inf"):
        raise ValueError("Genetic optimization produced no complete candidate")

    # Create final result using best individual
    sheets = []
    current_sheet = SheetLayout(sheet_width, sheet_height, [], kerf_width=kerf_width)

    for rect in best_individual:
        position = find_bottom_left_position(current_sheet, rect)

        if position and current_sheet.can_place_part(rect, position[0], position[1]):
            current_sheet.place_part(rect, position[0], position[1])
        else:
            if current_sheet.parts:
                sheets.append(current_sheet)
            current_sheet = SheetLayout(
                sheet_width, sheet_height, [], kerf_width=kerf_width
            )

            if rect.width <= sheet_width and rect.height <= sheet_height:
                current_sheet.place_part(rect, 0, 0)
            else:
                raise ValueError(f"Part {rect.part_id} could not be placed")

    if current_sheet.parts:
        sheets.append(current_sheet)

    # Calculate metrics
    total_waste = sum(sheet.waste_area for sheet in sheets)
    total_used = sum(sheet.used_area for sheet in sheets)
    total_area = sum(sheet.total_area for sheet in sheets)
    overall_efficiency = (total_used / total_area * 100) if total_area > 0 else 0

    return SheetOptimizationResult(
        sheets=sheets,
        algorithm_used=SheetOptimizationAlgorithm.GENETIC_2D,
        total_sheets=len(sheets),
        total_waste_area=total_waste,
        overall_efficiency=overall_efficiency,
    )


def multi_sheet_optimizer(
    parts: dict[str, dict],
    sheet_width: float,
    sheet_height: float,
    kerf_width: float = 3.0,
    allow_rotation: bool = True,
) -> SheetOptimizationResult:
    """
    Multi-sheet optimizer that tries different algorithms and returns the best result.

    This meta-algorithm runs multiple optimization strategies and selects
    the one with the best combination of sheet count and efficiency.
    """
    algorithms_to_try = [
        SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL,
        SheetOptimizationAlgorithm.BEST_FIT_2D,
        SheetOptimizationAlgorithm.GUILLOTINE_CUT,
    ]

    # For complex problems, also try genetic algorithm
    total_parts = sum(spec["quantity"] for spec in parts.values())
    if total_parts >= 10 and total_parts <= 50:
        algorithms_to_try.append(SheetOptimizationAlgorithm.GENETIC_2D)

    best_result = None
    best_score = float("inf")

    for algorithm in algorithms_to_try:
        try:
            result = optimize_sheet_cutting(
                parts=parts,
                sheet_width=sheet_width,
                sheet_height=sheet_height,
                kerf_width=kerf_width,
                algorithm=algorithm,
                allow_rotation=allow_rotation,
            )

            # Score: prioritize fewer sheets, then higher efficiency
            score = result.total_sheets * 1000 - result.overall_efficiency

            if score < best_score:
                best_score = score
                best_result = result

        except Exception as exc:
            logger.warning("Sheet optimization algorithm failed: %s", exc)
            continue  # Skip algorithms that fail

    if best_result is None:
        raise ValueError("No sheet optimization algorithm produced a complete layout")
    return best_result


def optimize_sheet_cutting(
    parts: dict[str, dict],
    sheet_width: float,
    sheet_height: float,
    kerf_width: float = 3.0,
    material_type: str = "plywood",
    algorithm: SheetOptimizationAlgorithm = SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL,
    allow_rotation: bool = True,
) -> SheetOptimizationResult:
    """
    Main optimization function for sheet material cutting.

    Args:
        parts: Dictionary of parts with dimensions and quantities
        sheet_width: Width of available sheets
        sheet_height: Height of available sheets
        kerf_width: Width of saw cuts
        material_type: Type of sheet material
        algorithm: Which optimization algorithm to use
        allow_rotation: Whether to allow 90-degree rotation

    Returns:
        SheetOptimizationResult with optimized layout
    """
    validate_sheet_workload(parts, algorithm.value)
    if algorithm == SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL:
        result = bottom_left_fill_algorithm(
            parts, sheet_width, sheet_height, kerf_width, allow_rotation
        )
    elif algorithm == SheetOptimizationAlgorithm.BEST_FIT_2D:
        result = best_fit_2d_algorithm(
            parts, sheet_width, sheet_height, kerf_width, allow_rotation
        )
    elif algorithm == SheetOptimizationAlgorithm.GUILLOTINE_CUT:
        result = guillotine_cut_algorithm(
            parts, sheet_width, sheet_height, kerf_width, allow_rotation
        )
    elif algorithm == SheetOptimizationAlgorithm.GENETIC_2D:
        result = genetic_2d_algorithm(
            parts, sheet_width, sheet_height, kerf_width, allow_rotation
        )
    else:
        raise ValueError(f"Algorithm {algorithm} not yet implemented")

    _validate_sheet_result(
        result, parts, sheet_width, sheet_height, kerf_width, allow_rotation
    )
    return result


def _validate_sheet_result(
    result: SheetOptimizationResult,
    parts: dict[str, dict],
    sheet_width: float,
    sheet_height: float,
    kerf_width: float,
    allow_rotation: bool,
) -> None:
    """Reject layouts that do not preserve every requested part instance."""
    expected = {rectangle.part_id: rectangle for rectangle in expand_sheet_parts(parts)}
    placed = [part for sheet in result.sheets for part in sheet.parts]

    if {part.part_id for part in placed} != set(expected) or len(placed) != len(
        expected
    ):
        raise ValueError("Sheet optimization produced an incomplete layout")

    for part in placed:
        requested = expected[part.part_id]
        same_orientation = (part.width, part.height) == (
            requested.width,
            requested.height,
        )
        rotated_orientation = allow_rotation and (part.width, part.height) == (
            requested.height,
            requested.width,
        )
        if not (same_orientation or rotated_orientation):
            raise ValueError(
                f"Sheet optimization changed dimensions for {part.part_id}"
            )
        if (
            part.x < 0
            or part.y < 0
            or part.x + part.width > sheet_width
            or part.y + part.height > sheet_height
        ):
            raise ValueError(f"Sheet optimization placed {part.part_id} out of bounds")

    for sheet in result.sheets:
        for left, right in combinations(sheet.parts, 2):
            if left.overlaps_with(right, kerf_width):
                raise ValueError("Sheet optimization produced overlapping parts")


def get_sheet_algorithm_recommendation(
    parts: dict[str, dict],
) -> SheetOptimizationAlgorithm:
    """
    Recommend the best algorithm based on problem characteristics.

    Args:
        parts: Dictionary of parts with dimensions and quantities

    Returns:
        Recommended sheet optimization algorithm
    """
    total_parts = sum(spec["quantity"] for spec in parts.values())

    # Calculate part size diversity
    sizes = []
    for spec in parts.values():
        area = spec["width"] * spec["height"]
        sizes.extend([area] * spec["quantity"])

    if len(sizes) == 0:
        return SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL

    # Calculate coefficient of variation for size diversity
    avg_size = sum(sizes) / len(sizes)
    variance = sum((s - avg_size) ** 2 for s in sizes) / len(sizes)
    std_dev = variance**0.5
    cv = std_dev / avg_size if avg_size > 0 else 0

    if total_parts <= 5:
        # Very small problems: use bottom-left fill (fastest)
        return SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL
    elif total_parts <= 12:
        # Small problems with high diversity: use best fit or genetic
        if cv > 0.6:  # Very high size diversity
            return SheetOptimizationAlgorithm.GENETIC_2D
        elif cv > 0.4:
            return SheetOptimizationAlgorithm.BEST_FIT_2D
        else:
            return SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL
    elif total_parts <= 30:
        # Medium problems: genetic for complex cases, best fit for diverse sizes
        if cv > 0.5:  # High diversity - genetic algorithm excels here
            return SheetOptimizationAlgorithm.GENETIC_2D
        elif cv > 0.3:
            return SheetOptimizationAlgorithm.BEST_FIT_2D
        else:
            return SheetOptimizationAlgorithm.GUILLOTINE_CUT
    elif total_parts <= 50:
        # Medium-large problems: still try genetic for complex cases
        if cv > 0.4:
            return SheetOptimizationAlgorithm.GENETIC_2D
        else:
            return SheetOptimizationAlgorithm.GUILLOTINE_CUT
    else:
        # Large problems: bottom-left fill is fastest
        return SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL
