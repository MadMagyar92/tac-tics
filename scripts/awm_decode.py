#!/usr/bin/env python3
"""Decode AW Series Map Editor files (.awm / .aw2 / .awd / .aws v1) into
readable Markdown and JSON.

Format reference: https://github.com/joaofrancese/awsmaped
  - "AWS Map Editor Format Specifications.txt" (byte layout)
  - wxAWDSMapEd/Source/FrameMain.cpp DoOpenRead (tile order, field lengths)
  - wxAWDSMapEd/Source/Element*.{h,cpp} (value -> terrain/building/unit names)

Usage: python3 awm_decode.py MAPFILE [--out-dir DIR]

Writes <map name>.md (ASCII grid, legend, buildings/units tables, tile counts)
and <map name>.json (same data plus the raw 16-bit tile values) to DIR
(default: current directory). Standard library only; Python 3.9+.
"""
from __future__ import annotations

import argparse
import json
import struct
from collections import Counter
from pathlib import Path

# ---------------------------------------------------------------- constants

HEADERS = {
    "AWMap 001": ("AW1 Map Editor (Advance Wars)", "AW1"),
    "AW2Map001": ("AW2 Map Editor (Advance Wars 2)", "AW2"),
    "AWDMap001": ("AWDS Map Editor (Advance Wars: Dual Strike)", "AWDS"),
    "AWSMap001": ("AW Series Map Editor", "AWS"),
}

TILESETS = {0: "Normal (AWDS)", 1: "Snow (AWDS)", 2: "Desert", 3: "Wasteland", 4: "AW1", 5: "AW2"}

UNIT_EMPTY = 0xFFFF
UNIT_DELETE = 0xFFFE
TERRAIN_BLANK = 0xFFFD

TERRAIN_COLS, BUILDING_COLS, UNIT_COLS, EXTRA_COLS = 30, 10, 20, 20

# Terrain sprite (x, y) -> terrain type. Mirrors Element::Simplify(); the
# variants within a type are just different drawings (road direction,
# coastline shape, river bend, ...).
TERRAIN_VARIANTS = {
    "Plain": [(0, 0)],
    "Plain (alternate sprite)": [(17, 5), (17, 6), (17, 7)],
    "Wood": [(0, 3), (15, 6)],
    "Mountain": [(0, 5), (0, 7)],
    "Road": [(1, 0), (1, 1), (1, 2), (1, 4), (1, 5), (1, 6), (1, 7),
             (2, 4), (2, 5), (2, 6), (2, 7), (15, 2), (15, 3)],
    "Bridge": [(2, 0), (2, 1)],
    "River": [(3, y) for y in (0, 1, 2, 4, 5, 6, 7)] + [(4, y) for y in range(8)],
    "Pipe": [(16, y) for y in range(6)] + [(17, y) for y in range(4)],
    "Pipe Seam": [(16, 6), (16, 7)],
    "Shoal": [(9, y) for y in range(8)] + [(10, y) for y in range(4)]
             + [(11, y) for y in range(8)] + [(12, y) for y in range(8)]
             + [(13, y) for y in range(4)] + [(14, y) for y in range(4)],
    "Sea": [(0, 2)] + [(7, y) for y in range(5)],
    "Reef": [(0, 1)],
}
TERRAIN_BY_SPRITE = {xy: name for name, xys in TERRAIN_VARIANTS.items() for xy in xys}

# Two-character map symbols (terrain is doubled so every cell is 2 wide).
TERRAIN_SYMBOL = {
    "Plain": "..", "Plain (alternate sprite)": "..", "Wood": "ff", "Mountain": "^^",
    "Road": "==", "Bridge": "[]", "River": "rv", "Pipe": "pp", "Pipe Seam": "ps",
    "Shoal": ",,", "Sea": "~~", "Reef": "**", "Blank": "  ", "Unknown": "??",
}

BUILDING_TYPES = ["HQ", "City", "Base", "Airport", "Port", "Com Tower", "Lab"]
BUILDING_LETTER = {"HQ": "H", "City": "C", "Base": "B", "Airport": "A", "Port": "P",
                   "Com Tower": "T", "Lab": "L", "Missile Silo": "S"}

ARMIES = ["Orange Star", "Blue Moon", "Green Earth", "Yellow Comet", "Black Hole", "Neutral"]
ARMY_LETTER = {"Orange Star": "o", "Blue Moon": "b", "Green Earth": "g",
               "Yellow Comet": "y", "Black Hole": "k", "Neutral": "n"}

