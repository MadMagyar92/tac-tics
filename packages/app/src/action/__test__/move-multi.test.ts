import type {
  BaseObject,
  Definition,
  DefinitionKey,
  DefinitionService,
  GameObject,
  Id,
  MovementDefinition,
  MovementObject,
  MultiMoveActionInput,
  MultiMoveActionPlan,
  ObjectService,
  TerrainObject,
  TransportDefinition,
  UnitDefinition,
  UnitObject,
  UnitReferenceId,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { LoadActionService } from "../load";
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
  capture: undefined,
  transport: undefined,
};

/** A carrier of the kind `name`, which names the transport definition of its own name. */
const carrierDefinition = (name: string): UnitDefinition => ({ ...infantry, definition: key("unit", name), transport: key("transport", name) });

const transportDefinition = (name: string, maxUnits: number, allowed: string[]): TransportDefinition => ({
  definition: key("transport", name),
  maxUnits,
  allowed: allowed.map((unit) => ({ unit: key("unit", unit) })),
});

const definitions: Definition[] = [
  foot,
  infantry,
  carrierDefinition("apc"),
  carrierDefinition("lander"),
  transportDefinition("apc", 1, ["infantry"]),
  transportDefinition("lander", 2, ["infantry", "apc"]),
];

const terrain = (name: string, x: number, y = 0, gameId = "g1"): TerrainObject => ({
  identifier: { id: `${name}-${x}-${y}`, gameId },
  definition: key("terrain", name),
  position: { x, y },
  health: 20,
  playerId: undefined,
});

const plain = (x: number) => terrain("plain", x);

/** The movement of the mover, with `fuel`. */
const movement = (fuel = 10): MovementObject => ({
  identifier: { id: "walk", gameId: "g1", unitId: "mover" },
  definition: key("movement", "foot"),
  fuel,
});

/**
 * A multi-move service on a real single-square move service and load service, a definition service that knows `definitions`,
 * and an object service that holds `units`, which a saved unit joins or replaces, and the movement `held` of the mover.
 * It remembers every unit and movement saved, in order.
 */
function createWorld(units: UnitObject[] = [], held: MovementObject = movement()) {
  const known = new Map(definitions.map((definition) => [`${definition.definition.scope}:${definition.definition.name}`, definition]));
  const definitionService: DefinitionService = {
    get<D extends Definition>(requestedKey: DefinitionKey): D | undefined {
      return known.get(`${requestedKey.scope}:${requestedKey.name}`) as D | undefined;
    },
  };

  const stored = [...units];
  const saves: string[] = [];
  const savedUnits: UnitObject[] = [];
  const savedMovements: MovementObject[] = [];
  const unexpected = (what: string): never => {
    throw new Error(`unexpected ${what}`);
  };
  const isHeld = ({ id, gameId, unitId }: UnitReferenceId) => id === held.identifier.id && gameId === held.identifier.gameId && unitId === held.identifier.unitId;
  const objectService: ObjectService = {
    loadAll<O extends BaseObject<Id>>(scope: string) {
      const objects = scope === "unit" ? stored : unexpected(`loadAll in the scope "${scope}"`);
      return new Map(objects.map((object) => [object.identifier, structuredClone(object)])) as unknown as Map<O["identifier"], O>;
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
        const unit = object as unknown as UnitObject;
        savedUnits.push(unit);
        const index = stored.findIndex(({ identifier }) => identifier.id === unit.identifier.id && identifier.gameId === unit.identifier.gameId);
        stored.splice(index < 0 ? stored.length : index, 1, unit);
      } else {
        unexpected(`save in the scope "${scope}"`);
      }
      return object.identifier;
    },
  };

  const moveService = new MoveActionService(definitionService, objectService);
  const loadService = new LoadActionService(definitionService, objectService);
  return { service: new MultiMoveActionService(moveService, loadService, definitionService, objectService), saves, savedUnits, savedMovements };
}

const game = (id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn: 0, mapDefinition: key("map", "m1") });

type UnitOptions = { x?: number; y?: number; playerId?: string; gameId?: string; definition?: string; transportIds?: string[] };

