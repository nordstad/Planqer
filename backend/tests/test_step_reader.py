"""
Tests for the STEP reader.

The fixtures are hand-written ISO 10303-21 fragments rather than a saved CAD
export: a real file is a quarter of a megabyte, and what needs guarding here is
each link in the chain — vertices to bounding box, the declared unit, the
assembly count, the material property, one product holding several bodies.

The reader replaced a stub that returned invented components for any input, so
the case that matters most is the last one: a file that is not STEP is refused,
not answered.
"""

import pytest
from step_fixtures import (
    INCH_CONTEXT,
    _box_corners,
    _product,
    _solid,
    _step_file,
)

from planqer.errors import PlanqerError
from planqer.step_cutlist import StepComponentType, StepProcessor, process_step_bytes
from planqer.step_reader import StepModel, StepParseError, read_step_file


def _bodies(text: str):
    return StepModel(text).bodies()


def test_reads_one_board_from_its_vertices():
    text = _step_file(_product(0, "Rail", [_box_corners(1800.0, 95.0, 45.0)]))

    bodies = _bodies(text)

    assert len(bodies) == 1
    assert (bodies[0].length, bodies[0].width, bodies[0].thickness) == (
        1800.0,
        95.0,
        45.0,
    )
    assert bodies[0].name == "Rail"
    assert bodies[0].cad_id == "Rail id"


def test_dimensions_come_out_sorted_longest_first():
    """A part modelled on its side is the same part."""
    corners = [(x, z, y) for (x, y, z) in _box_corners(45.0, 1800.0, 95.0)]
    text = _step_file(_product(0, "Rail", [corners]))

    body = _bodies(text)[0]

    assert (body.length, body.width, body.thickness) == (1800.0, 95.0, 45.0)


def test_one_product_with_several_bodies_is_several_components():
    """Three studs modelled as one part are three things to cut, not one block."""
    text = _step_file(
        _product(
            0,
            "Short Studs",
            [
                _box_corners(710.0, 95.0, 45.0),
                _box_corners(710.0, 95.0, 45.0),
                _box_corners(710.0, 95.0, 45.0),
            ],
        )
    )

    bodies = _bodies(text)

    assert len(bodies) == 3
    assert all(b.length == 710.0 and b.width == 95.0 for b in bodies)


def test_declared_inches_convert_to_millimetres():
    text = _step_file(
        _product(0, "Rail", [_box_corners(10.0, 2.0, 1.0)]), context=INCH_CONTEXT
    )

    body = _bodies(text)[0]

    assert body.length == pytest.approx(254.0)
    assert body.width == pytest.approx(50.8)
    assert body.thickness == pytest.approx(25.4)


def test_the_files_own_unit_beats_the_requested_one():
    """A file that says inches is in inches whatever the upload form asked for."""
    text = _step_file(
        _product(0, "Rail", [_box_corners(10.0, 2.0, 1.0)]), context=INCH_CONTEXT
    )

    body = StepModel(text, fallback_scale=1.0).bodies()[0]

    assert body.length == pytest.approx(254.0)


def test_undeclared_units_fall_back_to_the_requested_one():
    no_units = (
        "#500=(GEOMETRIC_REPRESENTATION_CONTEXT(3) REPRESENTATION_CONTEXT('','3D'));"
    )
    text = _step_file(
        _product(0, "Rail", [_box_corners(10.0, 2.0, 1.0)]), context=no_units
    )

    body = StepModel(text, fallback_scale=25.4).bodies()[0]

    assert body.length == pytest.approx(254.0)


def test_quantity_counts_assembly_occurrences():
    products = "\n".join(
        [
            _product(0, "Frame", [_box_corners(200.0, 100.0, 20.0)]),
            _product(1, "Stud", [_box_corners(710.0, 95.0, 45.0)]),
        ]
    )
    occurrences = "\n".join(
        f"#{700 + i}=NEXT_ASSEMBLY_USAGE_OCCURRENCE('Stud:{i}','Stud:{i}','',#1002,#2002,$);"
        for i in range(1, 4)
    )
    text = _step_file(products, extra=occurrences)

    quantities = {b.name: b.quantity for b in _bodies(text)}

    assert quantities["Stud"] == 3
    assert quantities["Frame"] == 1


