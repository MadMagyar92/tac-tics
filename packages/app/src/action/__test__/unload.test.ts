import type {
  BaseObject,
  Definition,
  DefinitionKey,
  DefinitionService,
  GameObject,
  Id,
  MovementDefinition,
  MovementObject,
  ObjectService,
  TerrainObject,
  UnitDefinition,
  UnitObject,
  UnitReferenceId,
  UnloadActionInput,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { UNLOAD_ACTION, UnloadActionService } from "../unload";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

const foot: MovementDefinition = {
  definition: key("movement", "foot"),
  cost: [{ terrain: key("terrain", "plain"), cost: 1 }, { terrain: key("terrain", "woods"), cost: 2 }],
};

const unitDefinition = (name: string, transport: string | undefined = undefined): UnitDefinition => ({
  definition: key("unit", name),
  fundsCost: 1000,
  visionMax: 2,
  fuelMax: 99,
  moveMax: 3,
  movement: key("movement", "foot"),
  offenses: [],
  capture: undefined,
  transport: transport === undefined ? undefined : key("transport", transport),
});

const definitions: Definition[] = [foot, unitDefinition("apc", "apc"), unitDefinition("lander", "lander"), unitDefinition("tank")];

/** The movement of the unit `unitId`, of the movement definition `walks`. */
const movement = (unitId: string, walks = "foot"): MovementObject => ({
  identifier: { id: "walk", gameId: "g1", unitId },
  definition: key("movement", walks),
  fuel: 10,
});

/**
 * An unload service on a definition service that knows `definitions`, and an object service that holds `units`, which a
 * saved unit joins or replaces, and the `movements` of the units. It remembers every save, in order.
 */
function createWorld(units: UnitObject[] = [], movements: MovementObject[] = units.map(({ identifier }) => movement(identifier.id))) {
  const known = new Map(definitions.map((definition) => [`${definition.definition.scope}:${definition.definition.name}`, definition]));
  const definitionService: DefinitionService = {
    get<D extends Definition>(requestedKey: DefinitionKey): D | undefined {
      return known.get(`${requestedKey.scope}:${requestedKey.name}`) as D | undefined;
    },
  };

  const stored = [...units];
  const saves: string[] = [];
  const savedUnits: UnitObject[] = [];
  const unexpected = (what: string): never => {
    throw new Error(`unexpected ${what}`);
  };
  const isSame = (a: UnitReferenceId, b: UnitReferenceId) => a.id === b.id && a.gameId === b.gameId && a.unitId === b.unitId;
  const objectService: ObjectService = {
    loadAll<O extends BaseObject<Id>>(scope: string) {
      const objects = scope === "unit" ? stored : unexpected(`loadAll in the scope "${scope}"`);
      return new Map(objects.map((object) => [object.identifier, structuredClone(object)])) as unknown as Map<O["identifier"], O>;
    },
    load<O extends BaseObject<Id>>(scope: string, identifier: O["identifier"]) {
      if (scope !== "movement") {
        unexpected(`load in the scope "${scope}"`);
      }
      return structuredClone(movements.find((held) => isSame(held.identifier, identifier as UnitReferenceId))) as O | undefined;
    },
    delete: () => unexpected("delete"),
    save<O extends BaseObject<Id>>(scope: string, object: O) {
      saves.push(scope);
      if (scope !== "unit") {
        unexpected(`save in the scope "${scope}"`);
      }
      const unit = object as unknown as UnitObject;
      savedUnits.push(unit);
      const index = stored.findIndex(({ identifier }) => identifier.id === unit.identifier.id && identifier.gameId === unit.identifier.gameId);
      stored.splice(index < 0 ? stored.length : index, 1, unit);
      return object.identifier;
    },
  };

  return { service: new UnloadActionService(definitionService, objectService), saves, savedUnits };
}

const game = (id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn: 0, mapDefinition: key("map", "m1") });

type UnitOptions = { x?: number; y?: number; playerId?: string; gameId?: string; transportIds?: string[]; moved?: boolean; acted?: boolean };

const unit = (id: string, definition: string, { x = 1, y = 1, playerId = "p1", gameId = "g1", transportIds = [], moved = false, acted = false }: UnitOptions = {}): UnitObject => ({
  identifier: { id, gameId },
  definition: key("unit", definition),
  position: { x, y },
  moved,
  acted,
  health: 100,
  playerId,
  movementId: "walk",
  offenseIds: [],
  transportIds,
});

/** The carrier, at (1, 1), which transports the rider unless said otherwise. */
const apc = (options: UnitOptions = {}) => unit("apc", "apc", { transportIds: ["rider"], ...options });
/** A unit the carrier holds, left at (1, 1) with it. */
const rider = (options: UnitOptions = {}) => unit("rider", "infantry", options);

