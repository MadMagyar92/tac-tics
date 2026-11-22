import {
  type CaptureObject,
  type DefinitionKey,
  type GameObject,
  type MovementDefinition,
  type MovementObject,
  type OffenseDefinition,
  type OffenseObject,
  type PlayerObject,
  type TerrainObject,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import {
  canAttack,
  canCapture,
  canDeploy,
  canLoad,
  canMove,
  canUnload,
  inAttackRange,
  inMoveRange,
  isDefinitionKey,
  isId,
  isInGame,
  isLoaded,
  isNonEmptyString,
  isPlainObject,
  sameKey,
} from "../validators";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

describe("isPlainObject", () => {
  it.each([
    ["an empty object", {}],
    ["an object", { a: 1 }],
    ["a parsed JSON object", JSON.parse('{ "a": { "b": [1] } }')],
    ["an object with no prototype", Object.create(null)],
    ["an instance of a class", new (class Thing {})()],
  ])("is true for %s", (_name, value) => {
    expect(isPlainObject(value)).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty list", []],
    ["a list", [{ a: 1 }]],
    ["a string", "text"],
    ["a number", 3],
    ["zero", 0],
    ["a boolean", false],
    ["a function", () => ({})],
  ])("is false for %s", (_name, value) => {
    expect(isPlainObject(value)).toBe(false);
  });

  it("narrows the type so that its members can be read", () => {
    const value: unknown = { a: 1 };
    if (isPlainObject(value)) {
      expect(value.a).toBe(1);
    }
  });
});

describe("isNonEmptyString", () => {
  it.each(["a", " ", "0", "a longer text"])("is true for %j", (value) => {
    expect(isNonEmptyString(value)).toBe(true);
  });

  it.each([["the empty string", ""], ["null", null], ["undefined", undefined], ["a number", 3], ["zero", 0], ["a list of strings", ["a"]], ["an object", { length: 1 }]])(
    "is false for %s",
    (_name, value) => {
      expect(isNonEmptyString(value)).toBe(false);
    },
  );
});

describe("isId", () => {
  it.each([
    ["an identifier", { id: "a" }],
    ["an identifier with an empty id", { id: "" }],
    ["an identifier with more fields", { id: "a", gameId: "g", unitId: "u" }],
  ])("is true for %s", (_name, value) => {
    expect(isId(value)).toBe(true);
  });

  it.each([
    ["an object with no id", {}],
    ["an object whose id is a number", { id: 3 }],
    ["an object whose id is null", { id: null }],
    ["an object with only other fields", { gameId: "g" }],
    ["a list", ["a"]],
    ["null", null],
    ["a string", "a"],
  ])("is false for %s", (_name, value) => {
    expect(isId(value)).toBe(false);
  });
});

describe("isDefinitionKey", () => {
  it.each([
    ["a key", { scope: "unit", name: "tank" }],
    ["a key with empty strings", { scope: "", name: "" }],
    ["a key with more fields", { scope: "unit", name: "tank", extra: 1 }],
  ])("is true for %s", (_name, value) => {
    expect(isDefinitionKey(value)).toBe(true);
  });

  it.each([
    ["an object with no fields", {}],
    ["an object with only a scope", { scope: "unit" }],
    ["an object with only a name", { name: "tank" }],
    ["an object whose scope is a number", { scope: 1, name: "tank" }],
    ["an object whose name is a number", { scope: "unit", name: 1 }],
    ["a list of the two strings", ["unit", "tank"]],
    ["null", null],
    ["a string", "unit"],
  ])("is false for %s", (_name, value) => {
    expect(isDefinitionKey(value)).toBe(false);
  });
});

describe("sameKey", () => {
  const tank = key("unit", "tank");

  it("is true for keys with the same scope and name", () => {
    expect(sameKey(tank, { scope: "unit", name: "tank" })).toBe(true);
    expect(sameKey(tank, tank)).toBe(true);
  });

  it("is false when only the scope differs", () => {
    expect(sameKey(tank, { scope: "offense", name: "tank" })).toBe(false);
  });

  it("is false when only the name differs", () => {
    expect(sameKey(tank, { scope: "unit", name: "recon" })).toBe(false);
  });

  it("is false when both differ", () => {
    expect(sameKey(tank, { scope: "offense", name: "recon" })).toBe(false);
  });

  it("looks at the scope and the name only", () => {
    expect(sameKey({ ...tank, extra: 1 } as DefinitionKey, { ...tank, extra: 2 } as DefinitionKey)).toBe(true);
  });
});

describe("isInGame", () => {
  it("is true for a capture of the game, and for the static terrain of the map of the game", () => {
    expect(isInGame("g1", "m1", { id: "terrain-000", gameId: "g1" })).toBe(true);
    expect(isInGame("g1", "m1", { id: "terrain-000", mapId: "m1" })).toBe(true);
  });

  it("is false for a capture of another game, even one played on the same map", () => {
    expect(isInGame("g1", "m1", { id: "terrain-000", gameId: "g2" })).toBe(false);
  });

  it("is false for the static terrain of another map", () => {
    expect(isInGame("g1", "m1", { id: "terrain-000", mapId: "m2" })).toBe(false);
  });

  it("does not take the id of the game for the id of a map, nor the other way around", () => {
    expect(isInGame("g1", "m1", { id: "terrain-000", gameId: "m1" })).toBe(false);
    expect(isInGame("g1", "m1", { id: "terrain-000", mapId: "g1" })).toBe(false);
  });
});

const unit = (id: string, definition: string, x: number, y: number): UnitObject => ({
  identifier: { id, gameId: "g1" },
  definition: key("unit", definition),
  position: { x, y },
  moved: false,
  acted: false,
  health: 100,
  playerId: id === "attacker" ? "p1" : "p2",
  movementId: "walk",
  offenseIds: ["gun"],
  transportIds: [],
});

const offense = (ammo: number): OffenseObject => ({ identifier: { id: "gun", gameId: "g1", unitId: "attacker" }, definition: key("offense", "gun"), ammo });

type Options = { damage?: { unit: DefinitionKey; damage: number }[]; rangeMin?: number; rangeMax?: number; ammoMax?: number };

const definition = ({ damage = [{ unit: key("unit", "recon"), damage: 50 }], rangeMin = 1, rangeMax = 1, ammoMax = 9 }: Options = {}): OffenseDefinition => ({
  definition: key("offense", "gun"),
  ammoMax,
  rangeMin,
  rangeMax,
  damage,
});

const attacker = unit("attacker", "tank", 0, 0);
const recon = (x: number, y: number) => unit("target", "recon", x, y);

describe("inAttackRange", () => {
  const ranged = definition({ rangeMin: 2, rangeMax: 3 });

  it.each([[2, 0], [3, 0], [0, 2], [1, 1], [-2, 0], [-1, -2]])("is true for a target at (%i, %i), within 2 to 3 of the attacker", (x, y) => {
    expect(inAttackRange(attacker, recon(x, y), ranged)).toBe(true);
  });

  it.each([[0, 0], [1, 0], [4, 0], [2, 2], [-3, -1]])("is false for a target at (%i, %i), which is outside 2 to 3", (x, y) => {
    expect(inAttackRange(attacker, recon(x, y), ranged)).toBe(false);
  });

  it("measures the distance between the two positions, not from the origin", () => {
    expect(inAttackRange(unit("attacker", "tank", 3, 4), recon(3, 5), definition())).toBe(true);
    expect(inAttackRange(unit("attacker", "tank", 3, 4), recon(1, 0), definition())).toBe(false);
  });

  it("does not look at whether the offense damages the target", () => {
    expect(inAttackRange(attacker, recon(1, 0), definition({ damage: [] }))).toBe(true);
  });
});

describe("canAttack", () => {
  it("is true for a target in range, that the offense damages, when there is ammo", () => {
    expect(canAttack(attacker, recon(1, 0), offense(9), definition())).toBe(true);
  });

  describe("the damage", () => {
    it.each([
      ["no entry for the target", []],
      ["an entry for another unit", [{ unit: key("unit", "infantry"), damage: 50 }]],
      ["an entry whose name is the target's but is not a unit", [{ unit: key("terrain", "recon"), damage: 50 }]],
      ["an entry that does no damage", [{ unit: key("unit", "recon"), damage: 0 }]],
      ["an entry that would heal", [{ unit: key("unit", "recon"), damage: -5 }]],
    ])("is refused with %s", (_name, damage) => {
      expect(canAttack(attacker, recon(1, 0), offense(9), definition({ damage }))).toBe(false);
    });

    it("is accepted at the smallest damage there is", () => {
      expect(canAttack(attacker, recon(1, 0), offense(9), definition({ damage: [{ unit: key("unit", "recon"), damage: 1 }] }))).toBe(true);
    });
  });

  describe("the range", () => {
    const ranged = definition({ rangeMin: 2, rangeMax: 3 });

    it.each([[2, 0], [3, 0], [0, 2], [1, 1], [2, 1], [-2, 0], [0, -3], [-1, -2]])("accepts a target at (%i, %i), within 2 to 3 of the attacker", (x, y) => {
      expect(canAttack(attacker, recon(x, y), offense(9), ranged)).toBe(true);
    });

    it.each([[0, 0], [1, 0], [0, -1], [4, 0], [2, 2], [-3, -1]])("refuses a target at (%i, %i), which is outside 2 to 3", (x, y) => {
      expect(canAttack(attacker, recon(x, y), offense(9), ranged)).toBe(false);
    });

    it.each([[3, 5], [4, 4], [2, 4], [3, 3]])("measures the distance between the two positions, not from the origin: (3, 4) to (%i, %i) is 1", (x, y) => {
      expect(canAttack(unit("attacker", "tank", 3, 4), recon(x, y), offense(9), definition())).toBe(true);
    });

    it.each([[3, 6], [1, 4], [5, 4], [4, 5]])("refuses (%i, %i), which is 2 or more from (3, 4)", (x, y) => {
      expect(canAttack(unit("attacker", "tank", 3, 4), recon(x, y), offense(9), definition())).toBe(false);
    });

    it("measures the distance from where the units are every time it is asked", () => {
      const gun = offense(9);
      const gunDefinition = definition();
      const moving = unit("attacker", "tank", 0, 0);
      expect(canAttack(moving, recon(1, 0), gun, gunDefinition)).toBe(true);

      moving.position = { x: 5, y: 5 };
      expect(canAttack(moving, recon(1, 0), gun, gunDefinition)).toBe(false);

      moving.position = { x: 1, y: 1 };
      expect(canAttack(moving, recon(1, 0), gun, gunDefinition)).toBe(true);
    });
  });

  describe("the ammo", () => {
    it.each([[9, 9], [9, 1], [1, 1], [99, 99], [5, 20]])("lets an offense with a capacity of %i and %i rounds attack: it has some left", (ammoMax, ammo) => {
      expect(canAttack(attacker, recon(1, 0), offense(ammo), definition({ ammoMax }))).toBe(true);
    });

    it.each([[9, 0], [1, 0], [0, 0], [99, 0], [-1, 0], [-1, -1], [9, -1]])("refuses an offense with a capacity of %i and %i rounds: no capacity is unlimited", (ammoMax, ammo) => {
      expect(canAttack(attacker, recon(1, 0), offense(ammo), definition({ ammoMax }))).toBe(false);
    });
  });

  it("is false when any one of the three is lacking, and true only when none is", () => {
    const none = definition({ damage: [] });
    expect(canAttack(attacker, recon(1, 0), offense(9), none)).toBe(false);
    expect(canAttack(attacker, recon(5, 0), offense(9), definition())).toBe(false);
    expect(canAttack(attacker, recon(1, 0), offense(0), definition())).toBe(false);
    expect(canAttack(attacker, recon(1, 0), offense(9), definition())).toBe(true);
  });

  it("is false when the attacker has already acted", () => {
    expect(canAttack({ ...attacker, acted: true }, recon(1, 0), offense(9), definition())).toBe(false);
  });

  it("is true when the attacker has moved but not acted", () => {
    expect(canAttack({ ...attacker, moved: true }, recon(1, 0), offense(9), definition())).toBe(true);
  });

  it("changes nothing it was given", () => {
    const gun = offense(9);
    const gunDefinition = definition();
    const target = recon(1, 0);
    const before = JSON.stringify([attacker, target, gun, gunDefinition]);
    canAttack(attacker, target, gun, gunDefinition);
    expect(JSON.stringify([attacker, target, gun, gunDefinition])).toBe(before);
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

const kind = (moveMax: number): UnitDefinition => ({
  definition: key("unit", "walker"),
  fundsCost: 1000,
  visionMax: 2,
  fuelMax: 99,
  moveMax,
  movement: key("movement", "walk"),
  offenses: [],
  capture: undefined,
  transport: undefined,
});

const walker = (x: number, y: number): UnitObject => unit("walker", "walker", x, y);

const movement = (fuel = 10): MovementObject => ({ identifier: { id: "walk", gameId: "g1", unitId: "walker" }, definition: key("movement", "walk"), fuel });

/** The unit of `playerId` on the terrain at (1, 0). */
const occupant = (playerId: string) => standing(1, 0, "g1", playerId);

describe("inMoveRange", () => {
  it.each([[6, 5], [4, 5], [5, 6], [5, 4]])("is true for the terrain at (%i, %i), next to (5, 5)", (x, y) => {
    expect(inMoveRange(walker(5, 5), terrain("plain", x, y))).toBe(true);
  });

  it.each([[5, 5], [7, 5], [5, 3], [6, 6], [4, 4], [8, 8], [0, 0]])("is false for the terrain at (%i, %i), which is not next to (5, 5)", (x, y) => {
    expect(inMoveRange(walker(5, 5), terrain("plain", x, y))).toBe(false);
  });

  it("does not look at what the terrain is", () => {
    expect(inMoveRange(walker(0, 0), terrain("ice", 1, 0))).toBe(true);
  });
});

describe("canMove", () => {
  const walking = movementOf([["plain", 1], ["woods", 2], ["mountain", 3], ["road", 0], ["lava", -1]]);

  it("is true for an adjacent terrain that costs something within the fuel", () => {
    expect(canMove(walker(0, 0), terrain("plain", 1, 0), movement(), walking, undefined)).toBe(true);
  });

  describe("adjacency", () => {
    it.each([[6, 5], [4, 5], [5, 6], [5, 4]])("is true for the terrain at (%i, %i), next to (5, 5)", (x, y) => {
      expect(canMove(walker(5, 5), terrain("plain", x, y), movement(), walking, undefined)).toBe(true);
    });

    it.each([[5, 5], [7, 5], [3, 5], [5, 7], [5, 3], [6, 6], [4, 4], [6, 4], [4, 6], [8, 8], [0, 0]])(
      "is false for the terrain at (%i, %i), which is not next to (5, 5)",
      (x, y) => {
        expect(canMove(walker(5, 5), terrain("plain", x, y), movement(), walking, undefined)).toBe(false);
      },
    );

    it("measures from where the unit is every time it is asked", () => {
      const moving = walker(0, 0);
      const next = terrain("plain", 1, 0);
      expect(canMove(moving, next, movement(), walking, undefined)).toBe(true);
      moving.position = { x: 3, y: 3 };
      expect(canMove(moving, next, movement(), walking, undefined)).toBe(false);
      moving.position = { x: 1, y: 1 };
      expect(canMove(moving, next, movement(), walking, undefined)).toBe(true);
    });
  });

  describe("the cost", () => {
    it("is refused for a terrain that has no entry", () => {
      expect(canMove(walker(0, 0), terrain("ice", 1, 0), movement(), walking, undefined)).toBe(false);
    });

    it.each([["road", "costs nothing"], ["lava", "has a cost below zero"]])("is accepted for a terrain that %s, even with no fuel", (name) => {
      expect(canMove(walker(0, 0), terrain(name, 1, 0), movement(0), walking, undefined)).toBe(true);
    });
  });

  describe("the fuel", () => {
    it.each([[3, true], [4, true], [60, true], [2, false], [1, false], [0, false]])(
      "with %i fuel, a terrain that costs 3 is %s",
      (fuel, allowed) => {
        expect(canMove(walker(0, 0), terrain("mountain", 1, 0), movement(fuel), walking, undefined)).toBe(allowed);
      },
    );
  });

  describe("the units there are", () => {
    it("is false when an enemy is on the terrain", () => {
      expect(canMove(walker(0, 0), terrain("plain", 1, 0), movement(), walking, occupant("p1"))).toBe(false);
    });

    it("is true when an ally is on the terrain", () => {
      expect(canMove(walker(0, 0), terrain("plain", 1, 0), movement(), walking, occupant("p2"))).toBe(true);
    });

    it("is true when no unit is on the terrain", () => {
      expect(canMove(walker(0, 0), terrain("plain", 1, 0), movement(), walking, undefined)).toBe(true);
    });
  });

  it("is false when the unit has already moved", () => {
    expect(canMove({ ...walker(0, 0), moved: true }, terrain("plain", 1, 0), movement(), walking, undefined)).toBe(false);
  });

  it("is false when the unit has already acted, even though it has not moved", () => {
    expect(canMove({ ...walker(0, 0), acted: true }, terrain("plain", 1, 0), movement(), walking, undefined)).toBe(false);
  });

  it("changes nothing it was given", () => {
    const moving = walker(0, 0);
    const next = terrain("plain", 1, 0);
    const walk = movement();
    const other = occupant("p1");
    const before = JSON.stringify([moving, next, walk, walking, other]);
    canMove(moving, next, walk, walking, other);
    expect(JSON.stringify([moving, next, walk, walking, other])).toBe(before);
  });
});

const tile = (x: number, y: number, playerId: string | undefined = undefined, gameId = "g1"): CaptureObject => ({
  identifier: { id: `tile-${x}-${y}`, gameId },
  definition: key("terrain", "base"),
  position: { x, y },
  health: 20,
  playerId,
});

const standing = (x: number, y: number, gameId = "g1", playerId = "p2"): UnitObject => ({
  ...unit("standing", "recon", x, y),
  identifier: { id: `standing-${x}-${y}`, gameId },
  playerId,
});

const turnOf = (playerTurn: number, id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn, mapId: "m1" });

const playerOf = (id: string, order: number, funds: number, gameId = "g1"): PlayerObject => ({
  identifier: { id, gameId },
  definition: key("player", "orange-star"),
  order,
  funds,
});

const priced = (fundsCost: number): UnitDefinition => ({ ...kind(3), fundsCost });

describe("canDeploy", () => {
  const first = playerOf("p1", 0, 5000);

  it("is true on the turn of a player who controls the terrain and has the funds", () => {
    expect(canDeploy(turnOf(0), first, tile(1, 1, "p1"), priced(1000))).toBe(true);
  });

  describe("the turn", () => {
    it("is false on the turn of another player", () => {
      expect(canDeploy(turnOf(1), first, tile(1, 1, "p1"), priced(1000))).toBe(false);
    });

    it.each([[0, 0, true], [1, 1, true], [2, 2, true], [1, 0, false], [0, 1, false], [3, 2, false]])(
      "for turn %i, the player of order %i is %s",
      (playerTurn, order, allowed) => {
        expect(canDeploy(turnOf(playerTurn), playerOf("p1", order, 5000), tile(1, 1, "p1"), priced(1000))).toBe(allowed);
      },
    );
  });

  describe("the control of the terrain", () => {
    it("is false for a terrain another player controls", () => {
      expect(canDeploy(turnOf(0), first, tile(1, 1, "p2"), priced(1000))).toBe(false);
    });

    it("is false for a terrain nobody controls", () => {
      expect(canDeploy(turnOf(0), first, tile(1, 1, undefined), priced(1000))).toBe(false);
    });

    it("is false for static terrain, which nobody can control", () => {
      expect(canDeploy(turnOf(0), first, terrain("plain", 1, 1), priced(1000))).toBe(false);
    });
  });

  describe("the funds", () => {
    it.each([[1000, 1000, true], [1001, 1000, true], [5000, 1000, true], [999, 1000, false], [0, 1000, false], [0, 0, true]])(
      "with %i funds, a unit that costs %i is %s",
      (funds, cost, allowed) => {
        expect(canDeploy(turnOf(0), playerOf("p1", 0, funds), tile(1, 1, "p1"), priced(cost))).toBe(allowed);
      },
    );
  });

  it("is false when any one of the three is lacking, and true only when none is", () => {
    const base = tile(1, 1, "p1");
    expect(canDeploy(turnOf(1), first, base, priced(1000))).toBe(false);
    expect(canDeploy(turnOf(0), first, tile(1, 1, "p2"), priced(1000))).toBe(false);
    expect(canDeploy(turnOf(0), first, base, priced(9000))).toBe(false);
    expect(canDeploy(turnOf(0), first, base, priced(1000))).toBe(true);
  });

  it("changes nothing it was given", () => {
    const game = turnOf(0);
    const base = tile(1, 1, "p1");
    const definition = priced(1000);
    const before = JSON.stringify([game, first, base, definition]);
    canDeploy(game, first, base, definition);
    expect(JSON.stringify([game, first, base, definition])).toBe(before);
  });
});

const capturer = (x: number, y: number): UnitObject => ({ ...unit("capturer", "infantry", x, y), playerId: "p1" });

/** The terrain a capture definition allows, among them the base every tile is. */
const capturable = [{ terrain: key("terrain", "city") }, { terrain: key("terrain", "base") }];

describe("canCapture", () => {
  it("is true for a unit that has not acted, on terrain its capture definition allows and that its player does not hold", () => {
    expect(canCapture(capturer(1, 1), tile(1, 1), capturable)).toBe(true);
    expect(canCapture(capturer(1, 1), tile(1, 1, "p2"), capturable)).toBe(true);
  });

  it("is false once the unit has acted", () => {
    expect(canCapture({ ...capturer(1, 1), acted: true }, tile(1, 1), capturable)).toBe(false);
  });

  it("does not look at whether the unit has moved", () => {
    expect(canCapture({ ...capturer(1, 1), moved: true }, tile(1, 1), capturable)).toBe(true);
  });

  it.each([
    ["no terrain", []],
    ["only other terrain", [{ terrain: key("terrain", "city") }]],
    ["terrain of the same name in another scope", [{ terrain: key("unit", "base") }]],
  ])("is false when the capture definition allows %s", (_name, terrains) => {
    expect(canCapture(capturer(1, 1), tile(1, 1), terrains)).toBe(false);
  });

  it.each([[0, 1], [1, 0], [2, 1], [1, 2], [2, 2]])("is false when the unit is at (%i, %i), not on the terrain at (1, 1)", (x, y) => {
    expect(canCapture(capturer(x, y), tile(1, 1), capturable)).toBe(false);
  });

  it("is false for terrain its player already holds", () => {
    expect(canCapture(capturer(1, 1), tile(1, 1, "p1"), capturable)).toBe(false);
  });

  it("changes nothing it was given", () => {
    const unit = capturer(1, 1);
    const terrain = tile(1, 1);
    const before = JSON.stringify([unit, terrain, capturable]);
    canCapture(unit, terrain, capturable);
    expect(JSON.stringify([unit, terrain, capturable])).toBe(before);
  });
});

const allowed = [{ unit: key("unit", "infantry") }, { unit: key("unit", "mech") }];

const carrier = (x: number, y: number): UnitObject => ({ ...unit("carrier", "apc", x, y), playerId: "p1" });

/** A unit of the carrier's player, of the kind `definition`, at (5, 5). */
const loader = (definition = "infantry"): UnitObject => ({ ...unit("loader", definition, 5, 5), playerId: "p1" });

/** The carrier at (5, 5), transporting the units `transportIds`. */
const holder = (...transportIds: string[]): UnitObject => ({ ...carrier(5, 5), transportIds });

describe("canLoad", () => {
  it("is true for an ally unit that has not acted, on the square of a carrier with room whose transport definition allows it", () => {
    expect(canLoad(loader(), holder(), allowed, 1)).toBe(true);
    expect(canLoad(loader("mech"), holder(), allowed, 1)).toBe(true);
  });

  it("is false once the unit has acted", () => {
    expect(canLoad({ ...loader(), acted: true }, holder(), allowed, 1)).toBe(false);
  });

  it("does not look at whether the unit has moved", () => {
    expect(canLoad({ ...loader(), moved: true }, holder(), allowed, 1)).toBe(true);
  });

  it("is false for the carrier itself, even when its transport definition allows its kind", () => {
    expect(canLoad(holder(), holder(), [{ unit: key("unit", "apc") }], 1)).toBe(false);
  });

  it("is false for a carrier of another player", () => {
    expect(canLoad(loader(), { ...holder(), playerId: "p2" }, allowed, 1)).toBe(false);
  });

  it.each([[6, 5], [4, 5], [5, 6], [5, 4], [6, 6]])("is false for a carrier at (%i, %i), not on the unit's square at (5, 5)", (x, y) => {
    expect(canLoad(loader(), { ...holder(), position: { x, y } }, allowed, 1)).toBe(false);
  });

  it.each([
    ["no units", []],
    ["only other units", [{ unit: key("unit", "tank") }]],
    ["a unit of the same name in another scope", [{ unit: key("terrain", "infantry") }]],
  ])("is false when the transport definition allows %s", (_name, units) => {
    expect(canLoad(loader(), holder(), units, 1)).toBe(false);
  });

  it.each([[2, [], true], [2, ["rider"], true], [2, ["rider", "other"], false], [1, ["rider"], false], [1, ["a", "b", "c"], false], [0, [], false]])(
    "with a max of %i units, a carrier holding %j is %s",
    (maxUnits, transportIds, allowedToLoad) => {
      expect(canLoad(loader(), holder(...transportIds), allowed, maxUnits)).toBe(allowedToLoad);
    },
  );

  it("changes nothing it was given", () => {
    const loading = loader();
    const target = holder("rider");
    const before = JSON.stringify([loading, target, allowed]);
    canLoad(loading, target, allowed, 2);
    expect(JSON.stringify([loading, target, allowed])).toBe(before);
  });
});

describe("isLoaded", () => {
  it("is true for a unit that a unit in the list transports", () => {
    expect(isLoaded([holder("rider")], "rider")).toBe(true);
    expect(isLoaded([walker(0, 0), holder("other", "rider")], "rider")).toBe(true);
  });

  it.each([
    ["no units", []],
    ["only units that hold nothing", [walker(0, 0), carrier(5, 5)]],
    ["only units that hold other units", [holder("other")]],
  ])("is false with %s", (_name, units) => {
    expect(isLoaded(units, "rider")).toBe(false);
  });

  it("is false for a carrier itself, which holds units but is not held", () => {
    expect(isLoaded([holder("rider")], "carrier")).toBe(false);
  });
});

describe("canUnload", () => {
  const walking = movementOf([["plain", 1], ["woods", 2], ["road", 0]]);

  it("is true for an empty terrain next to the carrier that the unloaded unit's movement can enter", () => {
    expect(canUnload(carrier(5, 5), terrain("plain", 6, 5), walking, false)).toBe(true);
  });

  describe("adjacency", () => {
    it.each([[6, 5], [4, 5], [5, 6], [5, 4]])("is true for the terrain at (%i, %i), next to (5, 5)", (x, y) => {
      expect(canUnload(carrier(5, 5), terrain("plain", x, y), walking, false)).toBe(true);
    });

    it.each([[5, 5], [7, 5], [5, 3], [6, 6], [4, 4], [0, 0]])("is false for the terrain at (%i, %i), which is not next to (5, 5)", (x, y) => {
      expect(canUnload(carrier(5, 5), terrain("plain", x, y), walking, false)).toBe(false);
    });
  });

  describe("the cost", () => {
    it("is refused for a terrain the unloaded unit's movement has no entry for", () => {
      expect(canUnload(carrier(5, 5), terrain("sea", 6, 5), walking, false)).toBe(false);
    });

    it.each([["woods", "costs more than plain"], ["road", "costs nothing"]])("is accepted for a terrain that %s, since unloading spends no fuel", (name) => {
      expect(canUnload(carrier(5, 5), terrain(name, 6, 5), walking, false)).toBe(true);
    });
  });

  it("is false when another unit is on the terrain", () => {
    expect(canUnload(carrier(5, 5), terrain("plain", 6, 5), walking, true)).toBe(false);
  });

  it("is false when the carrier has already acted", () => {
    expect(canUnload({ ...carrier(5, 5), acted: true }, terrain("plain", 6, 5), walking, false)).toBe(false);
  });

  it("is true when the carrier has moved but not acted", () => {
    expect(canUnload({ ...carrier(5, 5), moved: true }, terrain("plain", 6, 5), walking, false)).toBe(true);
  });

  it("changes nothing it was given", () => {
    const unit = carrier(5, 5);
    const next = terrain("plain", 6, 5);
    const before = JSON.stringify([unit, next, walking]);
    canUnload(unit, next, walking, false);
    expect(JSON.stringify([unit, next, walking])).toBe(before);
  });
});
