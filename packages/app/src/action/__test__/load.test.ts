import type {
  BaseObject,
  Definition,
  DefinitionKey,
  DefinitionService,
  GameObject,
  Id,
  LoadActionInput,
  ObjectService,
  TransportDefinition,
  UnitDefinition,
  UnitObject,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { LOAD_ACTION, LoadActionService } from "../load";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

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

const transportDefinition = (name: string, maxUnits: number, allowed: string[]): TransportDefinition => ({
  definition: key("transport", name),
  maxUnits,
  allowed: allowed.map((unit) => ({ unit: key("unit", unit) })),
});

const definitions: Definition[] = [
  unitDefinition("infantry"),
  unitDefinition("tank"),
  unitDefinition("apc", "apc"),
  unitDefinition("lander", "lander"),
  unitDefinition("barge", "lander"), // names the transport definition of another unit, and has none of its own
  unitDefinition("wagon", "ghost"), // names a transport definition that is not defined
  transportDefinition("apc", 1, ["infantry"]),
  transportDefinition("lander", 2, ["infantry", "tank"]),
];

/**
 * A load service on a definition service that knows `definitions`, and an object service that holds `units`, which a
 * saved unit joins or replaces. It remembers every save, in order.
 */
function createWorld(units: UnitObject[] = []) {
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
  const objectService: ObjectService = {
    loadAll<O extends BaseObject<Id>>(scope: string) {
      const objects = scope === "unit" ? stored : unexpected(`loadAll in the scope "${scope}"`);
      return new Map(objects.map((object) => [object.identifier, structuredClone(object)])) as unknown as Map<O["identifier"], O>;
    },
    load: () => unexpected("load"),
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

  return { service: new LoadActionService(definitionService, objectService), saves, savedUnits };
}

const game = (id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn: 0, mapDefinition: key("map", "m1") });

type UnitOptions = { x?: number; playerId?: string; gameId?: string; definition?: string; transportIds?: string[]; moved?: boolean; acted?: boolean };

const unit = (id: string, { x = 1, playerId = "p1", gameId = "g1", definition = "infantry", transportIds = [], moved = false, acted = false }: UnitOptions = {}): UnitObject => ({
  identifier: { id, gameId },
  definition: key("unit", definition),
  position: { x, y: 1 },
  moved,
  acted,
  health: 100,
  playerId,
  movementId: "walk",
  offenseIds: [],
  transportIds,
});

/** The unit that loads, as the multi-move service hands it over: on the carrier's square at (1, 1). */
const loader = (options: UnitOptions = {}) => unit("loader", options);
/** A carrier of the kind `definition` at (1, 1), its id the name of its kind. */
const carrier = (definition: string, options: UnitOptions = {}) => unit(definition, { definition, ...options });

const load = (who: UnitObject, target: UnitObject): LoadActionInput => ({ definition: LOAD_ACTION, game: game(), unit: who, target });

/** The loads the load service refuses, and why. */
const refused: [reason: string, build: () => { world: ReturnType<typeof createWorld>; actionInput: LoadActionInput }][] = [
  ["the target's definition names no transport definition", () => ({ world: createWorld(), actionInput: load(loader(), unit("ally", { definition: "tank" })) })],
  ["the transport definition the carrier's definition names is not defined", () => ({ world: createWorld(), actionInput: load(loader(), carrier("wagon")) })],
  ["the carrier's transport definition does not allow the unit", () => ({ world: createWorld(), actionInput: load(loader({ definition: "tank" }), carrier("apc")) })],
  ["the carrier holds the most units it can", () => ({ world: createWorld(), actionInput: load(loader(), carrier("apc", { transportIds: ["rider"] })) })],
  ["the unit is not on the carrier's square", () => ({ world: createWorld(), actionInput: load(loader({ x: 0 }), carrier("apc")) })],
  ["the carrier is an enemy", () => ({ world: createWorld(), actionInput: load(loader(), carrier("apc", { playerId: "p2" })) })],
  ["the unit has already acted", () => ({ world: createWorld(), actionInput: load(loader({ acted: true }), carrier("apc")) })],
  ["the unit is already loaded", () => ({ world: createWorld([carrier("lander", { transportIds: ["loader"] })]), actionInput: load(loader(), carrier("apc")) })],
  ["the carrier is itself loaded", () => ({ world: createWorld([carrier("lander", { transportIds: ["apc"] })]), actionInput: load(loader(), carrier("apc")) })],
  ["the unit is in another game", () => ({ world: createWorld(), actionInput: load(loader({ gameId: "g2" }), carrier("apc")) })],
  ["the carrier is in another game", () => ({ world: createWorld(), actionInput: load(loader(), carrier("apc", { gameId: "g2" })) })],
  ["the carrier is not defined", () => ({ world: createWorld(), actionInput: load(loader(), carrier("ghost")) })],
];

describe("LOAD_ACTION", () => {
  it("is the action named load", () => {
    expect(LOAD_ACTION).toEqual({ scope: "action", name: "load" });
  });
});

describe("LoadActionService", () => {
  it("loads the unit into the carrier on its square, adding it to the units the carrier transports, and leaves the unit as it was", () => {
    const { service } = createWorld();

    const output = service.execute(service.plan(load(loader(), carrier("apc")))!);

    expect(output).toEqual({ definition: LOAD_ACTION, unit: loader(), target: carrier("apc", { transportIds: ["loader"] }) });
  });

  it("plans the load with the unit and the carrier, and saves nothing", () => {
    const { service, saves } = createWorld();
    expect(service.plan(load(loader(), carrier("apc")))).toEqual({ definition: LOAD_ACTION, unit: loader(), target: carrier("apc") });
    expect(saves).toEqual([]);
  });

  it("loads into a carrier that holds fewer units than the most its transport definition allows, after the units it holds", () => {
    const { service } = createWorld();
    expect(service.execute(service.plan(load(loader(), carrier("lander", { transportIds: ["rider"] })))!).target.transportIds).toEqual(["rider", "loader"]);
  });

  it("follows the transport definition the carrier's definition names, not one named after the carrier", () => {
    const { service } = createWorld();
    expect(service.plan(load(loader({ definition: "tank" }), carrier("barge")))).toBeDefined();
  });

  it("loads a unit whether or not it has moved", () => {
    const { service } = createWorld();
    expect(service.plan(load(loader({ moved: true }), carrier("apc")))).toBeDefined();
  });

  it("loads a unit that transports units itself, which do not count against the carrier", () => {
    const { service } = createWorld();
    expect(service.plan(load(loader({ definition: "tank", transportIds: ["rider", "other"] }), carrier("lander")))).toBeDefined();
  });

  it("looks for the carriers of the unit and of the carrier in their game alone", () => {
    const { service } = createWorld([carrier("lander", { gameId: "g2", transportIds: ["loader", "apc"] })]);
    expect(service.plan(load(loader(), carrier("apc")))).toBeDefined();
  });

  it("saves the carrier, and nothing else: moving the unit is left to the multi-move service", () => {
    const { service, saves, savedUnits } = createWorld();
    service.execute(service.plan(load(loader(), carrier("apc")))!);
    expect(saves).toEqual(["unit"]);
    expect(savedUnits).toEqual([carrier("apc", { transportIds: ["loader"] })]);
  });

  it("previews what executing gives, and saves nothing", () => {
    const { service, saves } = createWorld();

    expect(service.preview(service.plan(load(loader(), carrier("apc")))!)).toEqual({ unit: loader(), target: carrier("apc", { transportIds: ["loader"] }) });
    expect(saves).toEqual([]);
  });

  it("cannot load the unit again, nor into any other carrier, once it is loaded", () => {
    const { service } = createWorld();
    service.execute(service.plan(load(loader(), carrier("lander")))!);
    expect(service.plan(load(loader(), carrier("apc")))).toBeUndefined();
  });

  it("fills the carrier: no other unit can load into the carrier it saved once that holds the most it can", () => {
    const { service, savedUnits } = createWorld();
    const second = unit("second");
    expect(service.plan(load(second, carrier("apc")))).toBeDefined();

    service.execute(service.plan(load(loader(), carrier("apc")))!);

    expect(service.plan(load(second, savedUnits[0]))).toBeUndefined();
  });

  it.each(refused)("refuses when %s, and saves nothing", (_reason, build) => {
    const { world, actionInput } = build();

    expect(world.service.plan(actionInput)).toBeUndefined();
    expect(world.saves).toEqual([]);
  });

  it("changes nothing it was given", () => {
    const { service } = createWorld();
    const actionInput = load(loader(), carrier("apc"));
    const before = JSON.stringify(actionInput);

    service.execute(service.plan(actionInput)!);

    expect(JSON.stringify(actionInput)).toBe(before);
  });
});
