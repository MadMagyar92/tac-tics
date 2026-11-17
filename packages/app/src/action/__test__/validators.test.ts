import {
  type DefinitionKey,
  type GameObject,
  type MovementDefinition,
  type MovementObject,
  type OffenseDefinition,
  type OffenseObject,
  type PlayerObject,
  Scope,
  type TerrainObject,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import {
  canAttack,
  canCapture,
  canDeploy,
  canMove,
  hasAction,
  inAttackRange,
  inMoveRange,
  nextId,
  nextMovementId,
  nextOffenseId,
  nextUnitId,
} from "../validators";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

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
  identifier: { id: `${name}-${x}-${y}`, gameId: "g1" },
  definition: key("terrain", name),
  position: { x, y },
  health: 20,
  playerId: undefined,
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
  actions: [],
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

const tile = (x: number, y: number, playerId: string | undefined = undefined, gameId = "g1"): TerrainObject => ({
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

const turnOf = (playerTurn: number, id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn, mapDefinition: key("map", "m1") });

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

describe("hasAction", () => {
  it("is true when the action is among the actions", () => {
    expect(hasAction([key("action", "attack"), key("action", "capture")], key("action", "capture"))).toBe(true);
  });

  it.each([
    ["no actions", []],
    ["only other actions", [key("action", "attack")]],
    ["an action of the same name in another scope", [key("unit", "capture")]],
  ])("is false with %s", (_name, actions) => {
    expect(hasAction(actions, key("action", "capture"))).toBe(false);
  });
});

const capturer = (x: number, y: number): UnitObject => ({ ...unit("capturer", "infantry", x, y), playerId: "p1" });

describe("canCapture", () => {
  it("is true for a unit that has not acted, on terrain that can be captured and that its player does not hold", () => {
    expect(canCapture(capturer(1, 1), tile(1, 1), true)).toBe(true);
    expect(canCapture(capturer(1, 1), tile(1, 1, "p2"), true)).toBe(true);
  });

  it("is false once the unit has acted", () => {
    expect(canCapture({ ...capturer(1, 1), acted: true }, tile(1, 1), true)).toBe(false);
  });

  it("does not look at whether the unit has moved", () => {
    expect(canCapture({ ...capturer(1, 1), moved: true }, tile(1, 1), true)).toBe(true);
  });

  it("is false for terrain that cannot be captured", () => {
    expect(canCapture(capturer(1, 1), tile(1, 1), false)).toBe(false);
  });

  it.each([[0, 1], [1, 0], [2, 1], [1, 2], [2, 2]])("is false when the unit is at (%i, %i), not on the terrain at (1, 1)", (x, y) => {
    expect(canCapture(capturer(x, y), tile(1, 1), true)).toBe(false);
  });

  it("is false for terrain its player already holds", () => {
    expect(canCapture(capturer(1, 1), tile(1, 1, "p1"), true)).toBe(false);
  });

  it("changes nothing it was given", () => {
    const unit = capturer(1, 1);
    const terrain = tile(1, 1);
    const before = JSON.stringify([unit, terrain]);
    canCapture(unit, terrain, true);
    expect(JSON.stringify([unit, terrain])).toBe(before);
  });
});

describe("nextId", () => {
  it("is the first id of the scope when there are no ids", () => {
    expect(nextId(Scope.Unit, [])).toBe("unit-1");
  });

  it("is one past the highest id of the scope, whatever order the ids are in and whatever gaps they leave", () => {
    expect(nextId(Scope.Unit, ["unit-2", "unit-9", "unit-4"])).toBe("unit-10");
  });

  it.each([
    ["ids of another scope", ["offense-7"]],
    ["ids that only start like the scope's", ["unit-3a", "units-5", "unit-"]],
    ["ids that do not follow the pattern at all", ["tank", "7", ""]],
  ])("leaves out %s", (_name, ids) => {
    expect(nextId(Scope.Unit, ids)).toBe("unit-1");
  });
});

describe("nextUnitId", () => {
  it("is one past the highest unit id", () => {
    expect(nextUnitId(["unit-1", "unit-4", "offense-9"])).toBe("unit-5");
  });
});

describe("nextMovementId", () => {
  it("is one past the highest movement id", () => {
    expect(nextMovementId(["movement-1", "unit-9"])).toBe("movement-2");
  });
});

describe("nextOffenseId", () => {
  it("is one past the highest offense id", () => {
    expect(nextOffenseId(["offense-1", "offense-2", "unit-9"])).toBe("offense-3");
  });
});
