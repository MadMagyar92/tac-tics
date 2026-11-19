import type {
  BaseObject,
  Definition,
  DefinitionKey,
  DefinitionService,
  GameObject,
  Id,
  MoveActionInput,
  MovementDefinition,
  MovementObject,
  ObjectService,
  TerrainObject,
  UnitDefinition,
  UnitObject,
  UnitReferenceId,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { MOVE_ACTION, MoveActionService } from "../move";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

const movementDefinition = (name: string, costs: Record<string, number>): MovementDefinition => ({
  definition: key("movement", name),
  cost: Object.entries(costs).map(([terrain, cost]) => ({ terrain: key("terrain", terrain), cost })),
});

const infantry: UnitDefinition = {
  definition: key("unit", "infantry"),
  fundsCost: 1000,
  visionMax: 2,
  fuelMax: 99,
  moveMax: 3,
  movement: key("movement", "foot"),
  offenses: [],
  capture: undefined,
  transport: undefined,
};

const definitions: Definition[] = [
  movementDefinition("foot", { plain: 1, woods: 2, mountain: 3 }),
  movementDefinition("tread", { plain: 1, woods: 3 }), // cannot enter a mountain
  movementDefinition("free", { plain: 0 }),
  movementDefinition("refund", { plain: -1 }),
  infantry,
];

type MovementOptions = { walks?: string; fuel?: number };

/** The movement of the mover, of the movement definition `walks`, with `fuel`. */
const movement = ({ walks = "foot", fuel = 10 }: MovementOptions = {}): MovementObject => ({
  identifier: { id: "walk", gameId: "g1", unitId: "mover" },
  definition: key("movement", walks),
  fuel,
});

/**
 * A definition service that knows `definitions` and remembers what it was asked for, and an object service that holds
 * `units` and the movement `held` of the mover, and remembers saves.
 */
function createWorld(units: UnitObject[] = [], held: MovementObject = movement()) {
  const known = new Map(definitions.map((definition) => [`${definition.definition.scope}:${definition.definition.name}`, definition]));
  const requested: DefinitionKey[] = [];
  const definitionService: DefinitionService = {
    get<D extends Definition>(requestedKey: DefinitionKey): D | undefined {
      requested.push(requestedKey);
      return known.get(`${requestedKey.scope}:${requestedKey.name}`) as D | undefined;
    },
  };

  /** The scope of every save, in order, and the units and movements saved. */
  const saves: string[] = [];
  const savedUnits: UnitObject[] = [];
  const savedMovements: MovementObject[] = [];
  const unexpected = (what: string): never => {
    throw new Error(`unexpected ${what}`);
  };
  const isHeld = ({ id, gameId, unitId }: UnitReferenceId) => id === held.identifier.id && gameId === held.identifier.gameId && unitId === held.identifier.unitId;
  const objectService: ObjectService = {
    loadAll<O extends BaseObject<Id>>(scope: string) {
      const objects = scope === "unit" ? units : unexpected(`loadAll in the scope "${scope}"`);
      return new Map(objects.map((object) => [object.identifier, object])) as unknown as Map<O["identifier"], O>;
    },
    load<O extends BaseObject<Id>>(scope: string, identifier: O["identifier"]) {
      if (scope !== "movement") {
        unexpected(`load in the scope "${scope}"`);
      }
      return (isHeld(identifier as UnitReferenceId) ? structuredClone(held) : undefined) as O | undefined;
    },
    delete: () => unexpected("delete"),
    save<O extends BaseObject<Id>>(scope: string, object: O) {
      saves.push(scope);
      if (scope === "movement") {
        held = object as unknown as MovementObject;
        savedMovements.push(held);
      } else if (scope === "unit") {
        savedUnits.push(object as unknown as UnitObject);
      } else {
        unexpected(`save in the scope "${scope}"`);
      }
      return object.identifier;
    },
  };

  return { service: new MoveActionService(definitionService, objectService), requested, saves, savedUnits, savedMovements };
}

const game = (id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn: 0, mapDefinition: key("map", "m1") });

type UnitOptions = { x?: number; y?: number; gameId?: string };

const unit = ({ x = 0, y = 0, gameId = "g1" }: UnitOptions = {}): UnitObject => ({
  identifier: { id: "mover", gameId },
  definition: key("unit", "infantry"),
  position: { x, y },
  playerId: "p1",
  health: 80,
  movementId: "walk",
  offenseIds: ["gun"],
  transportIds: [],
  moved: false,
  acted: false,
});

