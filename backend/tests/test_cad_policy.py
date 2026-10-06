from planqer.cad_policy import is_sheet
from planqer.step_policy import StepComponentType, measured_bodies_to_cutlist
from planqer.step_reader import StepBody


def test_shared_policy_classifies_sheet_and_board_without_cad_or_http_imports():
    assert is_sheet(1800, 800, 15)
    assert not is_sheet(755, 95, 95)


def test_step_policy_groups_matching_dimensions_and_preserves_material_seams():
    bodies = [
        StepBody("Left", 520, 95, 45, 1, 1000, material="pine"),
        StepBody("Right", 520, 95, 45, 2, 2000, material="pine"),
        StepBody("MDF", 520, 95, 45, 1, 1000, material="mdf"),
        StepBody("Top", 1800, 800, 15, 1, 21000, material="birch"),
    ]

    items = measured_bodies_to_cutlist(bodies)

    assert [(item.type, item.material, item.quantity) for item in items] == [
        (StepComponentType.BOARD, "mdf", 1),
        (StepComponentType.BOARD, "pine", 3),
        (StepComponentType.SHEET, "birch", 1),
    ]
    assert items[1].name == "Left (and 1 more)"


def test_step_policy_drops_noise_and_rounds_measured_dimensions():
    items = measured_bodies_to_cutlist(
        [
            StepBody("noise", 0.4, 0.4, 0.4, 1, 0),
            StepBody("board", 520.04, 95.04, 45.04, 1, 1),
        ],
        round_precision=1,
    )

    assert len(items) == 1
    assert (items[0].length, items[0].width, items[0].thickness) == (520.0, 95.0, 45.0)