const unit = (id: string, { x = 0, y = 0, playerId = "p1", gameId = "g1", definition = "infantry", transportIds = [] }: UnitOptions = {}): UnitObject => ({
  identifier: { id, gameId },
  definition: key("unit", definition),
  position: { x, y },
  playerId,
  health: 100,
  movementId: "walk",
  offenseIds: [],
  transportIds,
  moved: false,
  acted: false,
});

const mover = (options: UnitOptions = {}) => unit("mover", options);
const enemy = (x: number, gameId = "g1") => unit("enemy", { x, playerId: "p2", gameId });
const ally = (x: number) => unit("ally", { x });
/** A carrier of the kind `definition` at `x`, its id the name of its kind. */
const carrier = (definition: string, x: number, options: UnitOptions = {}) => unit(definition, { x, definition, ...options });
/** A unit the mover carries, left on its square at (0, 0). */
const rider = (id = "rider", options: UnitOptions = {}) => unit(id, options);

const multiMove = (who: UnitObject, targets: TerrainObject[]): MultiMoveActionInput => ({
  definition: MOVE_ACTION,
  game: game(),
  unit: who,
  targets,
});

/** The plan of `actionInput` in `world`, holding those of `units` on the squares of the path in place of the units there. */
const planWithOthers = ({ service }: ReturnType<typeof createWorld>, actionInput: MultiMoveActionInput, units: UnitObject[]): MultiMoveActionPlan => ({
  ...service.plan(actionInput)!,
  others: actionInput.targets.flatMap(({ identifier, position }) =>
    units.filter((unit) => unit.identifier.gameId === identifier.gameId && unit.position.x === position.x && unit.position.y === position.y),
  ),
});

/** The paths the multi-move service refuses, and why. */
const refused: [reason: string, build: () => { world: ReturnType<typeof createWorld>; actionInput: MultiMoveActionInput }][] = [
  ["the path is empty", () => ({ world: createWorld(), actionInput: multiMove(mover(), []) })],
  ["the unit has already moved", () => ({ world: createWorld(), actionInput: multiMove({ ...mover(), moved: true }, [plain(1)]) })],
  ["the unit has already acted", () => ({ world: createWorld(), actionInput: multiMove({ ...mover(), acted: true }, [plain(1)]) })],
  ["a square is not next to the one before it", () => ({ world: createWorld(), actionInput: multiMove(mover(), [plain(1), plain(3)]) })],
  ["the whole path costs more than the move range", () => ({ world: createWorld(), actionInput: multiMove(mover(), [terrain("woods", 1), terrain("woods", 2)]) })],
  ["an enemy is on the path", () => ({ world: createWorld([enemy(2)]), actionInput: multiMove(mover(), [plain(1), plain(2)]) })],
  ["the path ends on an ally that is not a carrier", () => ({ world: createWorld([ally(2)]), actionInput: multiMove(mover(), [plain(1), plain(2)]) })],
  ["the path ends on a carrier that cannot load the unit", () => ({ world: createWorld([carrier("apc", 2, { transportIds: ["rider"] })]), actionInput: multiMove(mover(), [plain(1), plain(2)]) })],
  ["the unit runs out of fuel partway", () => ({ world: createWorld([], movement(2)), actionInput: multiMove(mover(), [plain(1), plain(2), plain(3)]) })],
  ["the unit is not defined", () => ({ world: createWorld(), actionInput: multiMove(mover({ definition: "ghost" }), [plain(1)]) })],
  ["the unit's movement is not held", () => ({ world: createWorld(), actionInput: multiMove({ ...mover(), movementId: "nowhere" }, [plain(1)]) })],
];

