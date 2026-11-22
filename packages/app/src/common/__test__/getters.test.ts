import { type DefinitionKey, type MovementDefinition, type OffenseDefinition, type PlayerObject, type TerrainObject, type UnitObject } from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { filterUnitsFromGame, getAttackDamage, getMoveCost, getPlayerFromTurn, getUnitAtPosition, getUnitsFromTransport } from "../getters";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

const unit = (id: string, definition: string, x: number, y: number): UnitObject => ({
  identifier: { id, gameId: "g1" },
  definition: key("unit", definition),
  position: { x, y },
  moved: false,
  acted: false,
  health: 100,
  playerId: "p2",
  movementId: "walk",
  offenseIds: ["gun"],
  transportIds: [],
});

const definition = (damage = [{ unit: key("unit", "recon"), damage: 50 }]): OffenseDefinition => ({
  definition: key("offense", "gun"),
  ammoMax: 9,
  rangeMin: 1,
  rangeMax: 1,
  damage,
});

const recon = (x: number, y: number) => unit("target", "recon", x, y);

describe("getAttackDamage", () => {
  it("gives the damage of the entry for what the target is", () => {
    expect(getAttackDamage(definition(), recon(1, 0))).toBe(50);
  });

  it("picks the entry for the target among several", () => {
    const damage = [{ unit: key("unit", "infantry"), damage: 10 }, { unit: key("unit", "recon"), damage: 85 }, { unit: key("unit", "tank"), damage: 55 }];
    expect(getAttackDamage(definition(damage), recon(1, 0))).toBe(85);
    expect(getAttackDamage(definition(damage), unit("target", "infantry", 1, 0))).toBe(10);
    expect(getAttackDamage(definition(damage), unit("target", "tank", 1, 0))).toBe(55);
  });

  it.each([
    ["no entries", []],
    ["an entry for another unit", [{ unit: key("unit", "infantry"), damage: 50 }]],
    ["an entry whose name is the target's but is not a unit", [{ unit: key("terrain", "recon"), damage: 50 }]],
  ])("is undefined with %s", (_name, damage) => {
    expect(getAttackDamage(definition(damage), recon(1, 0))).toBeUndefined();
  });

  it("gives the damage of an entry as it is, even when it does nothing or would heal", () => {
    expect(getAttackDamage(definition([{ unit: key("unit", "recon"), damage: 0 }]), recon(1, 0))).toBe(0);
    expect(getAttackDamage(definition([{ unit: key("unit", "recon"), damage: -5 }]), recon(1, 0))).toBe(-5);
    expect(getAttackDamage(definition([{ unit: key("unit", "recon"), damage: 1 }]), recon(1, 0))).toBe(1);
  });

  it("does not look at where the target is", () => {
    expect(getAttackDamage(definition(), recon(99, 99))).toBe(50);
  });
});

const terrain = (name: string, x: number, y: number): TerrainObject => ({
  identifier: { id: `${name}-${x}-${y}`, mapId: "m1" },
  definition: key("terrain", name),
  position: { x, y },
});

const movementOf = (costs: [string, number][], scope = "terrain"): MovementDefinition => ({
  definition: key("movement", "walk"),
  cost: costs.map(([name, cost]) => ({ terrain: key(scope, name), cost })),
});

describe("getMoveCost", () => {
  const walking = movementOf([["plain", 1], ["woods", 2], ["mountain", 3]]);

  it("gives the cost of the entry for what the terrain is", () => {
    expect(getMoveCost(walking, terrain("plain", 1, 0))).toBe(1);
    expect(getMoveCost(walking, terrain("woods", 1, 0))).toBe(2);
    expect(getMoveCost(walking, terrain("mountain", 1, 0))).toBe(3);
  });

  it.each([
    ["no entries", movementOf([])],
    ["an entry for another terrain", movementOf([["woods", 2]])],
    ["an entry whose name is the terrain's but is not a terrain", movementOf([["plain", 1]], "unit")],
  ])("is undefined with %s", (_name, movement) => {
    expect(getMoveCost(movement, terrain("plain", 1, 0))).toBeUndefined();
  });

  it("gives the cost of an entry as it is, even when it is free or negative", () => {
    expect(getMoveCost(movementOf([["plain", 0]]), terrain("plain", 1, 0))).toBe(0);
    expect(getMoveCost(movementOf([["plain", -4]]), terrain("plain", 1, 0))).toBe(-4);
  });

  it("does not look at where the terrain is", () => {
    expect(getMoveCost(walking, terrain("woods", 99, -99))).toBe(2);
  });
});

const standing = (x: number, y: number, gameId = "g1", playerId = "p2"): UnitObject => ({
  ...unit("standing", "recon", x, y),
  identifier: { id: `standing-${x}-${y}`, gameId },
  playerId,
});

