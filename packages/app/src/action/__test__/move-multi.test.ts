import type {
  BaseObject,
  Definition,
  DefinitionKey,
  DefinitionService,
  GameObject,
  Id,
  MovementDefinition,
  MultiMoveActionInput,
  ObjectService,
  TerrainObject,
  UnitDefinition,
  UnitObject,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { MOVE_ACTION, MoveActionService } from "../move";
import { MultiMoveActionService } from "../move-multi";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

const foot: MovementDefinition = {
  definition: key("movement", "foot"),
  cost: [{ terrain: key("terrain", "plain"), cost: 1 }, { terrain: key("terrain", "woods"), cost: 2 }],
};

const infantry: UnitDefinition = {
  definition: key("unit", "infantry"),
  fundsCost: 1000,
  visionMax: 2,
  fuelMax: 99,
  moveMax: 3,
  movement: key("movement", "foot"),
  offenses: [],
};

const definitions: Definition[] = [foot, infantry];

const terrain = (name: string, x: number, y = 0, gameId = "g1"): TerrainObject => ({
  identifier: { id: `${name}-${x}-${y}`, gameId },
  definition: key("terrain", name),
  position: { x, y },
  playerId: undefined,
});

/** A row of terrain along y = 0, starting at x = 0. */
const row = (...names: string[]): TerrainObject[] => names.map((name, x) => terrain(name, x));

const plain = (x: number) => terrain("plain", x);

/**
 * A multi-move service on a real single-square move service, a definition service that knows `definitions`, and an
 * object service that holds `units` and `terrains` and remembers every unit saved, in order.
 */
function createWorld(units: UnitObject[] = [], terrains: TerrainObject[] = row("plain", "plain", "plain", "plain", "plain")) {
  const known = new Map(definitions.map((definition) => [`${definition.definition.scope}:${definition.definition.name}`, definition]));
  const definitionService: DefinitionService = {
    get<D extends Definition>(requestedKey: DefinitionKey): D | undefined {
      return known.get(`${requestedKey.scope}:${requestedKey.name}`) as D | undefined;
    },
  };

  const saves: string[] = [];
  const savedUnits: UnitObject[] = [];
  const unexpected = (what: string): never => {
    throw new Error(`unexpected ${what}`);
  };
  const objectService: ObjectService = {
    loadAll<O extends BaseObject<Id>>(scope: string) {
      const objects: BaseObject<Id>[] = scope === "unit" ? units : scope === "terrain" ? terrains : unexpected(`loadAll in the scope "${scope}"`);
      return new Map(objects.map((object) => [object.identifier, object])) as unknown as Map<O["identifier"], O>;
    },
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

  const moveService = new MoveActionService(definitionService, objectService);
  return { service: new MultiMoveActionService(moveService, definitionService, objectService), saves, savedUnits };
}

const game = (id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn: 0, mapDefinition: key("map", "m1") });

type UnitOptions = { x?: number; y?: number; fuel?: number; playerId?: string; gameId?: string; definition?: string };

const unit = (id: string, { x = 0, y = 0, fuel = 10, playerId = "p1", gameId = "g1", definition = "infantry" }: UnitOptions = {}): UnitObject => ({
  identifier: { id, gameId },
  definition: key("unit", definition),
  position: { x, y },
  playerId,
  health: 100,
  offenseIds: [],
  moved: false,
  acted: false,
  fuel,
});

const mover = (options: UnitOptions = {}) => unit("mover", options);
const enemy = (x: number, gameId = "g1") => unit("enemy", { x, playerId: "p2", gameId });
const ally = (x: number) => unit("ally", { x });

const multiMove = (who: UnitObject, path: TerrainObject[]): MultiMoveActionInput => ({
  definition: MOVE_ACTION,
  game: game(),
  unit: who,
  path,
});

/** The paths the multi-move service refuses, and why. */
const refused: [reason: string, build: () => { world: ReturnType<typeof createWorld>; actionInput: MultiMoveActionInput }][] = [
  ["the path is empty", () => ({ world: createWorld(), actionInput: multiMove(mover(), []) })],
  ["the unit has already moved", () => ({ world: createWorld(), actionInput: multiMove({ ...mover(), moved: true }, [plain(1)]) })],
  ["a square is not next to the one before it", () => ({ world: createWorld(), actionInput: multiMove(mover(), [plain(1), plain(3)]) })],
  ["the whole path costs more than the move range", () => ({ world: createWorld([], row("plain", "woods", "woods")), actionInput: multiMove(mover(), [terrain("woods", 1), terrain("woods", 2)]) })],
  ["the unit runs out of fuel partway", () => ({ world: createWorld(), actionInput: multiMove(mover({ fuel: 2 }), [plain(1), plain(2), plain(3)]) })],
  ["the unit is not defined", () => ({ world: createWorld(), actionInput: multiMove(mover({ definition: "ghost" }), [plain(1)]) })],
  ["no terrain is under the unit", () => ({ world: createWorld([], [plain(1)]), actionInput: multiMove(mover(), [plain(1)]) })],
];

describe("MultiMoveActionService", () => {
  describe("canExecute", () => {
    it("is true for a path of adjacent squares that fits the move range and the fuel", () => {
      expect(createWorld().service.canExecute(multiMove(mover(), [plain(1), plain(2), plain(3)]))).toBe(true);
    });

    it.each(refused)("is false when %s", (_reason, build) => {
      const { world, actionInput } = build();
      expect(world.service.canExecute(actionInput)).toBe(false);
    });

    it("is true when an enemy is on the path: an enemy interrupts the move, it does not refuse it", () => {
      expect(createWorld([enemy(2)]).service.canExecute(multiMove(mover(), [plain(1), plain(2)]))).toBe(true);
    });

    it("saves nothing", () => {
      const { service, saves } = createWorld();
      service.canExecute(multiMove(mover(), [plain(1), plain(2)]));
      expect(saves).toEqual([]);
    });
  });

  describe("preview", () => {
    it("gives the cost of the whole path and the square at its end", () => {
      const { service } = createWorld([], row("plain", "woods", "plain"));
      expect(service.preview(multiMove(mover(), [terrain("woods", 1), plain(2)]))).toEqual({ definition: MOVE_ACTION, cost: 3, terrainId: "plain-2-0" });
    });

    it("stops before an enemy on the path, giving the cost of the squares walked and the square it stopped on", () => {
      const { service } = createWorld([enemy(2)]);
      expect(service.preview(multiMove(mover(), [plain(1), plain(2), plain(3)]))).toEqual({ definition: MOVE_ACTION, cost: 1, terrainId: "plain-1-0" });
    });

    it("gives the unit's own square, at no cost, when an enemy is on the first square", () => {
      const { service } = createWorld([enemy(1)]);
      expect(service.preview(multiMove(mover(), [plain(1), plain(2)]))).toEqual({ definition: MOVE_ACTION, cost: 0, terrainId: "plain-0-0" });
    });

    it.each([
      ["an ally", () => ally(1)],
      ["an enemy in another game", () => enemy(1, "g2")],
    ])("passes through %s", (_name, build) => {
      const { service } = createWorld([build()]);
      expect(service.preview(multiMove(mover(), [plain(1), plain(2)]))?.terrainId).toBe("plain-2-0");
    });

    it("gives what execute gives", () => {
      const actionInput = () => multiMove(mover(), [plain(1), plain(2), plain(3)]);
      expect(createWorld([enemy(3)]).service.preview(actionInput())).toEqual(createWorld([enemy(3)]).service.execute(actionInput()));
    });

    it("saves nothing", () => {
      const { service, saves } = createWorld();
      service.preview(multiMove(mover(), [plain(1), plain(2)]));
      expect(saves).toEqual([]);
    });

    it.each(refused)("gives nothing when %s", (_reason, build) => {
      const { world, actionInput } = build();
      expect(world.service.preview(actionInput)).toBeUndefined();
      expect(world.saves).toEqual([]);
    });
  });

  describe("execute", () => {
    it("gives the cost of the whole path and the square at its end", () => {
      expect(createWorld().service.execute(multiMove(mover(), [plain(1), plain(2)]))).toEqual({ definition: MOVE_ACTION, cost: 2, terrainId: "plain-2-0" });
    });

    it("moves the unit one square at a time, then saves it once more as moved", () => {
      const { service, savedUnits } = createWorld();
      service.execute(multiMove(mover(), [plain(1), plain(2)]));
      expect(savedUnits.map(({ position, fuel, moved }) => [position, fuel, moved])).toEqual([
        [{ x: 1, y: 0 }, 9, false],
        [{ x: 2, y: 0 }, 8, false],
        [{ x: 2, y: 0 }, 8, true],
      ]);
    });

    it("leaves the rest of the unit as it was", () => {
      const { service, savedUnits } = createWorld();
      const start = mover();
      service.execute(multiMove(start, [plain(1), plain(2)]));
      expect(savedUnits.at(-1)).toEqual({ ...start, position: { x: 2, y: 0 }, fuel: 8, moved: true });
    });

    it("stops before an enemy on the path, and saves the unit where it stopped, as moved", () => {
      const { service, savedUnits } = createWorld([enemy(2)]);
      service.execute(multiMove(mover(), [plain(1), plain(2), plain(3)]));
      expect(savedUnits.map(({ identifier, position, fuel, moved }) => [identifier.id, position, fuel, moved])).toEqual([
        ["mover", { x: 1, y: 0 }, 9, false],
        ["mover", { x: 1, y: 0 }, 9, true],
      ]);
    });

    it("marks the unit as moved even when an enemy on the first square keeps it where it is", () => {
      const { service, savedUnits } = createWorld([enemy(1)]);
      const start = mover();
      service.execute(multiMove(start, [plain(1), plain(2)]));
      expect(savedUnits).toEqual([{ ...start, moved: true }]);
    });

    it("stops on an ally's square when an enemy is on the next one", () => {
      const { service, savedUnits } = createWorld([ally(1), enemy(2)]);
      service.execute(multiMove(mover(), [plain(1), plain(2)]));
      expect(savedUnits.at(-1)?.position).toEqual(ally(1).position);
    });

    it("cannot move the unit again once it has moved", () => {
      const { service, savedUnits } = createWorld();
      service.execute(multiMove(mover(), [plain(1)]));
      expect(service.canExecute(multiMove(savedUnits.at(-1)!, [plain(2)]))).toBe(false);
    });

    it("does not change the action it was given", () => {
      const { service } = createWorld();
      const actionInput = multiMove(mover(), [plain(1), plain(2)]);
      const before = structuredClone(actionInput);
      service.execute(actionInput);
      expect(actionInput).toEqual(before);
    });

    it.each(refused)("gives nothing and saves nothing when %s", (_reason, build) => {
      const { world, actionInput } = build();
      expect(world.service.execute(actionInput)).toBeUndefined();
      expect(world.saves).toEqual([]);
    });
  });
});
