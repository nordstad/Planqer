import logging

from planqer.algorithms import OptimizationAlgorithm
from planqer.schemas import PlanqerResponse
from planqer.services import _build_board_plans, run_optimization


def test_build_board_plans_keeps_stock_and_cuts_together():
    plans = _build_board_plans(
        cut_list=[[270.0, 81.0], [179.0, 90.0]],
        optimal_board_length=360.0,
        boards=[300.0, 360.0, 500.0],
        kerf=3.0,
    )

    assert [(plan.stock_length, plan.cuts) for plan in plans] == [
        (360.0, (270.0, 81.0)),
        (300.0, (179.0, 90.0)),
    ]


def test_run_optimization_preserves_public_response_fields():
    result = run_optimization(
        parts={100.0: 2, 50.0: 2},
        boards=[200.0],
        kerf=3.0,
        project_name="Test project",
        algorithm=OptimizationAlgorithm.FIRST_FIT_DECREASING,
        logger=logging.getLogger(__name__),
        planqerResponse=PlanqerResponse,
    )

    assert set(result.model_dump()) == {
        "optimal_board_length",
        "cost",
        "total_waste",
        "material_bought",
        "kerf_loss",
        "board_lengths_used",
        "cut_list",
        "visualization",
        "algorithm_used",
        "computation_time",
        "cost_analysis",
    }
    assert result.optimal_board_length == 200.0
    assert result.cut_list == [[100.0, 50.0], [100.0, 50.0]]
    assert result.board_lengths_used == [200.0, 200.0]
    assert result.material_bought == 400.0
    assert result.kerf_loss == 6.0
    assert result.total_waste == 94.0
    assert result.algorithm_used == "first_fit_decreasing"
    assert result.computation_time >= 0
    assert result.visualization.startswith("data:image/svg+xml;base64,")
    assert result.cost_analysis is None


def test_run_optimization_assigns_the_smallest_suitable_stock_to_each_board():
    result = run_optimization(
        parts={270.0: 1, 179.0: 1, 90.0: 1, 81.0: 1},
        boards=[300.0, 360.0, 500.0],
        kerf=3.0,
        project_name="Test project",
        algorithm=OptimizationAlgorithm.FIRST_FIT_DECREASING,
        logger=logging.getLogger(__name__),
        planqerResponse=PlanqerResponse,
    )

    assert result.cut_list == [[270.0, 81.0], [179.0, 90.0]]
    assert result.board_lengths_used == [360.0, 300.0]
    assert result.material_bought == 660.0
    assert result.kerf_loss == 6.0
    assert result.total_waste == 34.0
