"""
Reads a STEP file. Actually reads it.

This replaces a stub that ignored the uploaded file and returned seven
hardcoded "Bench" components for anything at all — a text file renamed .step
included. A cutlist somebody buys lumber against cannot be invented.

Written as a plain ISO 10303-21 reader rather than bound to a geometry kernel:
pythonocc/OCP would give exact B-rep volumes, but they are large native
extensions, and no backend dependency here is allowed to need one. What a
cutlist needs from a solid is its bounding box, and the vertices of the B-rep
give that directly.

How it gets each component:

  PRODUCT ─ name, and the CAD id
     ↑ PRODUCT_DEFINITION_FORMATION ← PRODUCT_DEFINITION ← PRODUCT_DEFINITION_SHAPE
                                                                ↑
                                        SHAPE_DEFINITION_REPRESENTATION → SHAPE_REPRESENTATION
                                                                              │ (SHAPE_REPRESENTATION_RELATIONSHIP)
                                                                              ↓
                                                          ADVANCED_BREP_SHAPE_REPRESENTATION
                                                                              ↓
                                                            MANIFOLD_SOLID_BREP (one per body)
                                                                              ↓
                                                            VERTEX_POINT → CARTESIAN_POINT

One product can hold several solid bodies — "Right Short Studs" in the test
model is three 710 mm studs in one part — so a body, not a product, is the
component. Taking the product's whole vertex cloud instead reported those three
as one 710 × 135 × 95 block, which is not a thing you can buy or cut.

Quantities come from the assembly tree (NEXT_ASSEMBLY_USAGE_OCCURRENCE), so a
part instanced three times counts three, and a sub-assembly used twice doubles
everything inside it.

Cross-check that this is right: on the same bench model, the STL path
(trimesh, mesh geometry, oriented bounding boxes) and this reader agree on all
23 pieces and every dimension, by two completely separate routes.
"""

import logging
import re
from collections import defaultdict
from dataclasses import dataclass

logger = logging.getLogger("planqer.step_reader")

# Entity types that carry one solid body's geometry.
SOLID_TYPES = frozenset({
    "MANIFOLD_SOLID_BREP",
    "BREP_WITH_VOIDS",
    "FACETED_BREP",
    "SHELL_BASED_SURFACE_MODEL",
})

# SI prefixes, as a factor on the base unit.
SI_PREFIX = {
    "MILLI": 0.001, "CENTI": 0.01, "DECI": 0.1, "DECA": 10.0,
    "HECTO": 100.0, "KILO": 1000.0, "MICRO": 1e-6,
}

_NUMBER = re.compile(r"-?\d+\.?\d*(?:[EeDd][-+]?\d+)?")
_REF = re.compile(r"#(\d+)")


class StepParseError(ValueError):
    """The file is not a STEP file, or holds nothing that can be cut."""


@dataclass
class StepBody:
    """One solid body from the file, measured and named."""

    name: str
    length: float
    width: float
    thickness: float
    quantity: int
    volume: float
    material: str | None = None
    assembly_path: str | None = None
    cad_id: str | None = None


# ── the exchange format itself ────────────────────────────────────────────

def _split_top_level(params: str) -> list[str]:
    """Split one entity's parameter list on commas outside quotes and nesting."""
    out: list[str] = []
    depth = 0
    start = 0
    i = 0
    n = len(params)
    while i < n:
        c = params[i]
        if c == "'":
            i = _skip_string(params, i)
            continue
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
        elif c == "," and depth == 0:
            out.append(params[start:i].strip())
            start = i + 1
        i += 1
    out.append(params[start:].strip())
    return out


def _skip_string(text: str, i: int) -> int:
    """Index just past the string literal starting at `i` ('' is an escaped quote)."""
    i += 1
    n = len(text)
    while i < n:
        if text[i] == "'":
            if i + 1 < n and text[i + 1] == "'":
                i += 2
                continue
            return i + 1
        i += 1
    return n


def _unquote(value: str) -> str | None:
    value = value.strip()
    if len(value) >= 2 and value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    return None


def _refs(value: str) -> list[int]:
    return [int(m.group(1)) for m in _REF.finditer(value)]


def _floats(value: str) -> list[float]:
    # STEP writes reals as 1.E-3 and, in older files, 1.D-3.
    return [float(m.group(0).replace("D", "E").replace("d", "e")) for m in _NUMBER.finditer(value)]