describe("filterUnitsFromGame", () => {
  it("keeps the units of the game, in the order of the list", () => {
    const units = [standing(1, 1), standing(2, 2, "g2"), standing(3, 3)];
    expect(filterUnitsFromGame(units, "g1")).toEqual([units[0], units[2]]);
  });

  it("gives none when no unit is in the game, or there are no units", () => {
    expect(filterUnitsFromGame([standing(1, 1, "g2")], "g1")).toEqual([]);
    expect(filterUnitsFromGame([], "g1")).toEqual([]);
  });

  it("keeps the units a carrier of the game holds, since they are still in the game", () => {
    const carrier = { ...standing(1, 1), transportIds: ["standing-1-2"] };
    const rider = standing(1, 2);
    expect(filterUnitsFromGame([carrier, rider], "g1")).toEqual([carrier, rider]);
  });

  it("changes nothing it was given", () => {
    const units = [standing(1, 1), standing(2, 2, "g2")];
    const before = JSON.stringify(units);
    filterUnitsFromGame(units, "g1");
    expect(JSON.stringify(units)).toBe(before);
  });
});

describe("getUnitAtPosition", () => {
  it("gives the unit at the position, out of several", () => {
    const there = standing(2, 3);
    expect(getUnitAtPosition([standing(0, 0), there, standing(5, 5)], { x: 2, y: 3 })).toBe(there);
  });

  it.each([[2, 4], [2, 2], [3, 3], [1, 3], [3, 2]])("gives nothing when the only unit is at (%i, %i), not at (2, 3)", (x, y) => {
    expect(getUnitAtPosition([standing(x, y)], { x: 2, y: 3 })).toBeUndefined();
  });

  it("gives nothing when there are no units", () => {
    expect(getUnitAtPosition([], { x: 2, y: 3 })).toBeUndefined();
  });

  it("compares the position alone, whatever the game or player of the unit", () => {
    const there = standing(2, 3, "g2", "p1");
    expect(getUnitAtPosition([there], { x: 2, y: 3 })).toBe(there);
  });

  it("leaves out a unit a carrier in the list holds, which is off the map, and gives the carrier there instead", () => {
    const loaded = { ...standing(2, 3), identifier: { id: "loaded", gameId: "g1" } };
    const carrier = { ...standing(2, 3), transportIds: ["loaded"] };
    expect(getUnitAtPosition([loaded, carrier], { x: 2, y: 3 })).toBe(carrier);
  });

  it("leaves out a unit a carrier in the list holds, wherever the carrier is", () => {
    const loaded = { ...standing(2, 3), identifier: { id: "loaded", gameId: "g1" } };
    expect(getUnitAtPosition([loaded, { ...standing(5, 5), transportIds: ["loaded"] }], { x: 2, y: 3 })).toBeUndefined();
  });
});

/** A unit at (1, 1) that transports the units `transportIds`. */
const holding = (id: string, ...transportIds: string[]): UnitObject => ({ ...unit(id, "apc", 1, 1), transportIds });

describe("getUnitsFromTransport", () => {
  it("gives the units transported, in the order of the list", () => {
    const units = [holding("rider-2"), holding("stranger"), holding("rider-1")];
    expect(getUnitsFromTransport(units, ["rider-1", "rider-2"])).toEqual([holding("rider-2"), holding("rider-1")]);
  });

  it("gives nothing when no units are transported", () => {
    expect(getUnitsFromTransport([holding("rider")], [])).toEqual([]);
  });

  it("gives the units a held carrier holds in turn, each after its carrier", () => {
    const units = [holding("rider"), holding("lander", "apc"), holding("apc", "rider"), holding("stranger")];
    expect(getUnitsFromTransport(units, ["apc"]).map(({ identifier }) => identifier.id)).toEqual(["apc", "rider"]);
  });

  it("leaves out an id that no unit in the list has", () => {
    expect(getUnitsFromTransport([holding("rider")], ["rider", "ghost"])).toEqual([holding("rider")]);
  });

  it("compares the ids alone, whatever the position of the units", () => {
    const far = { ...holding("rider"), position: { x: 9, y: 9 } };
    expect(getUnitsFromTransport([far], ["rider"])).toEqual([far]);
  });
});

const playerOf = (id: string, order: number, gameId = "g1"): PlayerObject => ({
  identifier: { id, gameId },
  definition: key("player", "orange-star"),
  order,
  funds: 1000,
});

describe("getPlayerFromTurn", () => {
  it("gives the player whose order is the turn, out of several", () => {
    const second = playerOf("p2", 2);
    expect(getPlayerFromTurn([playerOf("p1", 1), second, playerOf("p3", 3)], 2)).toBe(second);
  });

  it("gives nothing when no player has the turn's order", () => {
    expect(getPlayerFromTurn([playerOf("p1", 1), playerOf("p2", 2)], 3)).toBeUndefined();
  });

  it("gives nothing when there are no players", () => {
    expect(getPlayerFromTurn([], 1)).toBeUndefined();
  });

  it("compares the order alone, whatever the game of the player", () => {
    const other = playerOf("p1", 1, "g2");
    expect(getPlayerFromTurn([other], 1)).toBe(other);
  });
});