# Unit sprite column -> name, for each of the two rows every army occupies.
UNIT_ROW0 = ["Infantry", "Md Tank", "Recon", "Artillery", "Anti-Air", "Fighter",
             "B Copter", "Battleship", "Lander", "Neotank", "Megatank", "Piperunner", "Oozium"]
UNIT_ROW1 = ["Mech", "Tank", "APC", "Rockets", "Missiles", "Bomber",
             "T Copter", "Cruiser", "Sub", "Black Boat", "Carrier", "Stealth", "Black Bomb"]

# Extra (AWDS-only large/special structures). Single-tile items, then the
# top-left sprite and footprint of each multi-tile structure.
EXTRA_SINGLE = {(0, 0): "Minicannon (north)", (1, 1): "Minicannon (south)",
                (1, 0): "Minicannon (west)", (0, 1): "Minicannon (east)",
                (2, 0): "Laser Cannon", (3, 1): "Black Crystal"}
EXTRA_LARGE = {"Black Cannon (south)": (0, 2, 3), "Black Cannon (north)": (3, 2, 3),
               "Deathray": (0, 5, 3), "Black Obelisk": (3, 5, 3), "Volcano": (7, 0, 4),
               "Grand Silo": (11, 0, 4), "Fortress": (7, 4, 4), "Black Arc": (11, 4, 4),
               "Sea Arc": (15, 4, 4)}


# ---------------------------------------------------------------- decoding

def describe_background(value: int, map_kind: str) -> dict:
    """Describe a terrain-layer value (terrain, building or extra)."""
    if value == TERRAIN_BLANK:
        return {"layer": "terrain", "type": "Blank"}
    if 0 <= value <= 299:
        sx, sy = value % TERRAIN_COLS, value // TERRAIN_COLS
        return {"layer": "terrain", "type": TERRAIN_BY_SPRITE.get((sx, sy), "Unknown"),
                "sprite": [sx, sy]}
    if 300 <= value <= 499:
        sx, sy = (value - 300) % BUILDING_COLS, (value - 300) // BUILDING_COLS
        # AW1 had no Black Hole, so its sheet uses row 4 for neutral buildings.
        if map_kind == "AW1":
            army = ARMIES[sy] if sy < 4 else ("Neutral" if sy == 4 else f"Army {sy}")
            kind = BUILDING_TYPES[sx] if sx < len(BUILDING_TYPES) else "Unknown building"
        elif (sx, sy) == (0, 5):
            army, kind = "Neutral", "Missile Silo"
        else:
            army = ARMIES[sy] if sy < len(ARMIES) else f"Army {sy}"
            kind = BUILDING_TYPES[sx] if sx < len(BUILDING_TYPES) else "Unknown building"
        return {"layer": "building", "type": kind, "army": army, "sprite": [sx, sy]}
    if 900 <= value <= 1299:
        sx, sy = (value - 900) % EXTRA_COLS, (value - 900) // EXTRA_COLS
        name = EXTRA_SINGLE.get((sx, sy))
        if name is None:
            for big, (lx, ly, size) in EXTRA_LARGE.items():
                if lx <= sx < lx + size and ly <= sy < ly + size:
                    name = f"{big} (part {sx - lx},{sy - ly})"
                    break
        return {"layer": "extra", "type": name or "Unknown extra", "sprite": [sx, sy]}
    return {"layer": "unknown", "type": "Unknown"}


def describe_unit(value: int) -> dict | None:
    if value in (UNIT_EMPTY, UNIT_DELETE):
        return None
    if not 500 <= value <= 899:
        return {"type": "Unknown", "army": None}
    sx, sy = (value - 500) % UNIT_COLS, (value - 500) // UNIT_COLS
    names = UNIT_ROW0 if sy % 2 == 0 else UNIT_ROW1
    army_idx = sy // 2
    return {"type": names[sx] if sx < len(names) else "Unknown unit",
            "army": ARMIES[army_idx] if army_idx < 5 else f"Army {army_idx}",
            "sprite": [sx, sy]}


def read_field(data: bytes, pos: int) -> tuple[str, int]:
    """Length-prefixed (4-byte little-endian) text field."""
    if pos + 4 > len(data):
        return "", pos
    (length,) = struct.unpack_from("<I", data, pos)
    pos += 4
    return data[pos:pos + length].decode("latin-1"), pos + length