def test_quantity_multiplies_through_a_repeated_subassembly():
    """Two identical drawers of three runners each is six runners."""
    products = "\n".join(
        [
            _product(0, "Cabinet", [_box_corners(900.0, 600.0, 18.0)]),
            _product(1, "Drawer", [_box_corners(400.0, 300.0, 18.0)]),
            _product(2, "Runner", [_box_corners(300.0, 40.0, 20.0)]),
        ]
    )
    extra = "#700=NEXT_ASSEMBLY_USAGE_OCCURRENCE('D:1','D:1','',#1002,#2002,$);\n#701=NEXT_ASSEMBLY_USAGE_OCCURRENCE('D:2','D:2','',#1002,#2002,$);\n#702=NEXT_ASSEMBLY_USAGE_OCCURRENCE('R:1','R:1','',#2002,#3002,$);\n#703=NEXT_ASSEMBLY_USAGE_OCCURRENCE('R:2','R:2','',#2002,#3002,$);\n#704=NEXT_ASSEMBLY_USAGE_OCCURRENCE('R:3','R:3','',#2002,#3002,$);"
    text = _step_file(products, extra=extra)

    quantities = {b.name: b.quantity for b in _bodies(text)}

    assert quantities["Drawer"] == 2
    assert quantities["Runner"] == 6


def test_assembly_path_names_where_a_part_sits():
    products = "\n".join(
        [
            _product(0, "Bench", [_box_corners(900.0, 600.0, 18.0)]),
            _product(1, "Leg", [_box_corners(755.0, 95.0, 95.0)]),
        ]
    )
    extra = "#700=NEXT_ASSEMBLY_USAGE_OCCURRENCE('Leg:1','Leg:1','',#1002,#2002,$);"
    text = _step_file(products, extra=extra)

    paths = {b.name: b.assembly_path for b in _bodies(text)}

    assert paths["Leg"] == "Bench/Leg"


def test_material_comes_from_the_cad_property():
    text = _step_file(
        _product(0, "Rail", [_box_corners(1800.0, 95.0, 45.0)]),
        extra="#800=PROPERTY_DEFINITION('material property','material name',#1002);\n#801=REPRESENTATION('material name',(#802),#500);\n#802=DESCRIPTIVE_REPRESENTATION_ITEM('Oak','Oak');\n#803=PROPERTY_DEFINITION_REPRESENTATION(#800,#801);",
    )

    assert _bodies(text)[0].material == "Oak"


def test_no_material_property_means_no_material_invented():
    text = _step_file(_product(0, "Rail", [_box_corners(1800.0, 95.0, 45.0)]))

    assert _bodies(text)[0].material is None


def test_geometry_hanging_off_a_separate_representation_is_still_found():
    """Exporters often leave the part's own SHAPE_REPRESENTATION empty."""
    base = 1000
    text = _step_file(
        "\n".join(
            [
                f"#{base}=PRODUCT('Rail','Rail id',$,(#900));",
                f"#{base + 1}=PRODUCT_DEFINITION_FORMATION('',$,#{base});",
                f"#{base + 2}=PRODUCT_DEFINITION('design','',#{base + 1},#901);",
                f"#{base + 3}=PRODUCT_DEFINITION_SHAPE('','',#{base + 2});",
                f"#{base + 4}=SHAPE_DEFINITION_REPRESENTATION(#{base + 3},#{base + 5});",
                f"#{base + 5}=SHAPE_REPRESENTATION('',(#{base + 7}),#500);",
                f"#{base + 6}=ADVANCED_BREP_SHAPE_REPRESENTATION('',(#{base + 10}),#500);",
                f"#{base + 7}=AXIS2_PLACEMENT_3D('',#{base + 8},$,$);",
                f"#{base + 8}=CARTESIAN_POINT('',(0.,0.,0.));",
                f"#{base + 9}=SHAPE_REPRESENTATION_RELATIONSHIP('SRR','None',#{base + 5},#{base + 6});",
                _solid(base + 10, _box_corners(1530.0, 95.0, 45.0), "Body1"),
            ]
        )
    )

    bodies = _bodies(text)

    assert len(bodies) == 1
    assert bodies[0].length == 1530.0


