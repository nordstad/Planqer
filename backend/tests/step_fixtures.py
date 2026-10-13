"""Hand-written ISO 10303-21 fragments shared by the STEP tests."""

MM_CONTEXT = """
#500=(
GEOMETRIC_REPRESENTATION_CONTEXT(3)
GLOBAL_UNIT_ASSIGNED_CONTEXT((#501))
REPRESENTATION_CONTEXT('','3D')
);
#501=(
LENGTH_UNIT()
NAMED_UNIT(*)
SI_UNIT(.MILLI.,.METRE.)
);
"""

INCH_CONTEXT = """
#500=(
GEOMETRIC_REPRESENTATION_CONTEXT(3)
GLOBAL_UNIT_ASSIGNED_CONTEXT((#503))
REPRESENTATION_CONTEXT('','3D')
);
#501=(
LENGTH_UNIT()
NAMED_UNIT(*)
SI_UNIT($,.METRE.)
);
#502=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.0254),#501);
#503=(
CONVERSION_BASED_UNIT('INCH',#502)
LENGTH_UNIT()
NAMED_UNIT(*)
);
"""


def _solid(base: int, corners: list[tuple[float, float, float]], body_name: str) -> str:
    """A solid whose vertices sit at `corners`, as the real entity chain.

    One edge loop threading every corner: geometrically not a box, but it walks
    the same MANIFOLD_SOLID_BREP → CLOSED_SHELL → ADVANCED_FACE →
    FACE_OUTER_BOUND → EDGE_LOOP → ORIENTED_EDGE → EDGE_CURVE → VERTEX_POINT →
    CARTESIAN_POINT path the reader has to follow in an export.
    """
    point = base + 100
    vertex = base + 200
    edge = base + 300
    oriented = base + 400

    lines = [f"#{base}=MANIFOLD_SOLID_BREP('{body_name}',#{base + 1});"]
    lines.append(f"#{base + 1}=CLOSED_SHELL('',(#{base + 2}));")
    lines.append(f"#{base + 2}=ADVANCED_FACE('',(#{base + 3}),#{base + 5},.T.);")
    lines.append(f"#{base + 3}=FACE_OUTER_BOUND('',#{base + 4},.T.);")
    loop = ",".join(f"#{oriented + i}" for i in range(len(corners)))
    lines.append(f"#{base + 4}=EDGE_LOOP('',({loop}));")
    lines.append(f"#{base + 5}=PLANE('',#{base + 6});")
    lines.append(f"#{base + 6}=AXIS2_PLACEMENT_3D('',#{point},$,$);")

    for i, (x, y, z) in enumerate(corners):
        lines.append(f"#{point + i}=CARTESIAN_POINT('',({x},{y},{z}));")
        lines.append(f"#{vertex + i}=VERTEX_POINT('',#{point + i});")
        nxt = (i + 1) % len(corners)
        lines.append(f"#{edge + i}=EDGE_CURVE('',#{vertex + i},#{vertex + nxt},$,.T.);")
        lines.append(f"#{oriented + i}=ORIENTED_EDGE('',*,*,#{edge + i},.T.);")
    return "\n".join(lines)


def _box_corners(
    length: float, width: float, thickness: float
) -> list[tuple[float, float, float]]:
    return [
        (0.0, 0.0, 0.0),
        (length, 0.0, 0.0),
        (length, width, 0.0),
        (0.0, width, 0.0),
        (0.0, 0.0, thickness),
        (length, 0.0, thickness),
        (length, width, thickness),
        (0.0, width, thickness),
    ]


def _step_file(products: str, context: str = MM_CONTEXT, extra: str = "") -> str:
    return f"""ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('test.step','2026-08-24T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN {{ 1 0 10303 214 3 1 1 }}'));
ENDSEC;
DATA;
{context}
{products}
{extra}
ENDSEC;
END-ISO-10303-21;
"""


def _product(
    index: int, name: str, corners_per_body: list[list[tuple[float, float, float]]]
) -> str:
    """One PRODUCT with its definition chain, shape representation and bodies."""
    base = 1000 * (index + 1)
    solids = [
        _solid(base + 10 + 600 * i, corners, f"Body{i + 1}")
        for i, corners in enumerate(corners_per_body)
    ]
    items = ",".join(f"#{base + 10 + 600 * i}" for i in range(len(corners_per_body)))
    return "\n".join(
        [
            f"#{base}=PRODUCT('{name}','{name} id',$,(#900));",
            f"#{base + 1}=PRODUCT_DEFINITION_FORMATION('',$,#{base});",
            f"#{base + 2}=PRODUCT_DEFINITION('design','',#{base + 1},#901);",
            f"#{base + 3}=PRODUCT_DEFINITION_SHAPE('','',#{base + 2});",
            f"#{base + 4}=SHAPE_DEFINITION_REPRESENTATION(#{base + 3},#{base + 5});",
            f"#{base + 5}=ADVANCED_BREP_SHAPE_REPRESENTATION('',({items}),#500);",
            *solids,
        ]
    )