def decode(data: bytes) -> dict:
    header = data[:9].decode("latin-1")
    if header not in HEADERS:
        raise ValueError(f"Unrecognised header {data[:10]!r}")
    editor, kind = HEADERS[header]
    pos = 10

    if kind == "AWS":
        width, height = data[pos], data[pos + 1]
        pos += 2
    else:
        width, height = 30, 20  # .awm/.aw2/.awd are always 30x20

    if kind == "AWS":
        tileset = data[pos]; pos += 1
    elif kind == "AWDS":
        tileset = data[pos] - 1; pos += 1
    else:
        tileset = 4 if kind == "AW1" else 5

    def read_layer(pos: int) -> tuple[list[list[int]], int]:
        # Stored column by column: x outer, y inner. grid[y][x] for output.
        grid = [[0] * width for _ in range(height)]
        for x in range(width):
            for y in range(height):
                grid[y][x] = struct.unpack_from("<H", data, pos)[0]
                pos += 2
        return grid, pos

    terrain_raw, pos = read_layer(pos)
    units_raw, pos = read_layer(pos)
    name, pos = read_field(data, pos)
    author, pos = read_field(data, pos)
    description, pos = read_field(data, pos)
    if pos != len(data):
        raise ValueError(f"{len(data) - pos} unexpected trailing bytes")

    terrain = [[describe_background(v, kind) for v in row] for row in terrain_raw]
    buildings, units = [], []
    for y in range(height):
        for x in range(width):
            t = terrain[y][x]
            if t["layer"] in ("building", "extra"):
                buildings.append({"x": x, "y": y, "type": t["type"], "army": t.get("army")})
            u = describe_unit(units_raw[y][x])
            if u:
                units.append({"x": x, "y": y, "type": u["type"], "army": u["army"],
                              "on": terrain_name(t)})

    return {
        "name": name, "author": author, "description": description,
        "format": {"header": header, "editor": editor, "map_type": kind,
                   "tileset": TILESETS.get(tileset, str(tileset))},
        "width": width, "height": height,
        "terrain": terrain, "terrain_raw": terrain_raw, "units_raw": units_raw,
        "buildings": buildings, "units": units,
    }


def terrain_name(t: dict) -> str:
    if t["layer"] == "building":
        return f"{t['army']} {t['type']}"
    return t["type"]


def symbol(t: dict) -> str:
    if t["layer"] == "building":
        return BUILDING_LETTER.get(t["type"], "?") + ARMY_LETTER.get(t["army"], "?")
    if t["layer"] == "extra":
        return "XX"
    return TERRAIN_SYMBOL.get(t["type"], "??")


# ---------------------------------------------------------------- output

def render_grid(m: dict) -> list[str]:
    w = m["width"]
    lines = ["    " + " ".join(f"{x:02d}" for x in range(w))]
    for y, row in enumerate(m["terrain"]):
        lines.append(f"{y:02d}  " + " ".join(symbol(t) for t in row))
    return lines


def land_bounds(m: dict) -> tuple[int, int, int, int] | None:
    water = {"Sea", "Reef", "Blank"}
    cells = [(x, y) for y, row in enumerate(m["terrain"]) for x, t in enumerate(row)
             if t["type"] not in water]
    if not cells:
        return None
    xs, ys = [c[0] for c in cells], [c[1] for c in cells]
    return min(xs), min(ys), max(xs), max(ys)