def test_a_thin_wide_panel_classifies_as_sheet_and_a_stick_as_board():
    text = _step_file(
        "\n".join(
            [
                _product(0, "Top Ply", [_box_corners(1800.0, 800.0, 15.0)]),
                _product(1, "Leg", [_box_corners(755.0, 95.0, 95.0)]),
            ]
        )
    )
    with open("/tmp/planqer-test-mixed.step", "w") as handle:
        handle.write(text)

    items = {
        i.name: i.type
        for i in StepProcessor().process_step_file("/tmp/planqer-test-mixed.step")
    }

    assert items["Top Ply"] == StepComponentType.SHEET
    assert items["Leg"] == StepComponentType.BOARD


def test_identical_parts_group_into_one_line_with_a_summed_quantity():
    products = "\n".join(
        [
            _product(0, "Left Stretcher", [_box_corners(520.0, 95.0, 45.0)]),
            _product(1, "Right Stretcher", [_box_corners(520.0, 95.0, 45.0)]),
        ]
    )
    with open("/tmp/planqer-test-pair.step", "w") as handle:
        handle.write(_step_file(products))

    items = StepProcessor().process_step_file("/tmp/planqer-test-pair.step")

    assert len(items) == 1
    assert items[0].quantity == 2
    assert "and 1 more" in items[0].name


def test_board_lengths_become_the_optimizer_payload():
    products = "\n".join(
        [
            _product(0, "Long", [_box_corners(1800.0, 95.0, 45.0)]),
            _product(1, "Short", [_box_corners(520.0, 95.0, 45.0)]),
            _product(2, "Ply", [_box_corners(1800.0, 800.0, 15.0)]),
        ]
    )
    with open("/tmp/planqer-test-parts.step", "w") as handle:
        handle.write(_step_file(products))

    processor = StepProcessor()
    parts = processor.convert_to_planqer_parts(
        processor.process_step_file("/tmp/planqer-test-parts.step")
    )

    # The sheet is not a length to cut on a 1D saw, so it stays out.
    assert parts == {"1800": 1, "520": 1}


def test_a_file_that_is_not_step_is_refused():
    with pytest.raises(StepParseError, match="ISO-10303-21"):
        StepModel("this is not a step file at all")


def test_a_step_file_with_no_solids_is_refused():
    """A surfaces-only or wireframe export has nothing to cut, and says so."""
    with open("/tmp/planqer-test-empty.step", "w") as handle:
        handle.write(_step_file(""))

    with pytest.raises(StepParseError, match="No solid bodies"):
        read_step_file("/tmp/planqer-test-empty.step")


def test_strings_holding_a_semicolon_do_not_end_the_record():
    """A part named with a semicolon used to truncate the record it sat in."""
    text = _step_file(_product(0, "Rail; short", [_box_corners(600.0, 95.0, 45.0)]))

    bodies = _bodies(text)

    assert len(bodies) == 1
    assert bodies[0].name == "Rail; short"


def test_step_file_contents_become_a_cutlist_and_optimizer_payload():
    products = _product(0, "Long", [_box_corners(1800.0, 95.0, 45.0)])

    items, parts = process_step_bytes(
        _step_file(products).encode(), "shelf.step", units="mm"
    )

    assert [(i.type, i.length, i.width, i.thickness) for i in items] == [
        (StepComponentType.BOARD, 1800.0, 95.0, 45.0)
    ]
    assert parts == {"1800": 1}


def test_step_contents_with_the_wrong_extension_are_refused():
    products = _product(0, "Long", [_box_corners(1800.0, 95.0, 45.0)])

    with pytest.raises(PlanqerError) as exc_info:
        process_step_bytes(_step_file(products).encode(), "shelf.stl")

    assert exc_info.value.status_code == 400
    assert "STEP file" in exc_info.value.detail


def test_step_contents_that_are_not_step_are_refused_with_the_readers_message():
    with pytest.raises(PlanqerError) as exc_info:
        process_step_bytes(b"this is not a step file", "broken.step")

    assert exc_info.value.status_code == 400
    assert "ISO-10303-21" in exc_info.value.detail