describe("MultiMoveActionService", () => {
  describe("plan", () => {
    it("is true for a path of adjacent squares that fits the move range and the fuel", () => {
      expect(createWorld().service.plan(multiMove(mover(), [plain(1), plain(2), plain(3)]))).toBeDefined();
    });

    it.each(refused)("is false when %s", (_reason, build) => {
      const { world, actionInput } = build();
      expect(world.service.plan(actionInput)).toBeUndefined();
    });

    it.each([
      ["an ally", () => ally(1)],
      ["an enemy in another game", () => enemy(2, "g2")],
    ])("is true when %s is on the path", (_name, build) => {
      expect(createWorld([build()]).service.plan(multiMove(mover(), [plain(1), plain(2)]))).toBeDefined();
    });

    it("is true for a path that uses all the fuel there is", () => {
      expect(createWorld([], movement(3)).service.plan(multiMove(mover(), [plain(1), plain(2), plain(3)]))).toBeDefined();
    });

    it("holds the unit, the squares of the path, the movement of the unit, the units on the squares of the path alone, and the cost of each square", () => {
      const other = ally(1);
      const actionInput = multiMove(mover(), [plain(1), terrain("woods", 2)]);
      expect(createWorld([mover(), other, ally(4)]).service.plan(actionInput)).toEqual({
        definition: MOVE_ACTION,
        unit: mover(),
        targets: actionInput.targets,
        movement: movement(),
        others: [other],
        costs: [1, 2],
      });
    });

    it("holds no units for a path of empty squares", () => {
      expect(createWorld().service.plan(multiMove(mover(), [plain(1), plain(2)]))?.others).toEqual([]);
    });

    it("does not hold the unit itself on the square it started from", () => {
      expect(createWorld([mover()]).service.plan(multiMove(mover(), [plain(1), plain(0)]))?.others).toEqual([]);
    });

    it("saves nothing", () => {
      const { service, saves } = createWorld();
      service.plan(multiMove(mover(), [plain(1), plain(2)]));
      expect(saves).toEqual([]);
    });
  });

  describe("preview", () => {
    it("gives the unit at the end of the path, as moved, its movement with the cost of the whole path taken off its fuel, and no interruption", () => {
      const { service } = createWorld();
      expect(service.preview(service.plan(multiMove(mover(), [terrain("woods", 1), plain(2)]))!)).toEqual({
        unit: { ...mover(), position: { x: 2, y: 0 }, moved: true },
        movement: movement(7),
        interrupted: false,
        transport: undefined,
      });
    });

    it("stops before an enemy the plan holds on the path, giving the unit where it stopped, with the cost of the squares walked taken off its fuel, as interrupted", () => {
      const world = createWorld();
      expect(world.service.preview(planWithOthers(world, multiMove(mover(), [plain(1), plain(2), plain(3)]), [enemy(2)]))).toEqual({
        unit: { ...mover(), position: { x: 1, y: 0 }, moved: true },
        movement: movement(9),
        interrupted: true,
        transport: undefined,
      });
    });

    it("finds the unit on each square by its position, whatever the order of the units the plan holds", () => {
      const { service } = createWorld();
      const plan = { ...service.plan(multiMove(mover(), [plain(1), plain(2), plain(3)]))!, others: [enemy(3), ally(1)] };
      expect(service.preview(plan)).toEqual({ unit: { ...mover(), position: { x: 2, y: 0 }, moved: true }, movement: movement(8), interrupted: true, transport: undefined });
    });

    it("gives the unit on its own square, as moved, with all its fuel, as interrupted, when the plan holds an enemy on the first square", () => {
      const world = createWorld();
      expect(world.service.preview(planWithOthers(world, multiMove(mover(), [plain(1), plain(2)]), [enemy(1)]))).toEqual({ unit: { ...mover(), moved: true }, movement: movement(), interrupted: true, transport: undefined });
    });

    it.each([
      ["an ally", () => ally(1)],
      ["an enemy in another game", () => enemy(1, "g2")],
    ])("passes through %s", (_name, build) => {
      const { service } = createWorld([build()]);
      expect(service.preview(service.plan(multiMove(mover(), [plain(1), plain(2)]))!).unit.position).toEqual({ x: 2, y: 0 });
    });

    it("gives the result that, committed, gives what execute gives", () => {
      const actionInput = () => multiMove(mover(), [plain(1), plain(2), plain(3)]);
      const world = createWorld();
      const other = createWorld();
      expect(world.service.commit(world.service.preview(planWithOthers(world, actionInput(), [enemy(3)])))).toEqual(other.service.execute(planWithOthers(other, actionInput(), [enemy(3)])));
    });

    it("saves nothing", () => {
      const { service, saves } = createWorld();
      service.preview(service.plan(multiMove(mover(), [plain(1), plain(2)]))!);
      expect(saves).toEqual([]);
    });

    it.each(refused)("gives nothing when %s", (_reason, build) => {
      const { world } = build();
      expect(world.saves).toEqual([]);
    });
  });

  describe("execute", () => {
    it("gives the unit at the end of the path, as moved, and its movement with the cost of the whole path taken off its fuel", () => {
      expect(createWorld().service.execute(createWorld().service.plan(multiMove(mover(), [plain(1), plain(2)]))!)).toEqual({
        definition: MOVE_ACTION,
        unit: { ...mover(), position: { x: 2, y: 0 }, moved: true },
        movement: movement(8),
        interrupted: false,
        transport: undefined,
      });
    });

    it("saves the movement once, with the cost of the whole path taken off its fuel, then the unit once, at the end of the path, as moved", () => {
      const { service, saves, savedUnits, savedMovements } = createWorld();
      service.execute(service.plan(multiMove(mover(), [plain(1), plain(2)]))!);
      expect(saves).toEqual(["movement", "unit"]);
      expect(savedMovements.map(({ fuel }) => fuel)).toEqual([8]);
      expect(savedUnits.map(({ position, moved }) => [position, moved])).toEqual([[{ x: 2, y: 0 }, true]]);
    });

    it("leaves the rest of the unit and its movement as they were", () => {
      const { service, savedUnits, savedMovements } = createWorld();
      const start = mover();
      service.execute(service.plan(multiMove(start, [plain(1), plain(2)]))!);
      expect(savedUnits.at(-1)).toEqual({ ...start, position: { x: 2, y: 0 }, moved: true });
      expect(savedMovements.at(-1)).toEqual({ ...movement(), fuel: 8 });
    });

    it("stops before an enemy the plan holds on the path, and saves the unit where it stopped, as moved", () => {
      const world = createWorld();
      const { service, savedUnits, savedMovements } = world;
      service.execute(planWithOthers(world, multiMove(mover(), [plain(1), plain(2), plain(3)]), [enemy(2)]));
      expect(savedUnits.map(({ identifier, position, moved }) => [identifier.id, position, moved])).toEqual([["mover", { x: 1, y: 0 }, true]]);
      expect(savedMovements.map(({ fuel }) => fuel)).toEqual([9]);
    });

    it("marks the unit as moved even when an enemy the plan holds on the first square keeps it where it is", () => {
      const world = createWorld();
      const { service, savedUnits, savedMovements } = world;
      const start = mover();
      service.execute(planWithOthers(world, multiMove(start, [plain(1), plain(2)]), [enemy(1)]));
      expect(savedUnits).toEqual([{ ...start, moved: true }]);
      expect(savedMovements).toEqual([movement()]);
    });

    it("stops on an ally's square when the plan holds an enemy on the next one", () => {
      const world = createWorld([ally(1)]);
      const { service, savedUnits } = world;
      service.execute(planWithOthers(world, multiMove(mover(), [plain(1), plain(2)]), [ally(1), enemy(2)]));
      expect(savedUnits.at(-1)?.position).toEqual(ally(1).position);
    });

    it("cannot move the unit again once it has moved", () => {
      const { service, savedUnits } = createWorld();
      service.execute(service.plan(multiMove(mover(), [plain(1)]))!);
      expect(service.plan(multiMove(savedUnits.at(-1)!, [plain(2)]))).toBeUndefined();
    });

    it("does not change the action it was given", () => {
      const { service } = createWorld();
      const actionInput = multiMove(mover(), [plain(1), plain(2)]);
      const before = structuredClone(actionInput);
      service.execute(service.plan(actionInput)!);
      expect(actionInput).toEqual(before);
    });

    it.each(refused)("gives nothing and saves nothing when %s", (_reason, build) => {
      const { world } = build();
      expect(world.saves).toEqual([]);
    });
  });

  describe("loading", () => {
    it("plans a path that ends on an ally carrier that can load the unit, holding the carrier with the other units on the path", () => {
      const apc = carrier("apc", 2);
      expect(createWorld([apc]).service.plan(multiMove(mover(), [plain(1), plain(2)]))?.others).toEqual([apc]);
    });

    it("previews the unit on the carrier's square, as moved, and the carrier with the unit added to the units it transports", () => {
      const { service } = createWorld([carrier("apc", 2)]);
      expect(service.preview(service.plan(multiMove(mover(), [plain(1), plain(2)]))!)).toEqual({
        unit: { ...mover(), position: { x: 2, y: 0 }, moved: true },
        movement: movement(8),
        interrupted: false,
        transport: carrier("apc", 2, { transportIds: ["mover"] }),
      });
    });

    it("adds the unit after the units the carrier already holds", () => {
      const { service } = createWorld([carrier("lander", 1, { transportIds: ["rider"] })]);
      expect(service.preview(service.plan(multiMove(mover(), [plain(1)]))!).transport?.transportIds).toEqual(["rider", "mover"]);
    });

    it("loads into nothing for a path that only passes a carrier on the way", () => {
      const { service } = createWorld([carrier("apc", 1)]);
      expect(service.preview(service.plan(multiMove(mover(), [plain(1), plain(2)]))!).transport).toBeUndefined();
    });

    it("loads into nothing when an enemy the plan holds interrupts the move before the carrier", () => {
      const world = createWorld([carrier("apc", 2)]);
      expect(world.service.preview(planWithOthers(world, multiMove(mover(), [plain(1), plain(2)]), [enemy(1), carrier("apc", 2)])).transport).toBeUndefined();
    });

    it("loads into nothing when an enemy the plan holds on the next square stops the unit on a carrier's square", () => {
      const world = createWorld([carrier("apc", 1)]);
      const result = world.service.preview(planWithOthers(world, multiMove(mover(), [plain(1), plain(2)]), [carrier("apc", 1), enemy(2)]));
      expect(result.unit.position).toEqual({ x: 1, y: 0 });
      expect(result.transport).toBeUndefined();
    });

    it("saves the movement, the unit, then the carrier transporting the unit, and gives the carrier as the transport", () => {
      const { service, saves, savedUnits } = createWorld([carrier("apc", 2)]);
      const output = service.execute(service.plan(multiMove(mover(), [plain(1), plain(2)]))!);
      expect(saves).toEqual(["movement", "unit", "unit"]);
      expect(savedUnits).toEqual([{ ...mover(), position: { x: 2, y: 0 }, moved: true }, carrier("apc", 2, { transportIds: ["mover"] })]);
      expect(output.transport).toEqual(carrier("apc", 2, { transportIds: ["mover"] }));
    });

    it("cannot move the unit once it is loaded, even when it may move again", () => {
      const { service, savedUnits } = createWorld([carrier("apc", 1)]);
      service.execute(service.plan(multiMove(mover(), [plain(1)]))!);
      expect(service.plan(multiMove({ ...savedUnits[0], moved: false }, [plain(2)]))).toBeUndefined();
    });

    it("loads a unit that transports units itself, which it goes on transporting", () => {
      const { service, savedUnits } = createWorld([rider(), carrier("lander", 1)]);
      service.execute(service.plan(multiMove(mover({ definition: "apc", transportIds: ["rider"] }), [plain(1)]))!);
      expect(savedUnits.map(({ identifier, transportIds }) => [identifier.id, transportIds])).toEqual([["mover", ["rider"]], ["lander", ["mover"]]]);
    });
  });

  describe("transported units", () => {
    it("saves only the movement and the unit when the unit carries units: they go with it, off the map", () => {
      const { service, saves } = createWorld([rider()]);
      service.execute(service.plan(multiMove(mover({ transportIds: ["rider"] }), [plain(1)]))!);
      expect(saves).toEqual(["movement", "unit"]);
    });

    it("is not stopped by the units it carries, wherever they were left", () => {
      expect(createWorld([rider("rider", { x: 1 })]).service.plan(multiMove(mover({ transportIds: ["rider"] }), [plain(1)]))).toBeDefined();
    });
  });
});