def to_markdown(m: dict) -> str:
    out = [f"# {m['name'] or 'Untitled map'}", ""]
    f = m["format"]
    out += [
        f"- **Author:** {m['author'] or '(none)'}",
        f"- **Description:** {m['description'] or '(none)'}",
        f"- **Format:** `{f['header']}` ({f['editor']})",
        f"- **Tileset:** {f['tileset']}",
        f"- **Size:** {m['width']} x {m['height']} tiles",
    ]
    b = land_bounds(m)
    if b:
        out.append(f"- **Land/shoal area:** x {b[0]}-{b[2]}, y {b[1]}-{b[3]} "
                   f"({b[2] - b[0] + 1} x {b[3] - b[1] + 1}); everything outside is sea")
    out += ["", "Coordinates are 0-based: **x** is the column (0 = left), "
            "**y** is the row (0 = top).", "", "## Map", "", "```"]
    out += render_grid(m)
    out += ["```", "", "## Legend", "", "| Symbol | Meaning |", "|---|---|"]
    used_terrain = sorted({t["type"] for row in m["terrain"] for t in row if t["layer"] == "terrain"},
                          key=list(TERRAIN_SYMBOL).index)
    for name in used_terrain:
        out.append(f"| `{TERRAIN_SYMBOL[name]}` | {name} |")
    used_b = sorted({(t["type"], t["army"]) for row in m["terrain"] for t in row if t["layer"] == "building"})
    if used_b:
        kinds = sorted({k for k, _ in used_b})
        armies = sorted({a for _, a in used_b}, key=ARMIES.index)
        out.append("| `Xa` | Building: first letter = type ("
                   + ", ".join(f"`{BUILDING_LETTER[k]}` {k}" for k in kinds)
                   + "); second letter = owner ("
                   + ", ".join(f"`{ARMY_LETTER[a]}` {a}" for a in armies) + ") |")
    if any(t["layer"] == "extra" for row in m["terrain"] for t in row):
        out.append("| `XX` | Special structure (see Buildings list) |")

    out += ["", "## Buildings", ""]
    if m["buildings"]:
        out += ["| Owner | Type | x | y |", "|---|---|---|---|"]
        for bl in sorted(m["buildings"], key=lambda r: (ARMIES.index(r["army"]) if r["army"] in ARMIES else 9,
                                                         r["type"], r["y"], r["x"])):
            out.append(f"| {bl['army'] or '-'} | {bl['type']} | {bl['x']} | {bl['y']} |")
    else:
        out.append("None.")

    out += ["", "## Units", ""]
    if m["units"]:
        out += ["| Army | Unit | x | y | Standing on |", "|---|---|---|---|---|"]
        for u in m["units"]:
            out.append(f"| {u['army']} | {u['type']} | {u['x']} | {u['y']} | {u['on']} |")
    else:
        out.append("None. No units are pre-placed on this map.")

    out += ["", "## Tile counts", "", "| Tile | Count |", "|---|---|"]
    counts = Counter(terrain_name(t) for row in m["terrain"] for t in row)
    for k, n in counts.most_common():
        out.append(f"| {k} | {n} |")
    out.append("")
    return "\n".join(out)


def to_json(m: dict) -> dict:
    return {
        "name": m["name"], "author": m["author"], "description": m["description"],
        "format": m["format"], "width": m["width"], "height": m["height"],
        "coordinates": "0-based; x = column (0 = left), y = row (0 = top). "
                       "Row arrays are indexed [y][x].",
        "map_rows": [" ".join(symbol(t) for t in row) for row in m["terrain"]],
        "legend": {TERRAIN_SYMBOL[k]: k for k in TERRAIN_SYMBOL if k != "Plain (alternate sprite)"}
                  | {"<Letter><army>": "Building; letters "
                     + ", ".join(f"{v}={k}" for k, v in BUILDING_LETTER.items())
                     + "; army " + ", ".join(f"{v}={k}" for k, v in ARMY_LETTER.items())},
        "terrain_rows": [[terrain_name(t) for t in row] for row in m["terrain"]],
        "buildings": m["buildings"],
        "units": m["units"],
        "raw": {
            "note": "Original 16-bit tile values, [y][x]. Terrain 0-299, buildings 300-499, "
                    "units 500-899, extras 900-1299, 65535 = no unit.",
            "terrain": m["terrain_raw"], "units": m["units_raw"],
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("mapfile", type=Path)
    ap.add_argument("--out-dir", type=Path, default=Path("."))
    args = ap.parse_args()

    m = decode(args.mapfile.read_bytes())
    stem = args.out_dir / args.mapfile.stem
    md_path, json_path = stem.with_suffix(".md"), stem.with_suffix(".json")
    md_path.write_text(to_markdown(m))
    data = to_json(m)
    # Keep each row of the raw/terrain arrays on one line for readability.
    text = json.dumps(data, indent=2)
    json_path.write_text(compact_rows(text))
    print(f"Wrote {md_path} and {json_path}")


def compact_rows(text: str) -> str:
    """Collapse innermost JSON arrays of scalars onto single lines."""
    import re
    scalar = r'(?:-?\d+|"(?:[^"\\]|\\.)*")'
    return re.sub(rf"\[\s*(?:{scalar},\s*)*{scalar}\s*\]",
                  lambda mo: json.dumps(json.loads(mo.group(0))), text)


if __name__ == "__main__":
    main()