def parse_entities(text: str) -> dict[int, list[tuple[str, str]]]:
    """`#12=FOO(a,b);` → `{12: [("FOO", "a,b")]}`.

    A complex entity — `#5=(A(x) B(y));` — keeps every one of its parts, which
    is how a length unit is recognised: it is one entity that is at once a
    LENGTH_UNIT, a NAMED_UNIT and an SI_UNIT.
    """
    start = text.find("DATA;")
    if start == -1:
        raise StepParseError("No DATA section — this file is not STEP exchange text.")
    body = text[start + len("DATA;"):]
    end = body.rfind("ENDSEC;")
    if end != -1:
        body = body[:end]

    entities: dict[int, list[tuple[str, str]]] = {}
    chunks: list[str] = []
    i = 0
    n = len(body)
    while i < n:
        c = body[i]
        if c == "'":
            j = _skip_string(body, i)
            chunks.append(body[i:j])
            i = j
            continue
        if c == "/" and body.startswith("/*", i):
            j = body.find("*/", i)
            i = n if j == -1 else j + 2
            continue
        if c == ";":
            record = "".join(chunks)
            chunks = []
            i += 1
            head = record.find("=")
            if head == -1:
                continue
            ref = _REF.match(record.strip())
            if ref:
                entities[int(ref.group(1))] = _parse_instances(record[head + 1:])
            continue
        chunks.append(c)
        i += 1
    if not entities:
        raise StepParseError("The DATA section holds no entities.")
    return entities


def _parse_instances(text: str) -> list[tuple[str, str]]:
    """`FOO(a,b)` → one instance; `(A(x) B(y))` → several."""
    text = text.strip()
    instances: list[tuple[str, str]] = []
    i = 0
    n = len(text)
    while i < n:
        m = re.compile(r"[A-Za-z_][A-Za-z0-9_]*").match(text, i)
        if not m:
            i += 1
            continue
        j = text.find("(", m.end())
        if j == -1:
            break
        depth = 1
        k = j + 1
        while k < n and depth:
            c = text[k]
            if c == "'":
                k = _skip_string(text, k)
                continue
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
            k += 1
        instances.append((m.group(0).upper(), text[j + 1:k - 1]))
        i = k
    return instances


# ── the reader ────────────────────────────────────────────────────────────

