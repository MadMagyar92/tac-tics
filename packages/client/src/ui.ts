import type { TerrainObject } from "@tac-tics/api";

const BLANK = " ";
const UNKNOWN = "?";

const SYMBOLS = new Map([
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
]);

/**
 * Renders the terrain of a game, as the response of `/game/:gameId/terrain` gives it, as one line of ASCII for each row of the map.
 * The grid is as wide and as tall as the farthest terrain, each square is a symbol of its definition, and a square that has no terrain is blank.
 */
export function renderTerrain(terrain: TerrainObject[]): string {
  const width = terrain.reduce((farthest, { position }) => Math.max(farthest, position.x + 1), 0);
  const height = terrain.reduce((farthest, { position }) => Math.max(farthest, position.y + 1), 0);
  const rows = Array.from({ length: height }, () => Array<string>(width).fill(BLANK));

  for (const { definition, position } of terrain) {
    rows[position.y][position.x] = SYMBOLS.get(definition.name) ?? UNKNOWN;
  }
  return rows.map((row) => row.join(" ")).join("\n");
}