/** Another unit than the mover, of `playerId`, at (`x`, `y`). */
const other = (id: string, playerId: string, x: number, y: number, gameId = "g1"): UnitObject => ({
  ...unit({ x, y, gameId }),
  identifier: { id, gameId },
  playerId,
});

const terrain = (name: string, x: number, y: number, gameId = "g1"): TerrainObject => ({
  identifier: { id: `${name}-${x}-${y}`, gameId },
  definition: key("terrain", name),
  position: { x, y },
  health: 20,
  playerId: undefined,
});

const move = (who: UnitObject, to: TerrainObject, gameId = "g1"): MoveActionInput => ({
  definition: key("action", "move"),
  game: game(gameId),
  unit: who,
  target: to,
});

describe("MOVE_ACTION", () => {
  it("is the action named move", () => {
    expect(MOVE_ACTION).toEqual({ scope: "action", name: "move" });
  });
});

describe("MoveActionService", () => {
  describe("plan", () => {
    it("is true for an adjacent terrain that costs no more than the fuel", () => {
      expect(createWorld().service.plan(move(unit(), terrain("plain", 1, 0)))).toBeDefined();
    });

    it("is false when the unit has already moved", () => {
      expect(createWorld().service.plan(move({ ...unit(), moved: true }, terrain("plain", 1, 0)))).toBeUndefined();
    });

    it("is false when the unit has already acted, even though it has not moved", () => {
      expect(createWorld().service.plan(move({ ...unit(), acted: true }, terrain("plain", 1, 0)))).toBeUndefined();
    });

    describe("adjacency", () => {
      it.each([[6, 5], [4, 5], [5, 6], [5, 4]])("is true for the terrain at (%i, %i), next to (5, 5)", (x, y) => {
        expect(createWorld().service.plan(move(unit({ x: 5, y: 5 }), terrain("plain", x, y)))).toBeDefined();
      });

      it.each([[5, 5], [7, 5], [5, 7], [6, 6], [4, 4], [0, 0]])("is false for the terrain at (%i, %i), which is not next to (5, 5)", (x, y) => {
        expect(createWorld().service.plan(move(unit({ x: 5, y: 5 }), terrain("plain", x, y)))).toBeUndefined();
      });
    });

    describe("the cost", () => {
      it("is refused for a terrain the movement has no entry for", () => {
        expect(createWorld([], movement({ walks: "tread" })).service.plan(move(unit(), terrain("mountain", 1, 0)))).toBeUndefined();
      });

      it("is accepted for a cost below zero, which adds fuel", () => {
        expect(createWorld([], movement({ walks: "refund" })).service.plan(move(unit(), terrain("plain", 1, 0)))).toBeDefined();
      });

      it("is accepted for a terrain that costs nothing, even with no fuel", () => {
        expect(createWorld([], movement({ walks: "free", fuel: 0 })).service.plan(move(unit(), terrain("plain", 1, 0)))).toBeDefined();
      });
    });

    describe("the fuel", () => {
      it.each([[2, true], [3, true], [60, true], [1, false], [0, false]])("with %i fuel, a terrain that costs 2 is %s", (fuel, allowed) => {
        expect(createWorld([], movement({ fuel })).service.plan(move(unit(), terrain("woods", 1, 0))) !== undefined).toBe(allowed);
      });
    });

    describe("the game", () => {
      it("is false when the unit is in another game", () => {
        expect(createWorld().service.plan(move(unit({ gameId: "g2" }), terrain("plain", 1, 0)))).toBeUndefined();
      });

      it("is false when the terrain is in another game", () => {
        expect(createWorld().service.plan(move(unit(), terrain("plain", 1, 0, "g2")))).toBeUndefined();
      });

      it("is false when the action is for another game than both are in", () => {
        expect(createWorld().service.plan(move(unit(), terrain("plain", 1, 0), "g2"))).toBeUndefined();
      });
    });

    describe("the units there are", () => {
      it("is false when an enemy is on the terrain", () => {
        expect(createWorld([other("enemy", "p2", 1, 0)]).service.plan(move(unit(), terrain("plain", 1, 0)))).toBeUndefined();
      });

      it.each([
        ["an ally is on the terrain", () => other("ally", "p1", 1, 0)],
        ["an enemy is on the same square of another game", () => other("elsewhere", "p2", 1, 0, "g2")],
      ])("is true when %s", (_name, build) => {
        expect(createWorld([build()]).service.plan(move(unit(), terrain("plain", 1, 0)))).toBeDefined();
      });

      it("is false when the unit is loaded in a carrier, even though it has neither moved nor acted", () => {
        const carrier = { ...other("carrier", "p1", 0, 0), transportIds: ["mover"] };
        expect(createWorld([carrier]).service.plan(move(unit(), terrain("plain", 1, 0)))).toBeUndefined();
      });

      it("is true when only a carrier of another game holds a unit with the unit's id", () => {
        const carrier = { ...other("carrier", "p1", 0, 0, "g2"), transportIds: ["mover"] };
        expect(createWorld([carrier]).service.plan(move(unit(), terrain("plain", 1, 0)))).toBeDefined();
      });
    });

    describe("the movement", () => {
      it("is false for a unit whose movement is not held", () => {
        expect(createWorld().service.plan(move({ ...unit(), movementId: "nowhere" }, terrain("plain", 1, 0)))).toBeUndefined();
      });

      it("is false for a movement whose definition is not known", () => {
        expect(createWorld([], movement({ walks: "nowhere" })).service.plan(move(unit(), terrain("plain", 1, 0)))).toBeUndefined();
      });
    });

    describe("lookups", () => {
      it("asks for the definition of the movement alone: the move range of the unit is left to the multi-move service", () => {
        const { service, requested } = createWorld();
        service.plan(move(unit(), terrain("plain", 1, 0)));
        expect(requested).toEqual([key("movement", "foot")]);
      });

      it("does not ask for the definition of the unit on the terrain", () => {
        const { service, requested } = createWorld([other("ally", "p1", 1, 0)]);
        service.plan(move(unit(), terrain("plain", 1, 0)));
        expect(requested).toEqual([key("movement", "foot")]);
      });

      it("asks for nothing when the game is not the one of the unit and the terrain", () => {
        const { service, requested } = createWorld();
        service.plan(move(unit({ gameId: "g2" }), terrain("plain", 1, 0)));
        expect(requested).toEqual([]);
      });

      it("does not ask for the definition of a movement it does not hold", () => {
        const { service, requested } = createWorld();
        service.plan(move({ ...unit(), movementId: "nowhere" }, terrain("plain", 1, 0)));
        expect(requested).toEqual([]);
      });
    });

    it("changes nothing and saves nothing", () => {
      const { service, saves } = createWorld();
      const actionInput = move(unit(), terrain("plain", 1, 0));
      const before = structuredClone(actionInput);
      service.plan(actionInput);
      expect(actionInput).toEqual(before);
      expect(saves).toEqual([]);
    });

    it("holds the movement of the unit", () => {
      expect(createWorld().service.plan(move(unit(), terrain("plain", 1, 0)))?.movement).toEqual(movement());
    });

    it("holds the unit on the terrain: not the units elsewhere, nor the units of another game", () => {
      const ally = other("ally", "p1", 1, 0);
      const { service } = createWorld([other("enemy", "p2", 4, 4), other("elsewhere", "p2", 1, 0, "g2"), ally]);
      expect(service.plan(move(unit(), terrain("plain", 1, 0)))?.other).toEqual(ally);
    });

    it("holds no unit for an empty terrain, even when the unit itself is held on it", () => {
      const { service } = createWorld([unit({ x: 1, y: 0 })]);
      expect(service.plan(move(unit(), terrain("plain", 1, 0)))).toHaveProperty("other", undefined);
    });

    it("holds the carrier on the terrain, not a unit it holds there", () => {
      const carrier = { ...other("carrier", "p1", 1, 0), transportIds: ["rider"] };
      const { service } = createWorld([other("rider", "p1", 1, 0), carrier]);
      expect(service.plan(move(unit(), terrain("plain", 1, 0)))?.other).toEqual(carrier);
    });

    it("holds no unit for a terrain where only the units the unit carries are held, directly or through a carrier it carries", () => {
      const mover = { ...unit(), transportIds: ["apc"] };
      const { service } = createWorld([{ ...mover, position: { x: 1, y: 0 } }, { ...other("apc", "p1", 1, 0), transportIds: ["rider"] }, other("rider", "p1", 1, 0)]);
      expect(service.plan(move(mover, terrain("plain", 1, 0)))).toHaveProperty("other", undefined);
    });
  });

  describe("preview", () => {
    it("gives the result of the move: the unit on the terrain's position, its movement with the cost taken off its fuel, and no interruption", () => {
      const result = createWorld().service.preview(createWorld().service.plan(move(unit(), terrain("plain", 1, 0)))!);
      expect(result).toEqual({ unit: { ...unit(), position: { x: 1, y: 0 } }, movement: movement({ fuel: 9 }), interrupted: false });
    });

    it.each([["plain", 1], ["woods", 2], ["mountain", 3]])("takes the cost of the %s, %i, off the fuel", (name, cost) => {
      expect(createWorld().service.preview(createWorld().service.plan(move(unit(), terrain(name, 0, 1)))!).movement.fuel).toBe(10 - cost);
    });

    it("keeps the unit where it is, with its fuel, and is interrupted, when the plan holds an enemy on the terrain", () => {
      const { service } = createWorld();
      const plan = { ...service.plan(move(unit(), terrain("plain", 1, 0)))!, other: other("enemy", "p2", 1, 0) };
      expect(service.preview(plan)).toEqual({ unit: unit(), movement: movement(), interrupted: true });
    });

    it.each([
      ["an ally is on the terrain", () => other("ally", "p1", 1, 0)],
      ["an enemy is on the same square of another game", () => other("elsewhere", "p2", 1, 0, "g2")],
    ])("moves the unit onto the terrain when %s", (_name, build) => {
      const { service } = createWorld([build()]);
      expect(service.preview(service.plan(move(unit(), terrain("plain", 1, 0)))!).unit.position).toEqual({ x: 1, y: 0 });
    });

    it("saves nothing", () => {
      const { service, saves } = createWorld();
      service.preview(service.plan(move(unit(), terrain("plain", 1, 0)))!);
      expect(saves).toEqual([]);
    });

    it("gives the same result every time, since nothing is spent", () => {
      const { service } = createWorld([], movement({ fuel: 1 }));
      const actionInput = move(unit(), terrain("plain", 1, 0));
      const first = service.preview(service.plan(actionInput)!);
      expect(service.preview(service.plan(actionInput)!)).toEqual(first);
      expect(service.plan(actionInput)).toBeDefined();
    });

    it("does not change the action it was given", () => {
      const { service } = createWorld();
      const actionInput = move(unit(), terrain("plain", 1, 0));
      const before = structuredClone(actionInput);
      service.preview(service.plan(actionInput)!);
      expect(actionInput).toEqual(before);
    });

    it.each([
      ["the terrain is not next to the unit", movement(), () => move(unit(), terrain("plain", 2, 0))],
      ["the unit has already moved", movement(), () => move({ ...unit(), moved: true }, terrain("plain", 1, 0))],
      ["it costs more than the unit has fuel", movement({ fuel: 1 }), () => move(unit(), terrain("woods", 1, 0))],
      ["the movement cannot enter the terrain", movement({ walks: "tread" }), () => move(unit(), terrain("mountain", 1, 0))],
      ["the unit is in another game", movement(), () => move(unit({ gameId: "g2" }), terrain("plain", 1, 0))],
      ["the unit's movement is not held", movement(), () => move({ ...unit(), movementId: "nowhere" }, terrain("plain", 1, 0))],
    ])("gives nothing when %s", (_reason, held, build) => {
      const { service, saves } = createWorld([], held);
      const actionInput = build();
      expect(service.plan(actionInput)).toBeUndefined();
      expect(saves).toEqual([]);
    });
  });

  describe("execute", () => {
    it("gives the output of the move", () => {
      const output = createWorld().service.execute(createWorld().service.plan(move(unit(), terrain("plain", 1, 0)))!);
      expect(output).toEqual({ definition: key("action", "move"), unit: { ...unit(), position: { x: 1, y: 0 } }, movement: movement({ fuel: 9 }), interrupted: false });
    });

    it("gives what committing the preview gives", () => {
      const actionInput = () => move(unit({ x: 2, y: 3 }), terrain("woods", 3, 3));
      const held = movement({ walks: "tread", fuel: 7 });
      const { service } = createWorld([], held);
      expect(createWorld([], held).service.execute(createWorld([], held).service.plan(actionInput())!)).toEqual(service.commit(service.preview(service.plan(actionInput())!)));
    });

    it("saves the movement with the cost taken off its fuel, then the unit on the terrain's position", () => {
      const { service, saves, savedUnits, savedMovements } = createWorld();
      service.execute(service.plan(move(unit(), terrain("woods", 1, 0)))!);
      expect(saves).toEqual(["movement", "unit"]);
      expect(savedMovements).toHaveLength(1);
      expect(savedMovements[0].identifier).toEqual({ id: "walk", gameId: "g1", unitId: "mover" });
      expect(savedMovements[0].fuel).toBe(8); // the woods cost 2
      expect(savedUnits).toHaveLength(1);
      expect(savedUnits[0].identifier).toEqual({ id: "mover", gameId: "g1" });
      expect(savedUnits[0].position).toEqual({ x: 1, y: 0 });
    });

    it.each([["plain", 9], ["woods", 8], ["mountain", 7]])("takes the cost of the %s off the fuel: 10 fuel leaves %i", (name, left) => {
      const { service, savedMovements } = createWorld();
      service.execute(service.plan(move(unit(), terrain(name, 0, 1)))!);
      expect(savedMovements[0].fuel).toBe(left);
    });

    it("leaves marking the unit as moved to the multi-move service", () => {
      const { service, savedUnits } = createWorld();
      service.execute(service.plan(move(unit(), terrain("plain", 1, 0)))!);
      expect(savedUnits.map((saved) => saved.moved)).toEqual([false]);
    });

    it("leaves the rest of the unit and its movement as they were", () => {
      const { service, savedUnits, savedMovements } = createWorld();
      const mover = unit();
      service.execute(service.plan(move(mover, terrain("plain", 1, 0)))!);
      expect(savedUnits[0]).toEqual({ ...mover, position: { x: 1, y: 0 } });
      expect(savedMovements[0]).toEqual({ ...movement(), fuel: 9 });
    });

    it("can use all the fuel there is", () => {
      const { service, savedMovements } = createWorld([], movement({ fuel: 2 }));
      service.execute(service.plan(move(unit(), terrain("woods", 1, 0)))!);
      expect(savedMovements[0].fuel).toBe(0);
    });

    it("gives the unit its own position, not the terrain's", () => {
      const { service, savedUnits } = createWorld();
      const next = terrain("plain", 1, 0);
      service.execute(service.plan(move(unit(), next))!);
      expect(savedUnits[0].position).not.toBe(next.position);
      savedUnits[0].position.x = 99;
      expect(next.position).toEqual({ x: 1, y: 0 });
    });

    it("saves nothing else: not the terrain", () => {
      const { service, saves } = createWorld();
      service.execute(service.plan(move(unit(), terrain("plain", 1, 0)))!);
      expect(saves).toEqual(["movement", "unit"]);
    });

    it("does not change the action it was given", () => {
      const { service } = createWorld();
      const actionInput = move(unit(), terrain("plain", 1, 0));
      const before = structuredClone(actionInput);
      service.execute(service.plan(actionInput)!);
      expect(actionInput).toEqual(before);
    });

    it("lets the unit go on from where it got to, with the fuel it has left", () => {
      const { service, savedUnits, savedMovements } = createWorld([], movement({ fuel: 3 }));
      service.execute(service.plan(move(unit(), terrain("woods", 1, 0)))!);
      expect(savedMovements[0].fuel).toBe(1);

      service.execute(service.plan(move(savedUnits[0], terrain("plain", 2, 0)))!);
      expect(savedUnits[1].position).toEqual({ x: 2, y: 0 });
      expect(savedMovements[1].fuel).toBe(0);

      const third = move(savedUnits[1], terrain("plain", 3, 0));
      expect(service.plan(third)).toBeUndefined();
    });

    it("cannot go back to where it came from when the fuel is spent", () => {
      const { service, savedUnits } = createWorld([], movement({ fuel: 1 }));
      service.execute(service.plan(move(unit(), terrain("plain", 1, 0)))!);
      expect(service.plan(move(savedUnits[0], terrain("plain", 0, 0)))).toBeUndefined();
    });

    it.each([
      ["the terrain is not next to the unit", movement(), () => move(unit(), terrain("plain", 2, 0))],
      ["the unit has already moved", movement(), () => move({ ...unit(), moved: true }, terrain("plain", 1, 0))],
      ["it costs more than the unit has fuel", movement({ fuel: 1 }), () => move(unit(), terrain("woods", 1, 0))],
      ["the movement cannot enter the terrain", movement({ walks: "tread" }), () => move(unit(), terrain("mountain", 1, 0))],
      ["the terrain is in another game", movement(), () => move(unit(), terrain("plain", 1, 0, "g2"))],
      ["the unit's movement is not defined", movement({ walks: "nowhere" }), () => move(unit(), terrain("plain", 1, 0))],
    ])("gives nothing and saves nothing when %s", (_reason, held, build) => {
      const { service, saves } = createWorld([], held);
      const actionInput = build();
      expect(service.plan(actionInput)).toBeUndefined();
      expect(saves).toEqual([]);
    });
  });
});
