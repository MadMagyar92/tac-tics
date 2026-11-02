import type {
  DefinitionKey,
  GameObject,
  MovementDefinition,
  OffenseDefinition,
  OffenseObject,
  PlayerObject,
  TerrainObject,
  UnitDefinition,
  UnitObject,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { canAttack, canDeploy, canMove, getAttackDamage, getMoveCost, isOccupied } from "../validate";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

const unit = (id: string, definition: string, x: number, y: number): UnitObject => ({
  identifier: { id, gameId: "g1" },
  definition: key("unit", definition),
  position: { x, y },
  moved: false,
  acted: false,
  health: 100,
  fuel: 60,
  playerId: id === "attacker" ? "p1" : "p2",
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

describe("getAttackDamage", () => {
  it("gives the damage of the entry for what the target is", () => {
    expect(getAttackDamage(definition(), recon(1, 0))).toBe(50);
  });

  it("picks the entry for the target among several", () => {
    const damage = [{ unit: key("unit", "infantry"), damage: 10 }, { unit: key("unit", "recon"), damage: 85 }, { unit: key("unit", "tank"), damage: 55 }];
    expect(getAttackDamage(definition({ damage }), recon(1, 0))).toBe(85);
    expect(getAttackDamage(definition({ damage }), unit("target", "infantry", 1, 0))).toBe(10);
    expect(getAttackDamage(definition({ damage }), unit("target", "tank", 1, 0))).toBe(55);
  });

  it.each([
    ["no entries", []],
    ["an entry for another unit", [{ unit: key("unit", "infantry"), damage: 50 }]],
    ["an entry whose name is the target's but is not a unit", [{ unit: key("terrain", "recon"), damage: 50 }]],
    ["an entry that does no damage", [{ unit: key("unit", "recon"), damage: 0 }]],
  ])("is -1 with %s", (_name, damage) => {
    expect(getAttackDamage(definition({ damage }), recon(1, 0))).toBe(-1);
  });

  it("gives the damage of an entry as it is when it is not zero, even when it would heal", () => {
    expect(getAttackDamage(definition({ damage: [{ unit: key("unit", "recon"), damage: -5 }] }), recon(1, 0))).toBe(-5);
    expect(getAttackDamage(definition({ damage: [{ unit: key("unit", "recon"), damage: 1 }] }), recon(1, 0))).toBe(1);
  });

  it("does not look at where the target is", () => {
    expect(getAttackDamage(definition(), recon(99, 99))).toBe(50);
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
    it.each([[9, 9], [9, 1], [1, 1], [-1, 0], [-1, -1], [5, 20]])("lets an offense with a capacity of %i and %i rounds attack when it has some or is unlimited", (ammoMax, ammo) => {
      expect(canAttack(attacker, recon(1, 0), offense(ammo), definition({ ammoMax }))).toBe(true);
    });

    it.each([[9, 0], [1, 0], [0, 0], [9, -1], [0, -1]])("refuses an offense with a capacity of %i and %i rounds", (ammoMax, ammo) => {
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
});

const walker = (x: number, y: number, fuel = 10): UnitObject => ({ ...unit("walker", "walker", x, y), fuel });

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
  ])("is -1 with %s", (_name, movement) => {
    expect(getMoveCost(movement, terrain("plain", 1, 0))).toBe(-1);
  });

  it("gives the cost of an entry as it is, even when it is free or negative", () => {
    expect(getMoveCost(movementOf([["plain", 0]]), terrain("plain", 1, 0))).toBe(0);
    expect(getMoveCost(movementOf([["plain", -4]]), terrain("plain", 1, 0))).toBe(-4);
  });

  it("does not look at where the terrain is", () => {
    expect(getMoveCost(walking, terrain("woods", 99, -99))).toBe(2);
  });
});

describe("canMove", () => {
  const walking = movementOf([["plain", 1], ["woods", 2], ["mountain", 3], ["road", 0], ["lava", -1]]);

  it("is true for an adjacent terrain that costs something within the move range and the fuel", () => {
    expect(canMove(walker(0, 0), terrain("plain", 1, 0), kind(3), walking)).toBe(true);
  });

  describe("adjacency", () => {
    it.each([[6, 5], [4, 5], [5, 6], [5, 4]])("is true for the terrain at (%i, %i), next to (5, 5)", (x, y) => {
      expect(canMove(walker(5, 5), terrain("plain", x, y), kind(3), walking)).toBe(true);
    });

    it.each([[5, 5], [7, 5], [3, 5], [5, 7], [5, 3], [6, 6], [4, 4], [6, 4], [4, 6], [8, 8], [0, 0]])(
      "is false for the terrain at (%i, %i), which is not next to (5, 5)",
      (x, y) => {
        expect(canMove(walker(5, 5), terrain("plain", x, y), kind(3), walking)).toBe(false);
      },
    );

    it("measures from where the unit is every time it is asked", () => {
      const moving = walker(0, 0);
      const next = terrain("plain", 1, 0);
      expect(canMove(moving, next, kind(3), walking)).toBe(true);
      moving.position = { x: 3, y: 3 };
      expect(canMove(moving, next, kind(3), walking)).toBe(false);
      moving.position = { x: 1, y: 1 };
      expect(canMove(moving, next, kind(3), walking)).toBe(true);
    });
  });

  describe("the cost", () => {
    it.each([["lava", "has a cost below zero"], ["ice", "has no entry"]])("is refused for a terrain that %s", (name) => {
      expect(canMove(walker(0, 0), terrain(name, 1, 0), kind(9), walking)).toBe(false);
    });

    it("is accepted for a terrain that costs nothing", () => {
      expect(canMove(walker(0, 0, 0), terrain("road", 1, 0), kind(0), walking)).toBe(true);
    });
  });

  describe("the move range", () => {
    it.each([[3, true], [4, true], [9, true], [2, false], [1, false], [0, false]])(
      "for a move range of %i, a terrain that costs 3 is %s",
      (moveMax, allowed) => {
        expect(canMove(walker(0, 0), terrain("mountain", 1, 0), kind(moveMax), walking)).toBe(allowed);
      },
    );
  });

  describe("the fuel", () => {
    it.each([[3, true], [4, true], [60, true], [2, false], [1, false], [0, false]])(
      "with %i fuel, a terrain that costs 3 is %s",
      (fuel, allowed) => {
        expect(canMove(walker(0, 0, fuel), terrain("mountain", 1, 0), kind(9), walking)).toBe(allowed);
      },
    );
  });

  it("needs the move range and the fuel both to cover the cost", () => {
    const mountain = terrain("mountain", 1, 0);
    expect(canMove(walker(0, 0, 10), mountain, kind(3), walking)).toBe(true);
    expect(canMove(walker(0, 0, 2), mountain, kind(3), walking)).toBe(false);
    expect(canMove(walker(0, 0, 10), mountain, kind(2), walking)).toBe(false);
    expect(canMove(walker(0, 0, 2), mountain, kind(2), walking)).toBe(false);
  });

  it("changes nothing it was given", () => {
    const moving = walker(0, 0);
    const next = terrain("plain", 1, 0);
    const definition = kind(3);
    const before = JSON.stringify([moving, next, definition, walking]);
    canMove(moving, next, definition, walking);
    expect(JSON.stringify([moving, next, definition, walking])).toBe(before);
  });
});

const tile = (x: number, y: number, playerId: string | undefined = undefined, gameId = "g1"): TerrainObject => ({
  identifier: { id: `tile-${x}-${y}`, gameId },
  definition: key("terrain", "base"),
  position: { x, y },
  playerId,
});

const standing = (x: number, y: number, gameId = "g1", playerId = "p2"): UnitObject => ({
  ...unit("standing", "recon", x, y),
  identifier: { id: `standing-${x}-${y}`, gameId },
  playerId,
});

describe("isOccupied", () => {
  it("is true when a unit is on the square of the terrain", () => {
    expect(isOccupied(tile(2, 3), [standing(2, 3)])).toBe(true);
  });

  it("is true when one of several units is on it, whoever's it is", () => {
    expect(isOccupied(tile(2, 3), [standing(0, 0), standing(2, 3, "g1", "p1"), standing(5, 5)])).toBe(true);
    expect(isOccupied(tile(2, 3), [standing(0, 0), standing(2, 3, "g1", "p2")])).toBe(true);
  });

  it.each([[2, 4], [2, 2], [3, 3], [1, 3], [3, 4], [0, 0], [3, 2]])("is false when the only unit is at (%i, %i), not on (2, 3)", (x, y) => {
    expect(isOccupied(tile(2, 3), [standing(x, y)])).toBe(false);
  });

  it("is false when there are no units", () => {
    expect(isOccupied(tile(2, 3), [])).toBe(false);
  });

  it("is false when the unit on the square is in another game", () => {
    expect(isOccupied(tile(2, 3), [standing(2, 3, "g2")])).toBe(false);
  });

  it("looks at the position of the unit as it is every time it is asked", () => {
    const there = standing(0, 0);
    expect(isOccupied(tile(2, 3), [there])).toBe(false);
    there.position = { x: 2, y: 3 };
    expect(isOccupied(tile(2, 3), [there])).toBe(true);
  });
});

const turnOf = (playerTurn: number, id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn });

const playerOf = (id: string, order: number, funds: number, gameId = "g1"): PlayerObject => ({
  identifier: { id, gameId },
  definition: key("player", "orange-star"),
  order,
  funds,
});

const priced = (fundsCost: number): UnitDefinition => ({ ...kind(3), fundsCost });

describe("canDeploy", () => {
  const first = playerOf("p1", 0, 5000);

  it("is true on the turn of a player who controls the terrain, has the funds, and has no unit on it", () => {
    expect(canDeploy(turnOf(0), first, tile(1, 1, "p1"), priced(1000), [])).toBe(true);
  });

  describe("the turn", () => {
    it("is false on the turn of another player", () => {
      expect(canDeploy(turnOf(1), first, tile(1, 1, "p1"), priced(1000), [])).toBe(false);
    });

    it.each([[0, 0, true], [1, 1, true], [2, 2, true], [1, 0, false], [0, 1, false], [3, 2, false]])(
      "for turn %i, the player of order %i is %s",
      (playerTurn, order, allowed) => {
        expect(canDeploy(turnOf(playerTurn), playerOf("p1", order, 5000), tile(1, 1, "p1"), priced(1000), [])).toBe(allowed);
      },
    );
  });

  describe("the control of the terrain", () => {
    it("is false for a terrain another player controls", () => {
      expect(canDeploy(turnOf(0), first, tile(1, 1, "p2"), priced(1000), [])).toBe(false);
    });

    it("is false for a terrain nobody controls", () => {
      expect(canDeploy(turnOf(0), first, tile(1, 1, undefined), priced(1000), [])).toBe(false);
    });
  });

  describe("the funds", () => {
    it.each([[1000, 1000, true], [1001, 1000, true], [5000, 1000, true], [999, 1000, false], [0, 1000, false], [0, 0, true]])(
      "with %i funds, a unit that costs %i is %s",
      (funds, cost, allowed) => {
        expect(canDeploy(turnOf(0), playerOf("p1", 0, funds), tile(1, 1, "p1"), priced(cost), [])).toBe(allowed);
      },
    );
  });

  describe("the units there are", () => {
    it("is false when a unit is on the terrain", () => {
      expect(canDeploy(turnOf(0), first, tile(1, 1, "p1"), priced(1000), [standing(1, 1)])).toBe(false);
    });

    it("is false when a unit of the player is on the terrain", () => {
      expect(canDeploy(turnOf(0), first, tile(1, 1, "p1"), priced(1000), [standing(1, 1, "g1", "p1")])).toBe(false);
    });

    it("is true when the units are elsewhere", () => {
      expect(canDeploy(turnOf(0), first, tile(1, 1, "p1"), priced(1000), [standing(1, 2), standing(2, 1), standing(0, 0)])).toBe(true);
    });
  });

  it("is false when any one of the four is lacking, and true only when none is", () => {
    const base = tile(1, 1, "p1");
    expect(canDeploy(turnOf(1), first, base, priced(1000), [])).toBe(false);
    expect(canDeploy(turnOf(0), first, tile(1, 1, "p2"), priced(1000), [])).toBe(false);
    expect(canDeploy(turnOf(0), first, base, priced(9000), [])).toBe(false);
    expect(canDeploy(turnOf(0), first, base, priced(1000), [standing(1, 1)])).toBe(false);
    expect(canDeploy(turnOf(0), first, base, priced(1000), [])).toBe(true);
  });

  it("changes nothing it was given", () => {
    const game = turnOf(0);
    const base = tile(1, 1, "p1");
    const definition = priced(1000);
    const units = [standing(2, 2)];
    const before = JSON.stringify([game, first, base, definition, units]);
    canDeploy(game, first, base, definition, units);
    expect(JSON.stringify([game, first, base, definition, units])).toBe(before);
  });
});