const terrain = (name: string, x: number, y = 1, gameId = "g1"): TerrainObject => ({
  identifier: { id: `${name}-${x}-${y}`, gameId },
  definition: key("terrain", name),
  position: { x, y },
  health: 20,
  playerId: undefined,
});

const unload = (unit: UnitObject, target: UnitObject, to: TerrainObject): UnloadActionInput => ({ definition: UNLOAD_ACTION, game: game(), unit, target, terrain: to });

/** The unloads the unload service refuses, and why. */
const refused: [reason: string, build: () => { world: ReturnType<typeof createWorld>; actionInput: UnloadActionInput }][] = [
  ["the unit is not in the carrier's transport", () => ({ world: createWorld([apc({ transportIds: [] }), rider({ x: 0 })]), actionInput: unload(apc({ transportIds: [] }), rider({ x: 0 }), terrain("plain", 2)) })],
  ["the unit is in another carrier's transport", () => ({ world: createWorld([apc({ transportIds: [] }), rider(), unit("lander", "lander", { transportIds: ["rider"] })]), actionInput: unload(apc({ transportIds: [] }), rider(), terrain("plain", 2)) })],
  ["the terrain is not next to the carrier", () => ({ world: createWorld([apc(), rider()]), actionInput: unload(apc(), rider(), terrain("plain", 3)) })],
  ["the terrain is the carrier's own square", () => ({ world: createWorld([apc(), rider()]), actionInput: unload(apc(), rider(), terrain("plain", 1)) })],
  ["the unit's movement cannot enter the terrain", () => ({ world: createWorld([apc(), rider()]), actionInput: unload(apc(), rider(), terrain("sea", 2)) })],
  ["an ally is on the terrain", () => ({ world: createWorld([apc(), rider(), unit("ally", "tank", { x: 2 })]), actionInput: unload(apc(), rider(), terrain("plain", 2)) })],
  ["an enemy is on the terrain", () => ({ world: createWorld([apc(), rider(), unit("enemy", "tank", { x: 2, playerId: "p2" })]), actionInput: unload(apc(), rider(), terrain("plain", 2)) })],
  ["the carrier's definition names no transport definition", () => ({ world: createWorld([unit("truck", "tank", { transportIds: ["rider"] }), rider()]), actionInput: unload(unit("truck", "tank", { transportIds: ["rider"] }), rider(), terrain("plain", 2)) })],
  ["the carrier is not defined", () => ({ world: createWorld([unit("ghost", "ghost", { transportIds: ["rider"] }), rider()]), actionInput: unload(unit("ghost", "ghost", { transportIds: ["rider"] }), rider(), terrain("plain", 2)) })],
  ["the carrier has already acted", () => ({ world: createWorld([apc({ acted: true }), rider()]), actionInput: unload(apc({ acted: true }), rider(), terrain("plain", 2)) })],
  ["the carrier is itself loaded", () => ({ world: createWorld([unit("lander", "lander", { transportIds: ["apc"] }), apc(), rider()]), actionInput: unload(apc(), rider(), terrain("plain", 2)) })],
  ["the carrier is in another game", () => ({ world: createWorld([apc(), rider()]), actionInput: unload(apc({ gameId: "g2" }), rider(), terrain("plain", 2)) })],
  ["the unit is in another game", () => ({ world: createWorld([apc(), rider()]), actionInput: unload(apc(), rider({ gameId: "g2" }), terrain("plain", 2)) })],
  ["the terrain is in another game", () => ({ world: createWorld([apc(), rider()]), actionInput: unload(apc(), rider(), terrain("plain", 2, 1, "g2")) })],
  ["the unit's movement is not held", () => ({ world: createWorld([apc(), rider()], []), actionInput: unload(apc(), rider(), terrain("plain", 2)) })],
  ["the unit's movement is not defined", () => ({ world: createWorld([apc(), rider()], [movement("rider", "ghost")]), actionInput: unload(apc(), rider(), terrain("plain", 2)) })],
];

describe("UNLOAD_ACTION", () => {
  it("is the action named unload", () => {
    expect(UNLOAD_ACTION).toEqual({ scope: "action", name: "unload" });
  });
});

