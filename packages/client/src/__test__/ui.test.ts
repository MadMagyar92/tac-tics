import type { CaptureObject, TerrainObject } from "@tac-tics/api";
import { ObjectServiceImpl } from "@tac-tics/app";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderTerrain } from "../ui";

const square = (name: string, x: number, y: number): TerrainObject => ({
  identifier: { id: `terrain-${y * 10 + x + 1}`, mapId: "map-1" },
  definition: { scope: "terrain", name },
  position: { x, y },
});

describe("renderTerrain", () => {
  it("gives nothing for no terrain", () => {
    expect(renderTerrain([])).toBe("");
  });

  it("renders a square as the symbol of its definition", () => {
    expect(renderTerrain([square("sea", 0, 0)])).toBe("~");
  });

  it.each([
    ["airport", "A"],
    ["base", "B"],
    ["bridge", "#"],
    ["city", "C"],
    ["headquarters", "H"],
    ["mountain", "^"],
    ["plain", " "],
    ["port", "P"],
    ["reef", "*"],
    ["river", "r"],
    ["road", "="],
    ["sea", "~"],
    ["shoal", ","],
    ["woods", "f"],
  ])("renders %s as %j", (name, symbol) => {
    expect(renderTerrain([square(name, 0, 0)])).toBe(symbol);
  });

  it.each(["ghost", "", "constructor", "toString", "__proto__"])("renders the definition %j, which it does not know, as ?", (name) => {
    expect(renderTerrain([square(name, 0, 0)])).toBe("?");
  });

  it("separates the squares of a row with a space, and the rows with a line break", () => {
    const terrain = [square("sea", 0, 0), square("road", 1, 0), square("woods", 0, 1), square("bridge", 1, 1)];
    expect(renderTerrain(terrain)).toBe("~ =\nf #");
  });

  it("is as wide and as tall as the farthest terrain", () => {
    const rows = renderTerrain([square("sea", 3, 2)]).split("\n");
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.length)).toEqual([7, 7, 7]);
    expect(rows[2]).toBe("      ~");
  });

  it("leaves a square that has no terrain blank", () => {
    const rows = renderTerrain([square("sea", 0, 0), square("sea", 2, 0), square("sea", 1, 1)]).split("\n");
    expect(rows).toEqual(["~   ~", "  ~  "]);
  });

  it("places a square by its position, whatever the order it is given in", () => {
    const terrain = [square("sea", 0, 0), square("road", 1, 0), square("woods", 0, 1), square("bridge", 1, 1)];
    expect(renderTerrain([...terrain].reverse())).toBe(renderTerrain(terrain));
  });

  it("does not change the terrain it is given", () => {
    const terrain = [square("sea", 0, 0), square("road", 1, 0)];
    const before = structuredClone(terrain);
    renderTerrain(terrain);
    expect(terrain).toEqual(before);
  });

  describe("with the terrain of game-1", () => {
    const sea = Array(15).fill("~").join(" ");
    const spannIsland = [
      sea,
      "~ ~   f = = # = =   f B   B ~",
      "~     f = f ~   = C     H B ~",
      "~ C C = = ~ ~ ~ =   ^   = B ~",
      "~     =   ~ ~ ~ = C ^ C =   ~",
      "~ B = = C ~ ~ f = = = = = C ~",
      "~ B H         f f   ~ ~ # ~ ~",
      "~ ~ B B             ~ ~     ~",
      "~ ~ ~ ~ ^ C ^ f C   #   C C ~",
      sea,
    ];

    /** The terrain `GET /game/game-1/terrain` responds with: the static terrain of map-1, the map of game-1, then the captures of game-1. */
    const terrainOfGame = (): (TerrainObject | CaptureObject)[] => {
      const objects = new ObjectServiceImpl(resolve(__dirname, "../../../config/app.config.json"));
      return [
        ...[...objects.loadAll<TerrainObject>("terrain").values()].filter((terrain) => terrain.identifier.mapId === "map-1"),
        ...[...objects.loadAll<CaptureObject>("capture").values()].filter((capture) => capture.identifier.gameId === "game-1"),
      ];
    };

    it("renders Spann Island, 15 squares wide and 10 tall", () => {
      expect(terrainOfGame()).toHaveLength(150);
      expect(renderTerrain(terrainOfGame())).toBe(spannIsland.join("\n"));
    });

    it("renders the same map whatever the order of the terrain", () => {
      expect(renderTerrain(terrainOfGame().reverse())).toBe(spannIsland.join("\n"));
    });
  });
});
