import type {
  BaseObject,
  Definition,
  DefinitionKey,
  DefinitionService,
  GameObject,
  Id,
  MoveActionInput,
  MovementDefinition,
  ObjectService,
  TerrainObject,
  UnitDefinition,
  UnitObject,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { MOVE_ACTION, MoveActionService } from "../move";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

const movement = (name: string, costs: Record<string, number>): MovementDefinition => ({
  definition: key("movement", name),
  cost: Object.entries(costs).map(([terrain, cost]) => ({ terrain: key("terrain", terrain), cost })),
});

const kind = (name: string, moveMax: number, walks: string): UnitDefinition => ({
  definition: key("unit", name),
  fundsCost: 1000,
  visionMax: 2,
  fuelMax: 99,
  moveMax,
  movement: key("movement", walks),
  offenses: [],
});

const definitions: Definition[] = [
  movement("foot", { plain: 1, woods: 2, mountain: 3 }),
  movement("tread", { plain: 1, woods: 3 }), // cannot enter a mountain
  movement("free", { plain: 0 }),
  movement("refund", { plain: -1 }),
  kind("infantry", 3, "foot"),
  kind("crawler", 2, "foot"), // a mountain costs 3, more than it can move
  kind("tank", 6, "tread"),
  kind("glider", 1, "free"),
  kind("leaky", 5, "refund"),
  kind("lost", 5, "nowhere"), // its movement is not defined
];

/** A definition service that knows `definitions` and remembers what it was asked for, and an object service that remembers saves. */
function createWorld() {
  const known = new Map(definitions.map((definition) => [`${definition.definition.scope}:${definition.definition.name}`, definition]));
  const requested: DefinitionKey[] = [];
  const definitionService: DefinitionService = {
    get<D extends Definition>(requestedKey: DefinitionKey): D | undefined {
      requested.push(requestedKey);
      return known.get(`${requestedKey.scope}:${requestedKey.name}`) as D | undefined;
    },
  };

  /** The scope of every save, in order, and the units saved. */
  const saves: string[] = [];
  const savedUnits: UnitObject[] = [];
  const unexpected = (what: string): never => {
    throw new Error(`unexpected ${what}`);
  };
  const objectService: ObjectService = {
    loadAll: () => unexpected("loadAll"),
    load: () => unexpected("load"),
    delete: () => unexpected("delete"),
    save<O extends BaseObject<Id>>(scope: string, object: O) {
      saves.push(scope);
      if (scope !== "unit") {
        unexpected(`save in the scope "${scope}"`);
      }
      savedUnits.push(object as unknown as UnitObject);
      return object.identifier;
    },
  };

  return { service: new MoveActionService(definitionService, objectService), requested, saves, savedUnits };
}

const game = (id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn: 0, mapDefinition: key("map", "m1") });

type UnitOptions = { fuel?: number; x?: number; y?: number; gameId?: string };

const unit = (definition: string, { fuel = 10, x = 0, y = 0, gameId = "g1" }: UnitOptions = {}): UnitObject => ({
  identifier: { id: "mover", gameId },
  definition: key("unit", definition),
  position: { x, y },
  playerId: "p1",
  health: 80,
  offenseIds: ["gun"],
  moved: false,
  acted: false,
  fuel,
});