describe("UnloadActionService", () => {
  it("puts the unit on the terrain, as moved and acted, no longer transported, and marks the carrier as acted", () => {
    const { service } = createWorld([apc(), rider()]);

    const output = service.execute(service.plan(unload(apc(), rider(), terrain("plain", 2)))!);

    expect(output).toEqual({ definition: UNLOAD_ACTION, unit: apc({ acted: true, transportIds: [] }), target: rider({ x: 2, moved: true, acted: true }) });
  });

  it.each([[2, 1], [0, 1], [1, 2], [1, 0]])("unloads onto the terrain at (%i, %i), next to the carrier at (1, 1)", (x, y) => {
    const { service } = createWorld([apc(), rider()]);
    expect(service.plan(unload(apc(), rider(), terrain("plain", x, y)))).toBeDefined();
  });

  it("measures from the carrier, not from where the unit was left", () => {
    const { service } = createWorld([apc({ x: 5 }), rider()]);
    expect(service.plan(unload(apc({ x: 5 }), rider(), terrain("plain", 6)))).toBeDefined();
    expect(service.plan(unload(apc({ x: 5 }), rider(), terrain("plain", 2)))).toBeUndefined();
  });

  it("unloads onto terrain that costs more than the unit has fuel left: unloading spends no fuel", () => {
    const { service, saves } = createWorld([apc(), rider()], [{ ...movement("rider"), fuel: 0 }]);
    service.execute(service.plan(unload(apc(), rider(), terrain("woods", 2)))!);
    expect(saves).not.toContain("movement");
  });

  it("unloads onto a square where a unit another carrier holds was left, since that unit is off the map", () => {
    const { service } = createWorld([apc(), rider(), unit("stowaway", "infantry", { x: 2 }), unit("lander", "lander", { x: 5, transportIds: ["stowaway"] })]);
    expect(service.plan(unload(apc(), rider(), terrain("plain", 2)))).toBeDefined();
  });

  it("lets the carrier move before it unloads", () => {
    const { service } = createWorld([apc({ moved: true }), rider()]);
    expect(service.plan(unload(apc({ moved: true }), rider(), terrain("plain", 2)))).toBeDefined();
  });

  it("unloads a unit that has neither moved nor acted this turn as moved and acted all the same", () => {
    const { service, savedUnits } = createWorld([apc(), rider()]);
    service.execute(service.plan(unload(apc(), rider(), terrain("plain", 2)))!);
    expect(savedUnits.at(-1)).toMatchObject({ moved: true, acted: true });
  });

  it("keeps transporting the other units of the carrier, in order", () => {
    const { service } = createWorld([apc({ transportIds: ["first", "rider", "last"] }), rider()]);
    expect(service.preview(service.plan(unload(apc({ transportIds: ["first", "rider", "last"] }), rider(), terrain("plain", 2)))!).unit.transportIds).toEqual(["first", "last"]);
  });

  it("does not let the carrier unload again once it has acted", () => {
    const second = unit("second", "infantry");
    const { service, savedUnits } = createWorld([apc({ transportIds: ["rider", "second"] }), rider(), second]);

    service.execute(service.plan(unload(apc({ transportIds: ["rider", "second"] }), rider(), terrain("plain", 2)))!);

    expect(service.plan(unload(savedUnits[0], second, terrain("plain", 0)))).toBeUndefined();
  });

  it("saves the carrier, then the unit, and nothing else: no movement", () => {
    const { service, saves, savedUnits } = createWorld([apc(), rider()]);
    service.execute(service.plan(unload(apc(), rider(), terrain("plain", 2)))!);
    expect(saves).toEqual(["unit", "unit"]);
    expect(savedUnits.map(({ identifier }) => identifier.id)).toEqual(["apc", "rider"]);
  });

  it("unloads a carrier along with the units it transports, which stay loaded in it", () => {
    const lander = unit("lander", "lander", { transportIds: ["apc"] });
    const { service, savedUnits } = createWorld([lander, apc({ transportIds: ["inner"] }), unit("inner", "infantry")]);

    service.execute(service.plan(unload(lander, apc({ transportIds: ["inner"] }), terrain("plain", 2)))!);

    expect(savedUnits.map(({ identifier, transportIds }) => [identifier.id, transportIds])).toEqual([["lander", []], ["apc", ["inner"]]]);
  });

  it("gives the unit its own position, not the terrain's", () => {
    const { service, savedUnits } = createWorld([apc(), rider()]);
    const next = terrain("plain", 2);
    service.execute(service.plan(unload(apc(), rider(), next))!);
    expect(savedUnits[1].position).not.toBe(next.position);
    expect(savedUnits[1].position).toEqual(next.position);
  });

  it("previews the carrier and the unit executing saves, and saves nothing", () => {
    const { service, saves } = createWorld([apc(), rider()]);

    expect(service.preview(service.plan(unload(apc(), rider(), terrain("plain", 2)))!)).toEqual({
      unit: apc({ acted: true, transportIds: [] }),
      target: rider({ x: 2, moved: true, acted: true }),
    });
    expect(saves).toEqual([]);
  });

  it.each(refused)("refuses when %s, and saves nothing", (_reason, build) => {
    const { world, actionInput } = build();

    expect(world.service.plan(actionInput)).toBeUndefined();
    expect(world.saves).toEqual([]);
  });

  it("changes nothing it was given", () => {
    const { service } = createWorld([apc(), rider()]);
    const actionInput = unload(apc(), rider(), terrain("plain", 2));
    const before = JSON.stringify(actionInput);

    service.execute(service.plan(actionInput)!);

    expect(JSON.stringify(actionInput)).toBe(before);
  });
});
