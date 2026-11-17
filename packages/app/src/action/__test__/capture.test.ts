import type {
  BaseObject,
  CaptureActionInput,
  Definition,
  DefinitionKey,
  DefinitionService,
  GameObject,
  Id,
  ObjectService,
  TerrainDefinition,
  TerrainObject,
  UnitDefinition,
  UnitObject,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { CAPTURE_ACTION, CaptureActionService } from "../capture";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

const unitDefinition = (name: string, actions: DefinitionKey[]): UnitDefinition => ({
  definition: key("unit", name),
  fundsCost: 1000,
  visionMax: 2,
  fuelMax: 99,
  moveMax: 3,
  movement: key("movement", "foot"),
  offenses: [],
  actions,
});

const terrainDefinition = (name: string, capturable: boolean): TerrainDefinition => ({ definition: key("terrain", name), defense: 1, capturable });

const definitions: Definition[] = [
  unitDefinition("infantry", [key("action", "attack"), CAPTURE_ACTION]),
  unitDefinition("tank", [key("action", "attack")]),
  terrainDefinition("city", true),
  terrainDefinition("plain", false),
];

/** A capture service on a definition service that knows `definitions`, and an object service that remembers every save, in order. */
function createWorld() {
  const known = new Map(definitions.map((definition) => [`${definition.definition.scope}:${definition.definition.name}`, definition]));
  const definitionService: DefinitionService = {
    get<D extends Definition>(requestedKey: DefinitionKey): D | undefined {
      return known.get(`${requestedKey.scope}:${requestedKey.name}`) as D | undefined;
    },
  };

  const saves: string[] = [];
  const savedTerrains: TerrainObject[] = [];
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
      if (scope === "terrain") {
        savedTerrains.push(object as unknown as TerrainObject);
      } else if (scope === "unit") {
        savedUnits.push(object as unknown as UnitObject);
      } else {
        unexpected(`save in the scope "${scope}"`);
      }
      return object.identifier;
    },
  };

  return { service: new CaptureActionService(definitionService, objectService), saves, savedTerrains, savedUnits };
}

const game = (id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn: 0, mapDefinition: key("map", "m1") });

type UnitOptions = { x?: number; health?: number; acted?: boolean; gameId?: string; definition?: string };

const capturer = ({ x = 1, health = 100, acted = false, gameId = "g1", definition = "infantry" }: UnitOptions = {}): UnitObject => ({
  identifier: { id: "capturer", gameId },
  definition: key("unit", definition),
  position: { x, y: 1 },
  moved: true,
  acted,
  health,
  playerId: "p1",
  movementId: "movement-1",
  offenseIds: [],
});

type TerrainOptions = { health?: number; playerId?: string; gameId?: string; definition?: string };

const city = ({ health = 20, playerId = undefined, gameId = "g1", definition = "city" }: TerrainOptions = {}): TerrainObject => ({
  identifier: { id: "city", gameId },
  definition: key("terrain", definition),
  position: { x: 1, y: 1 },
  health,
  playerId,
});

const capture = (unit: UnitObject, target: TerrainObject): CaptureActionInput => ({ definition: CAPTURE_ACTION, game: game(), unit, target });

/** The captures the capture service refuses, and why. */
const refused: [reason: string, actionInput: CaptureActionInput][] = [
  ["the unit's definition does not have the capture action", capture(capturer({ definition: "tank" }), city())],
  ["the terrain cannot be captured", capture(capturer(), city({ definition: "plain" }))],
  ["the unit is not on the terrain", capture(capturer({ x: 2 }), city())],
  ["the unit's player already holds the terrain", capture(capturer(), city({ playerId: "p1" }))],
  ["the unit has already acted", capture(capturer({ acted: true }), city())],
  ["the unit is in another game", capture(capturer({ gameId: "g2" }), city())],
  ["the terrain is in another game", capture(capturer(), city({ gameId: "g2" }))],
  ["the unit is not defined", capture(capturer({ definition: "ghost" }), city())],
  ["the terrain is not defined", capture(capturer(), city({ definition: "ghost" }))],
];