const terrain = (name: string, x: number, y: number, gameId = "g1"): TerrainObject => ({
  identifier: { id: `${name}-${x}-${y}`, gameId },
  definition: key("terrain", name),
  position: { x, y },
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
  describe("canExecute", () => {
    it("is true for an adjacent terrain that costs no more than the move range and the fuel", () => {
      expect(createWorld().service.canExecute(move(unit("infantry"), terrain("plain", 1, 0)))).toBe(true);
    });

    describe("adjacency", () => {
      it.each([[6, 5], [4, 5], [5, 6], [5, 4]])("is true for the terrain at (%i, %i), next to (5, 5)", (x, y) => {
        expect(createWorld().service.canExecute(move(unit("infantry", { x: 5, y: 5 }), terrain("plain", x, y)))).toBe(true);
      });

      it.each([[5, 5], [7, 5], [5, 7], [6, 6], [4, 4], [0, 0]])("is false for the terrain at (%i, %i), which is not next to (5, 5)", (x, y) => {
        expect(createWorld().service.canExecute(move(unit("infantry", { x: 5, y: 5 }), terrain("plain", x, y)))).toBe(false);
      });
    });

    describe("the cost", () => {
      it("is accepted when it equals the move range", () => {
        // a crawler can move 2, and the woods cost 2
        expect(createWorld().service.canExecute(move(unit("crawler"), terrain("woods", 1, 0)))).toBe(true);
      });

      it("is refused when it is more than the move range", () => {
        // a mountain costs 3
        expect(createWorld().service.canExecute(move(unit("crawler"), terrain("mountain", 1, 0)))).toBe(false);
      });

      it("is refused for a terrain the movement has no entry for", () => {
        expect(createWorld().service.canExecute(move(unit("tank"), terrain("mountain", 1, 0)))).toBe(false);
      });

      it("is refused for a cost below zero, which would add fuel", () => {
        expect(createWorld().service.canExecute(move(unit("leaky"), terrain("plain", 1, 0)))).toBe(false);
      });

      it("is accepted for a terrain that costs nothing, even with no fuel", () => {
        expect(createWorld().service.canExecute(move(unit("glider", { fuel: 0 }), terrain("plain", 1, 0)))).toBe(true);
      });
    });

    describe("the fuel", () => {
      it.each([[2, true], [3, true], [60, true], [1, false], [0, false]])("with %i fuel, a terrain that costs 2 is %s", (fuel, allowed) => {
        expect(createWorld().service.canExecute(move(unit("infantry", { fuel }), terrain("woods", 1, 0)))).toBe(allowed);
      });
    });

    describe("the game", () => {
      it("is false when the unit is in another game", () => {
        expect(createWorld().service.canExecute(move(unit("infantry", { gameId: "g2" }), terrain("plain", 1, 0)))).toBe(false);
      });

      it("is false when the terrain is in another game", () => {
        expect(createWorld().service.canExecute(move(unit("infantry"), terrain("plain", 1, 0, "g2")))).toBe(false);
      });

      it("is false when the action is for another game than both are in", () => {
        expect(createWorld().service.canExecute(move(unit("infantry"), terrain("plain", 1, 0), "g2"))).toBe(false);
      });
    });

    describe("definitions", () => {
      it("is false for a unit whose definition is not known", () => {
        expect(createWorld().service.canExecute(move(unit("ghost"), terrain("plain", 1, 0)))).toBe(false);
      });

      it("is false for a unit whose movement is not defined", () => {
        expect(createWorld().service.canExecute(move(unit("lost"), terrain("plain", 1, 0)))).toBe(false);
      });
    });

    describe("lookups", () => {
      it("asks for the definition of the unit, then for its movement", () => {
        const { service, requested } = createWorld();
        service.canExecute(move(unit("infantry"), terrain("plain", 1, 0)));
        expect(requested).toEqual([key("unit", "infantry"), key("movement", "foot")]);
      });

      it("asks for nothing when the game is not the one of the unit and the terrain", () => {
        const { service, requested } = createWorld();
        service.canExecute(move(unit("infantry", { gameId: "g2" }), terrain("plain", 1, 0)));
        expect(requested).toEqual([]);
      });

      it("does not ask for the movement of a unit it does not know", () => {
        const { service, requested } = createWorld();
        service.canExecute(move(unit("ghost"), terrain("plain", 1, 0)));
        expect(requested).toEqual([key("unit", "ghost")]);
      });
    });

    it("changes nothing and saves nothing", () => {
      const { service, saves } = createWorld();
      const actionInput = move(unit("infantry"), terrain("plain", 1, 0));
      const before = structuredClone(actionInput);
      service.canExecute(actionInput);
      expect(actionInput).toEqual(before);
      expect(saves).toEqual([]);
    });
  });

  describe("preview", () => {
    it("gives the output of the move", () => {
      const output = createWorld().service.preview(move(unit("infantry"), terrain("plain", 1, 0)));
      expect(output).toEqual({ definition: key("action", "move"), cost: 1, terrainId: "plain-1-0" });
    });

    it.each([["plain", 1], ["woods", 2], ["mountain", 3]])("gives the cost of the %s, %i", (name, cost) => {
      expect(createWorld().service.preview(move(unit("infantry"), terrain(name, 0, 1)))?.cost).toBe(cost);
    });

    it("saves nothing", () => {
      const { service, saves } = createWorld();
      service.preview(move(unit("infantry"), terrain("plain", 1, 0)));
      expect(saves).toEqual([]);
    });

    it("gives the same output every time, since nothing is spent", () => {
      const { service } = createWorld();
      const actionInput = move(unit("infantry", { fuel: 1 }), terrain("plain", 1, 0));
      const first = service.preview(actionInput);
      expect(service.preview(actionInput)).toEqual(first);
      expect(service.canExecute(actionInput)).toBe(true);
    });

    it("does not change the action it was given", () => {
      const { service } = createWorld();
      const actionInput = move(unit("infantry"), terrain("plain", 1, 0));
      const before = structuredClone(actionInput);
      service.preview(actionInput);
      expect(actionInput).toEqual(before);
    });

    it.each([
      ["the terrain is not next to the unit", () => move(unit("infantry"), terrain("plain", 2, 0))],
      ["it costs more than the unit can move", () => move(unit("crawler"), terrain("mountain", 1, 0))],
      ["it costs more than the unit has fuel", () => move(unit("infantry", { fuel: 1 }), terrain("woods", 1, 0))],
      ["the movement cannot enter the terrain", () => move(unit("tank"), terrain("mountain", 1, 0))],
      ["the unit is in another game", () => move(unit("infantry", { gameId: "g2" }), terrain("plain", 1, 0))],
      ["the unit is not defined", () => move(unit("ghost"), terrain("plain", 1, 0))],
    ])("gives nothing when %s", (_reason, build) => {
      const { service, saves } = createWorld();
      const actionInput = build();
      expect(service.canExecute(actionInput)).toBe(false);
      expect(service.preview(actionInput)).toBeUndefined();
      expect(saves).toEqual([]);
    });
  });

  describe("execute", () => {
    it("gives the output of the move", () => {
      const output = createWorld().service.execute(move(unit("infantry"), terrain("plain", 1, 0)));
      expect(output).toEqual({ definition: key("action", "move"), cost: 1, terrainId: "plain-1-0" });
    });

    it("gives what preview gives", () => {
      const actionInput = () => move(unit("tank", { fuel: 7, x: 2, y: 3 }), terrain("woods", 3, 3));
      expect(createWorld().service.execute(actionInput())).toEqual(createWorld().service.preview(actionInput()));
    });

    it("saves the unit on the terrain's position, with the cost taken off its fuel", () => {
      const { service, saves, savedUnits } = createWorld();
      service.execute(move(unit("infantry", { fuel: 10 }), terrain("woods", 1, 0)));
      expect(saves).toEqual(["unit"]);
      expect(savedUnits).toHaveLength(1);
      expect(savedUnits[0].identifier).toEqual({ id: "mover", gameId: "g1" });
      expect(savedUnits[0].position).toEqual({ x: 1, y: 0 });
      expect(savedUnits[0].fuel).toBe(8); // the woods cost 2
    });

    it.each([["plain", 9], ["woods", 8], ["mountain", 7]])("takes the cost of the %s off the fuel: 10 fuel leaves %i", (name, left) => {
      const { service, savedUnits } = createWorld();
      service.execute(move(unit("infantry", { fuel: 10 }), terrain(name, 0, 1)));
      expect(savedUnits[0].fuel).toBe(left);
    });

    it("leaves whether the unit has moved to the multi-move service", () => {
      const { service, savedUnits } = createWorld();
      service.execute(move(unit("infantry"), terrain("plain", 1, 0)));
      service.execute(move({ ...unit("infantry"), moved: true }, terrain("plain", 1, 0)));
      expect(savedUnits.map((saved) => saved.moved)).toEqual([false, true]);
    });

    it("leaves the rest of the unit as it was", () => {
      const { service, savedUnits } = createWorld();
      const mover = unit("infantry");
      service.execute(move(mover, terrain("plain", 1, 0)));
      expect(savedUnits[0]).toEqual({ ...mover, position: { x: 1, y: 0 }, fuel: 9 });
    });

    it("can use all the fuel there is", () => {
      const { service, savedUnits } = createWorld();
      service.execute(move(unit("infantry", { fuel: 2 }), terrain("woods", 1, 0)));
      expect(savedUnits[0].fuel).toBe(0);
    });

    it("gives the unit its own position, not the terrain's", () => {
      const { service, savedUnits } = createWorld();
      const next = terrain("plain", 1, 0);
      service.execute(move(unit("infantry"), next));
      expect(savedUnits[0].position).not.toBe(next.position);
      savedUnits[0].position.x = 99;
      expect(next.position).toEqual({ x: 1, y: 0 });
    });

    it("saves nothing else: not the terrain", () => {
      const { service, savedUnits } = createWorld();
      service.execute(move(unit("infantry"), terrain("plain", 1, 0)));
      expect(savedUnits.map((saved) => saved.identifier.id)).toEqual(["mover"]);
    });

    it("does not change the action it was given", () => {
      const { service } = createWorld();
      const actionInput = move(unit("infantry"), terrain("plain", 1, 0));
      const before = structuredClone(actionInput);
      service.execute(actionInput);
      expect(actionInput).toEqual(before);
    });

    it("lets the unit go on from where it got to, with the fuel it has left", () => {
      const { service, savedUnits } = createWorld();
      service.execute(move(unit("infantry", { fuel: 3 }), terrain("woods", 1, 0)));
      expect(savedUnits[0].fuel).toBe(1);

      service.execute(move(savedUnits[0], terrain("plain", 2, 0)));
      expect(savedUnits[1].position).toEqual({ x: 2, y: 0 });
      expect(savedUnits[1].fuel).toBe(0);

      const third = move(savedUnits[1], terrain("plain", 3, 0));
      expect(service.canExecute(third)).toBe(false);
    });

    it("cannot go back to where it came from when the fuel is spent", () => {
      const { service, savedUnits } = createWorld();
      service.execute(move(unit("infantry", { fuel: 1 }), terrain("plain", 1, 0)));
      expect(service.canExecute(move(savedUnits[0], terrain("plain", 0, 0)))).toBe(false);
    });

    it.each([
      ["the terrain is not next to the unit", () => move(unit("infantry"), terrain("plain", 2, 0))],
      ["it costs more than the unit can move", () => move(unit("crawler"), terrain("mountain", 1, 0))],
      ["it costs more than the unit has fuel", () => move(unit("infantry", { fuel: 1 }), terrain("woods", 1, 0))],
      ["the movement cannot enter the terrain", () => move(unit("tank"), terrain("mountain", 1, 0))],
      ["the terrain is in another game", () => move(unit("infantry"), terrain("plain", 1, 0, "g2"))],
      ["the unit's movement is not defined", () => move(unit("lost"), terrain("plain", 1, 0))],
    ])("gives nothing and saves nothing when %s", (_reason, build) => {
      const { service, saves } = createWorld();
      const actionInput = build();
      expect(service.canExecute(actionInput)).toBe(false);
      expect(service.execute(actionInput)).toBeUndefined();
      expect(saves).toEqual([]);
    });
  });
});