class StepModel:
    """One parsed STEP file, queried for the parts it holds."""

    def __init__(self, text: str, fallback_scale: float = 1.0):
        if "ISO-10303-21" not in text[:2048]:
            raise StepParseError(
                "That file has no ISO-10303-21 header, so it is not a STEP file. "
                "Export it again as STEP (.step or .stp) from your CAD tool."
            )
        self.entities = parse_entities(text)
        self.fallback_scale = fallback_scale

        self.by_type: dict[str, list[int]] = defaultdict(list)
        for ref, instances in self.entities.items():
            for name, _ in instances:
                self.by_type[name].append(ref)

        self._product_name = {
            ref: (_unquote(_split_top_level(self.param(ref, "PRODUCT"))[0]) or "Part")
            for ref in self.by_type.get("PRODUCT", ())
        }
        self._parents: dict[int, list[int]] = defaultdict(list)
        self._read_assembly()
        self._material = self._read_materials()
        self._instances: dict[int, int] = {}

    # -- entity access --

    def param(self, ref: int, type_name: str) -> str | None:
        for name, params in self.entities.get(ref, ()):
            if name == type_name:
                return params
        return None

    def has(self, ref: int, type_name: str) -> bool:
        return any(name == type_name for name, _ in self.entities.get(ref, ()))

    def _product_of(self, ref: int, depth: int = 0) -> int | None:
        """Follow references forward until a PRODUCT turns up.

        Deliberately generic: the chain from a shape to its product differs
        between AP203, AP214 and AP242 (PRODUCT_DEFINITION_FORMATION with or
        without a specified source, for one), and walking to the PRODUCT holds
        for all of them without a branch per schema.
        """
        if depth > 8 or ref not in self.entities:
            return None
        if self.has(ref, "PRODUCT"):
            return ref
        for _, params in self.entities[ref]:
            for nested in _refs(params):
                found = self._product_of(nested, depth + 1)
                if found is not None:
                    return found
        return None

    # -- units --

    def _length_scale_of(self, unit_ref: int, depth: int = 0) -> float | None:
        """Millimetres per unit, or None if this entity is not a length unit."""
        if depth > 4:
            return None
        si = self.param(unit_ref, "SI_UNIT")
        if si is not None and self.has(unit_ref, "LENGTH_UNIT"):
            parts = _split_top_level(si)
            if len(parts) == 2 and parts[1].strip().strip(".").upper() == "METRE":
                prefix = parts[0].strip().strip(".").upper()
                return SI_PREFIX.get(prefix, 1.0) * 1000.0

        conversion = self.param(unit_ref, "CONVERSION_BASED_UNIT")
        if conversion is not None:
            parts = _split_top_level(conversion)
            for measure_ref in _refs(parts[-1]):
                measure = (self.param(measure_ref, "LENGTH_MEASURE_WITH_UNIT")
                           or self.param(measure_ref, "MEASURE_WITH_UNIT"))
                if not measure:
                    continue
                factor = _split_top_level(measure)
                values = _floats(factor[0])
                base = _refs(factor[1]) if len(factor) > 1 else []
                if values and base:
                    inner = self._length_scale_of(base[0], depth + 1)
                    if inner:
                        return values[0] * inner
        return None

    def _scale_for_representation(self, rep: int) -> float:
        """Millimetres per file unit, read from this representation's own context.

        Per representation and not once per file: an export can declare both a
        millimetre and a metre length unit, and only the context each shape
        actually points at says which one its coordinates are in.
        """
        for _, params in self.entities.get(rep, ()):
            for candidate in reversed(_refs(params)):
                context = self.param(candidate, "GLOBAL_UNIT_ASSIGNED_CONTEXT")
                if context is None:
                    continue
                for unit_ref in _refs(context):
                    scale = self._length_scale_of(unit_ref)
                    if scale:
                        return scale
        logger.info("No length unit on this shape's context; assuming the requested units")
        return self.fallback_scale

    # -- assembly, materials --

    def _read_assembly(self) -> None:
        for ref in self.by_type.get("NEXT_ASSEMBLY_USAGE_OCCURRENCE", ()):
            params = self.param(ref, "NEXT_ASSEMBLY_USAGE_OCCURRENCE")
            related = [_refs(part) for part in _split_top_level(params)]
            related = [group[0] for group in related if group]
            if len(related) < 2:
                continue
            parent = self._product_of(related[0])
            child = self._product_of(related[1])
            if parent is not None and child is not None and parent != child:
                self._parents[child].append(parent)

    def _read_materials(self) -> dict[int, str]:
        """Material per product, where the CAD tool wrote one.

        AP214 carries it as a property: PROPERTY_DEFINITION('material property',
        'material name', part) → REPRESENTATION → DESCRIPTIVE_REPRESENTATION_ITEM.
        Absent, a part has no material, and nothing is guessed from its name.
        """
        materials: dict[int, str] = {}
        for ref in self.by_type.get("PROPERTY_DEFINITION_REPRESENTATION", ()):
            parts = _split_top_level(self.param(ref, "PROPERTY_DEFINITION_REPRESENTATION"))
            definition = _refs(parts[0])
            representation = _refs(parts[1]) if len(parts) > 1 else []
            if not definition or not representation:
                continue
            property_params = self.param(definition[0], "PROPERTY_DEFINITION")
            if not property_params:
                continue
            labels = [_unquote(p) or "" for p in _split_top_level(property_params)]
            if not any("material" in label.lower() for label in labels):
                continue
            product = self._product_of(definition[0])
            representation_params = (self.param(representation[0], "REPRESENTATION")
                                    or self.param(representation[0], "SHAPE_REPRESENTATION"))
            if product is None or not representation_params:
                continue
            for item in _refs(_split_top_level(representation_params)[1]):
                described = self.param(item, "DESCRIPTIVE_REPRESENTATION_ITEM")
                if described:
                    values = [_unquote(p) for p in _split_top_level(described)]
                    value = next((v for v in reversed(values) if v), None)
                    if value:
                        materials[product] = value
                    break
        return materials

    def _instance_count(self, product: int, seen: frozenset[int] = frozenset()) -> int:
        """How many of this part the whole model contains.

        A part under a sub-assembly used twice exists twice, so the count
        multiplies down the tree rather than counting occurrences flat.
        """
        if product in self._instances:
            return self._instances[product]
        parents = self._parents.get(product)
        if not parents or product in seen:
            return 1
        total = sum(self._instance_count(p, seen | {product}) for p in parents)
        self._instances[product] = max(total, 1)
        return self._instances[product]

    def _path_to(self, product: int, seen: frozenset[int] = frozenset()) -> str:
        name = self._product_name.get(product, "Part")
        parents = self._parents.get(product)
        if not parents or product in seen:
            return name
        return f"{self._path_to(parents[0], seen | {product})}/{name}"

    # -- geometry --

    def _shape_representations(self) -> dict[int, int]:
        """Representation → the product it describes."""
        owners: dict[int, int] = {}
        for ref in self.by_type.get("SHAPE_DEFINITION_REPRESENTATION", ()):
            parts = _split_top_level(self.param(ref, "SHAPE_DEFINITION_REPRESENTATION"))
            defined = _refs(parts[0])
            used = _refs(parts[1]) if len(parts) > 1 else []
            if not defined or not used:
                continue
            product = self._product_of(defined[0])
            if product is not None:
                owners[used[0]] = product
        return owners

    def _representation_links(self) -> dict[int, list[int]]:
        """Representation → representations holding its geometry.

        A part's SHAPE_REPRESENTATION is often an empty frame, with the solid in
        a separate ADVANCED_BREP_SHAPE_REPRESENTATION joined by a plain
        SHAPE_REPRESENTATION_RELATIONSHIP. Relationships that carry a transform
        are the assembly's placements instead, and following those would drag
        every sibling part into whichever one was read first.
        """
        links: dict[int, list[int]] = defaultdict(list)
        for ref in self.by_type.get("SHAPE_REPRESENTATION_RELATIONSHIP", ()):
            if self.has(ref, "REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION"):
                continue
            params = (self.param(ref, "REPRESENTATION_RELATIONSHIP")
                      or self.param(ref, "SHAPE_REPRESENTATION_RELATIONSHIP"))
            related = [_refs(part) for part in _split_top_level(params)]
            related = [group[0] for group in related if group]
            if len(related) >= 2:
                links[related[0]].append(related[1])
                links[related[1]].append(related[0])
        return links

    def _walk(self, root: int, owned: set[int], links: dict[int, list[int]],
              stop_at_solids: bool) -> tuple[list[tuple[float, float, float]], list[int]]:
        """Collect vertex coordinates under `root`, and the solid bodies beneath it."""
        seen: set[int] = set()
        stack = [root]
        points: list[tuple[float, float, float]] = []
        solids: list[int] = []
        while stack:
            current = stack.pop()
            if current in seen or current not in self.entities:
                continue
            seen.add(current)

            if stop_at_solids and current != root and any(
                name in SOLID_TYPES for name, _ in self.entities[current]
            ):
                solids.append(current)
                continue

            vertex = self.param(current, "VERTEX_POINT")
            if vertex is not None:
                for point_ref in _refs(vertex):
                    coordinates = self.param(point_ref, "CARTESIAN_POINT")
                    if coordinates:
                        values = _floats(_split_top_level(coordinates)[-1])
                        if len(values) >= 3:
                            points.append((values[0], values[1], values[2]))
                continue

            for _, params in self.entities[current]:
                for nested in _refs(params):
                    if nested != root and nested in owned:
                        continue
                    stack.append(nested)
            for linked in links.get(current, ()):
                if linked == root or linked not in owned:
                    stack.append(linked)
        return points, solids

    def bodies(self) -> list[StepBody]:
        """Every solid body in the file, measured in millimetres."""
        owners = self._shape_representations()
        links = self._representation_links()
        owned = set(owners)

        found: list[StepBody] = []
        for representation, product in owners.items():
            scale = self._scale_for_representation(representation)
            points, solids = self._walk(representation, owned, links, stop_at_solids=True)
            clouds = [self._walk(solid, owned, links, stop_at_solids=False)[0] for solid in solids]
            if not clouds:
                clouds = [points]

            product_params = _split_top_level(self.param(product, "PRODUCT") or "")
            cad_id = _unquote(product_params[1]) if len(product_params) > 1 else None
            quantity = self._instance_count(product)

            for cloud in clouds:
                # Four points is the fewest that can bound a volume; fewer means
                # construction geometry, not a part.
                if len(cloud) < 4:
                    continue
                extents = sorted(
                    (max(p[axis] for p in cloud) - min(p[axis] for p in cloud)) * scale
                    for axis in (0, 1, 2)
                )
                thickness, width, length = extents
                found.append(StepBody(
                    name=self._product_name.get(product, "Part"),
                    length=length,
                    width=width,
                    thickness=thickness,
                    quantity=quantity,
                    volume=length * width * thickness,
                    material=self._material.get(product),
                    assembly_path=self._path_to(product),
                    cad_id=cad_id,
                ))
        return found


def read_step_file(path: str, fallback_scale: float = 1.0) -> list[StepBody]:
    """Read a STEP file into solid bodies, measured in millimetres.

    `fallback_scale` is millimetres per file unit, used only when the file
    declares no length unit of its own — the file's own declaration always wins,
    because a STEP file that says it is in inches is in inches whatever the
    upload form was set to.
    """
    with open(path, encoding="utf-8", errors="replace") as handle:
        text = handle.read()

    bodies = StepModel(text, fallback_scale=fallback_scale).bodies()
    if not bodies:
        raise StepParseError(
            "No solid bodies found in this STEP file. Planqer measures solids; "
            "a file holding only surfaces, sketches or wireframe has nothing to cut."
        )
    logger.info(f"STEP: read {len(bodies)} solid bodies")
    return bodies