describe("CaptureActionService", () => {
  it("takes a tenth of the unit's health off the terrain's health, and leaves the terrain to whoever held it", () => {
    const { service, savedTerrains } = createWorld();

    const output = service.execute(service.plan(capture(capturer(), city()))!);

    expect(output).toEqual({ definition: CAPTURE_ACTION, unit: { ...capturer(), acted: true }, target: city({ health: 10 }) });
    expect(savedTerrains).toEqual([city({ health: 10 })]);
  });

  it("takes less off for a damaged unit, rounding its tenth up", () => {
    const { service, savedTerrains } = createWorld();

    const output = service.execute(service.plan(capture(capturer({ health: 45 }), city()))!);

    expect(output).toEqual({ definition: CAPTURE_ACTION, unit: { ...capturer({ health: 45 }), acted: true }, target: city({ health: 15 }) });
    expect(savedTerrains).toEqual([city({ health: 15 })]);
  });

  it.each([[10, 100], [5, 100], [1, 1]])(
    "captures terrain whose %i health the unit's %i health takes to zero or below: it is the player's, and its health is full again",
    (health, unitHealth) => {
      const { service, savedTerrains } = createWorld();

      const output = service.execute(service.plan(capture(capturer({ health: unitHealth }), city({ health })))!);

      expect(output).toEqual({ definition: CAPTURE_ACTION, unit: { ...capturer({ health: unitHealth }), acted: true }, target: city({ playerId: "p1" }) });
      expect(savedTerrains).toEqual([city({ playerId: "p1" })]);
    },
  );

  it("captures terrain another player holds, which stays theirs until its health reaches zero", () => {
    const { service, savedTerrains } = createWorld();

    service.execute(service.plan(capture(capturer(), city({ playerId: "p2" })))!);
    service.execute(service.plan(capture(capturer(), savedTerrains[0]))!);

    expect(savedTerrains).toEqual([city({ health: 10, playerId: "p2" }), city({ playerId: "p1" })]);
  });

  it("marks the unit as acted, and changes nothing else about it", () => {
    const { service, savedUnits } = createWorld();

    service.execute(service.plan(capture(capturer(), city()))!);

    expect(savedUnits).toEqual([{ ...capturer(), acted: true }]);
  });

  it("does not let the unit capture again once it has acted", () => {
    const { service, savedUnits } = createWorld();

    service.execute(service.plan(capture(capturer(), city()))!);

    expect(service.plan(capture(savedUnits[0], city({ health: 10 })))).toBeUndefined();
  });

  it("saves the terrain, then the unit", () => {
    const { service, saves } = createWorld();
    service.execute(service.plan(capture(capturer(), city()))!);
    expect(saves).toEqual(["terrain", "unit"]);
  });

  it("previews the unit and the terrain executing saves, and saves nothing", () => {
    const { service, saves } = createWorld();

    expect(service.preview(service.plan(capture(capturer(), city()))!)).toEqual({ unit: { ...capturer(), acted: true }, target: city({ health: 10 }) });
    expect(service.preview(service.plan(capture(capturer(), city({ health: 10 })))!)).toEqual({ unit: { ...capturer(), acted: true }, target: city({ playerId: "p1" }) });
    expect(saves).toEqual([]);
  });

  it.each(refused)("refuses when %s, and saves nothing", (_reason, actionInput) => {
    const { service, saves } = createWorld();

    expect(service.plan(actionInput)).toBeUndefined();
    expect(saves).toEqual([]);
  });

  it("changes nothing it was given", () => {
    const { service } = createWorld();
    const actionInput = capture(capturer(), city({ health: 10 }));
    const before = JSON.stringify(actionInput);

    service.execute(service.plan(actionInput)!);

    expect(JSON.stringify(actionInput)).toBe(before);
  });
});
