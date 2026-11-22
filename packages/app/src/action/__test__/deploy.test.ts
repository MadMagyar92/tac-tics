import type {
  BaseObject,
  CaptureObject,
  Definition,
  DefinitionKey,
  DefinitionService,
  DeployActionInput,
  GameObject,
  Id,
  MovementObject,
  ObjectService,
  OffenseDefinition,
  OffenseObject,
  PlayerObject,
  TerrainObject,
  UnitDefinition,
  UnitObject,
} from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { DEPLOY_ACTION, DeployActionService } from "../deploy";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

const offenseDefinition = (name: string, ammoMax: number): OffenseDefinition => ({
  definition: key("offense", name),
  ammoMax,
  rangeMin: 1,
  rangeMax: 1,
  damage: [],
});

const kind = (name: string, fundsCost: number, fuelMax: number, offenses: string[]): UnitDefinition => ({
  definition: key("unit", name),
  fundsCost,
  visionMax: 2,
  fuelMax,
  moveMax: 3,
  movement: key("movement", "foot"),
  offenses: offenses.map((offense) => key("offense", offense)),
  capture: undefined,
  transport: undefined,
});

const definitions: Definition[] = [
  offenseDefinition("cannon", 9),
  offenseDefinition("machine-gun", 99),
  offenseDefinition("empty", 0),
  kind("tank", 7000, 60, ["cannon", "machine-gun"]),
  kind("infantry", 1000, 99, ["machine-gun"]),
  kind("recon", 4000, 80, []),
  kind("free", 0, 10, []),
  kind("artillery", 6000, 50, ["cannon", "missing"]), // an offense that is not defined
  kind("zero", 1000, 5, ["empty"]), // an offense with a capacity of zero
];

type Held = { units: UnitObject[]; players: PlayerObject[] };

/**
 * A definition service that knows `definitions` and remembers what it was asked for, and an object service that holds
 * `units` and `players` and remembers every save, in order. A saved unit joins the units held, and a saved player takes
 * the place of the one held.
 */
function createWorld(units: UnitObject[] = [], players: PlayerObject[] = [player("p1", 0), player("p2", 1)]) {
  const known = new Map(definitions.map((definition) => [`${definition.definition.scope}:${definition.definition.name}`, definition]));
  const requested: DefinitionKey[] = [];
  const definitionService: DefinitionService = {
    get<D extends Definition>(requestedKey: DefinitionKey): D | undefined {
      requested.push(requestedKey);
      return known.get(`${requestedKey.scope}:${requestedKey.name}`) as D | undefined;
    },
  };

  const held: Held = { units: [...units], players: [...players] };
  const saves: { scope: string; object: unknown }[] = [];
  const unexpected = (what: string): never => {
    throw new Error(`unexpected ${what}`);
  };
  const objectService: ObjectService = {
    loadAll<O extends BaseObject<Id>>(scope: string) {
      if (scope !== "unit" && scope !== "player") {
        unexpected(`loadAll in the scope "${scope}"`);
      }
      const objects: BaseObject<Id>[] = scope === "unit" ? held.units : held.players;
      return new Map(objects.map((object) => [object.identifier, object])) as unknown as Map<O["identifier"], O>;
    },
    load: () => unexpected("load"),
    delete: () => unexpected("delete"),
    save<O extends BaseObject<Id>>(scope: string, object: O) {
      saves.push({ scope, object });
      if (scope === "unit") {
        held.units.push(object as unknown as UnitObject);
      }
      if (scope === "player") {
        const kept = object as unknown as PlayerObject;
        held.players = held.players.map((candidate) => (sameReference(candidate, kept) ? kept : candidate));
      }
      return object.identifier;
    },
  };

  const saved = (scope: string) => saves.filter((save) => save.scope === scope).map((save) => save.object);
  return { service: new DeployActionService(definitionService, objectService), requested, saves, saved, held };
}

const sameReference = (a: PlayerObject, b: PlayerObject): boolean => a.identifier.id === b.identifier.id && a.identifier.gameId === b.identifier.gameId;

const game = (playerTurn = 0, id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn, mapId: "m1" });

const player = (id = "p1", order = 0, funds = 10000, gameId = "g1"): PlayerObject => ({
  identifier: { id, gameId },
  definition: key("player", "orange-star"),
  order,
  funds,
});

/** The terrain at (x, y), controlled by `playerId`, or by nobody when it is null. */
const terrain = (x: number, y: number, playerId: string | null = "p1", gameId = "g1"): CaptureObject => ({
  identifier: { id: `base-${x}-${y}`, gameId },
  definition: key("terrain", "base"),
  position: { x, y },
  health: 20,
  playerId: playerId ?? undefined,
});

const existing = (id: string, x: number, y: number, gameId = "g1", playerId = "p2"): UnitObject => ({
  identifier: { id, gameId },
  definition: key("unit", "recon"),
  position: { x, y },
  moved: false,
  acted: false,
  health: 100,
  playerId,
  movementId: "movement-1",
  offenseIds: [],
  transportIds: [],
});

type Options = { gameTurn?: number; gameId?: string; where?: TerrainObject | CaptureObject; what?: DefinitionKey };

const deploy = ({ gameTurn = 0, gameId = "g1", where = terrain(3, 4), what = key("unit", "tank") }: Options = {}): DeployActionInput => ({
  definition: DEPLOY_ACTION,
  game: game(gameTurn, gameId),
  terrain: where,
  target: what,
});

/** The unit that `world` saves when it carries out `actionInput`. */
const deployed = (world: ReturnType<typeof createWorld>, actionInput: DeployActionInput): UnitObject => {
  world.service.execute(world.service.plan(actionInput)!);
  return world.saved("unit")[0] as UnitObject;
};

/** A world where p1 has the first turn, and both players have `funds`. */
const withFunds = (funds: number, units: UnitObject[] = []) => createWorld(units, [player("p1", 0, funds), player("p2", 1, funds)]);

describe("DEPLOY_ACTION", () => {
  it("is the action named deploy", () => {
    expect(DEPLOY_ACTION).toEqual({ scope: "action", name: "deploy" });
  });
});

describe("DeployActionService", () => {
  describe("plan", () => {
    it("is true for the player whose turn it is, on a terrain the player controls, with the funds, and no unit there", () => {
      expect(createWorld().service.plan(deploy())).toBeDefined();
    });

    describe("the turn", () => {
      it("is false when it is the turn of another player than the one who controls the terrain", () => {
        expect(createWorld().service.plan(deploy({ gameTurn: 1 }))).toBeUndefined();
      });

      it("is true for the player of the second turn, on their turn", () => {
        expect(createWorld().service.plan(deploy({ gameTurn: 1, where: terrain(3, 4, "p2") }))).toBeDefined();
      });

      it("is false when no player has the turn", () => {
        expect(createWorld().service.plan(deploy({ gameTurn: 5 }))).toBeUndefined();
      });

      it("is false when there are no players", () => {
        expect(createWorld([], []).service.plan(deploy())).toBeUndefined();
      });

      it("is false when the player whose turn it is is in another game", () => {
        expect(createWorld([], [player("p1", 0, 10000, "g2")]).service.plan(deploy())).toBeUndefined();
      });

      it("does not take the player of another game who has the same turn", () => {
        expect(createWorld([], [player("p9", 0, 0, "g2"), player("p1", 0, 10000)]).service.plan(deploy())).toBeDefined();
      });
    });

    describe("the control of the terrain", () => {
      it("is false for a terrain another player controls", () => {
        expect(createWorld().service.plan(deploy({ where: terrain(3, 4, "p2") }))).toBeUndefined();
      });

      it("is false for a terrain nobody controls", () => {
        expect(createWorld().service.plan(deploy({ where: terrain(3, 4, null) }))).toBeUndefined();
      });
    });

    describe("the funds", () => {
      it.each([[7000, true], [7001, true], [10000, true], [6999, false], [0, false]])("with %i funds, a tank that costs 7000 is %s", (funds, allowed) => {
        expect(withFunds(funds).service.plan(deploy()) !== undefined).toBe(allowed);
      });

      it("is true for a unit that costs nothing, with no funds", () => {
        expect(withFunds(0).service.plan(deploy({ what: key("unit", "free") }))).toBeDefined();
      });
    });

    describe("the units there are", () => {
      it("is false when a unit is on the terrain", () => {
        expect(createWorld([existing("unit-1", 3, 4)]).service.plan(deploy())).toBeUndefined();
      });

      it("is false when a unit of the same player is on the terrain", () => {
        expect(createWorld([existing("unit-1", 3, 4, "g1", "p1")]).service.plan(deploy())).toBeUndefined();
      });

      it("is true when the units are on other squares", () => {
        expect(createWorld([existing("unit-1", 3, 5), existing("unit-2", 4, 4), existing("unit-3", 0, 0)]).service.plan(deploy())).toBeDefined();
      });

      it("is true when the unit on that square is in another game", () => {
        expect(createWorld([existing("unit-1", 3, 4, "g2")]).service.plan(deploy())).toBeDefined();
      });
    });

    describe("the game", () => {
      it("is false when the terrain is in another game", () => {
        expect(createWorld().service.plan(deploy({ where: terrain(3, 4, "p1", "g2") }))).toBeUndefined();
      });

      it("is false on the static terrain of the map of the game, which no player holds", () => {
        const plain: TerrainObject = { identifier: { id: "plain-3-4", mapId: "m1" }, definition: key("terrain", "plain"), position: { x: 3, y: 4 } };
        expect(createWorld().service.plan(deploy({ where: plain }))).toBeUndefined();
      });

      it("is false when the action is for another game than the terrain is in", () => {
        expect(createWorld().service.plan(deploy({ gameId: "g2" }))).toBeUndefined();
      });
    });

    describe("what is deployed", () => {
      it("is false for a unit that is not defined", () => {
        expect(createWorld().service.plan(deploy({ what: key("unit", "ghost") }))).toBeUndefined();
      });

      it.each([["an offense", key("offense", "cannon")], ["a terrain", key("terrain", "base")]])("is false for the definition of %s, which is not a unit", (_name, what) => {
        const { service, requested } = createWorld();
        expect(service.plan(deploy({ what }))).toBeUndefined();
        expect(requested).toEqual([]);
      });

      it("is false for a unit one of whose offenses is not defined", () => {
        expect(createWorld().service.plan(deploy({ what: key("unit", "artillery") }))).toBeUndefined();
      });
    });

    describe("lookups", () => {
      it("asks for the unit, then for each of its offenses in order", () => {
        const { service, requested } = createWorld();
        service.plan(deploy());
        expect(requested).toEqual([key("unit", "tank"), key("offense", "cannon"), key("offense", "machine-gun")]);
      });

      it("asks for no offense when the player cannot deploy", () => {
        const { service, requested } = withFunds(0);
        service.plan(deploy());
        expect(requested).toEqual([key("unit", "tank")]);
      });

      it("asks for nothing when the game is not the one of the terrain", () => {
        const { service, requested } = createWorld();
        service.plan(deploy({ gameId: "g2" }));
        expect(requested).toEqual([]);
      });
    });

    it("changes nothing and saves nothing", () => {
      const { service, saves } = createWorld();
      const actionInput = deploy();
      const before = structuredClone(actionInput);
      service.plan(actionInput);
      expect(actionInput).toEqual(before);
      expect(saves).toEqual([]);
    });
  });

  describe("preview", () => {
    it("gives the result of the deploy, when it can be carried out: the new unit, its movement, its offenses, and the player with the unit's cost spent", () => {
      expect(createWorld().service.preview(createWorld().service.plan(deploy())!)).toMatchObject({
        player: { identifier: { id: "p1" }, funds: 3000 }, // a tank costs 7000
        unit: { identifier: { id: "unit-1" }, definition: { scope: "unit", name: "tank" } },
        movement: { identifier: { unitId: "unit-1" } },
        offenses: [{ identifier: { unitId: "unit-1" } }, { identifier: { unitId: "unit-1" } }],
      });
    });

    it("spends no funds: it saves no player", () => {
      const { service, saved } = createWorld();
      service.preview(service.plan(deploy())!);
      expect(saved("player")).toEqual([]);
    });

    it("saves nothing", () => {
      const { service, saves } = createWorld();
      service.preview(service.plan(deploy())!);
      expect(saves).toEqual([]);
    });

    it("does not change the action it was given", () => {
      const actionInput = deploy();
      const before = structuredClone(actionInput);
      createWorld().service.preview(createWorld().service.plan(actionInput)!);
      expect(actionInput).toEqual(before);
    });

    it("gives the same result every time, since nothing is spent", () => {
      const { service } = withFunds(7000);
      const actionInput = deploy();
      expect(service.preview(service.plan(actionInput)!)).toEqual(service.preview(service.plan(actionInput)!));
      expect(service.plan(actionInput)).toBeDefined();
    });

    it.each([
      ["the player whose turn it is does not control the terrain", () => ({ world: createWorld(), actionInput: deploy({ gameTurn: 1 }) })],
      ["no player has the turn", () => ({ world: createWorld(), actionInput: deploy({ gameTurn: 5 }) })],
      ["the terrain is controlled by another player", () => ({ world: createWorld(), actionInput: deploy({ where: terrain(3, 4, "p2") }) })],
      ["the terrain is controlled by nobody", () => ({ world: createWorld(), actionInput: deploy({ where: terrain(3, 4, null) }) })],
      ["the player cannot afford the unit", () => ({ world: withFunds(6999), actionInput: deploy() })],
      ["the unit is not defined", () => ({ world: createWorld(), actionInput: deploy({ what: key("unit", "ghost") }) })],
      ["the player whose turn it is is in another game", () => ({ world: createWorld([], [player("p1", 0, 10000, "g2")]), actionInput: deploy() })],
    ])("gives nothing when %s", (_reason, build) => {
      const { world: { service, saves }, actionInput } = build();
      expect(service.plan(actionInput)).toBeUndefined();
      expect(saves).toEqual([]);
    });

    it("gives nothing when a unit is on the terrain", () => {
      const { service } = createWorld([existing("unit-1", 3, 4)]);
    });
  });

  describe("execute", () => {
    it("gives what committing the preview gives", () => {
      const actionInput = () => deploy({ what: key("unit", "infantry") });
      const existingUnits = () => [existing("unit-1", 0, 0)];
      const { service } = withFunds(2500, existingUnits());
      expect(withFunds(2500, existingUnits()).service.execute(withFunds(2500, existingUnits()).service.plan(actionInput())!)).toEqual(service.commit(service.preview(service.plan(actionInput())!)));
    });

    it("gives the output of the deploy: its result, with the definition of the deploy", () => {
      expect(createWorld().service.execute(createWorld().service.plan(deploy())!)).toMatchObject({
        definition: DEPLOY_ACTION,
        player: { identifier: { id: "p1" }, funds: 3000 }, // a tank costs 7000
        unit: { identifier: { id: "unit-1" } },
      });
    });

    it("gives the unit it saved", () => {
      const { service, saved } = createWorld([existing("unit-4", 0, 0)]);
      const output = service.execute(service.plan(deploy())!);
      expect(output.unit).toEqual(saved("unit")[0]);
      expect((saved("unit")[0] as UnitObject).identifier.id).toBe("unit-5");
    });

    describe("the new unit", () => {
      it("is saved, once", () => {
        const { service, saved } = createWorld();
        service.execute(service.plan(deploy())!);
        expect(saved("unit")).toHaveLength(1);
      });

      it("is on the position of the terrain", () => {
        expect(deployed(createWorld(), deploy({ where: terrain(3, 4) })).position).toEqual({ x: 3, y: 4 });
      });

      it("is the player's whose turn it is", () => {
        expect(deployed(createWorld(), deploy()).playerId).toBe("p1");
        expect(deployed(createWorld(), deploy({ gameTurn: 1, where: terrain(3, 4, "p2") })).playerId).toBe("p2");
      });

      it("is the player's of its own game, not of another game with the turn", () => {
        expect(deployed(createWorld([], [player("p9", 0, 10000, "g2"), player("p1", 0)]), deploy()).playerId).toBe("p1");
      });

      it("is of the kind asked for, with the health a new unit has", () => {
        expect(deployed(createWorld(), deploy())).toEqual({
          identifier: { id: "unit-1", gameId: "g1" },
          definition: key("unit", "tank"),
          position: { x: 3, y: 4 },
          moved: false,
          acted: false,
          health: 100,
          playerId: "p1",
          movementId: "movement-1",
          offenseIds: ["offense-1", "offense-2"],
          transportIds: [],
        });
      });

      it("has an offense for each offense of its kind, and none for a kind with none", () => {
        expect(deployed(createWorld(), deploy({ what: key("unit", "infantry") })).offenseIds).toEqual(["offense-1"]);
        expect(deployed(createWorld(), deploy({ what: key("unit", "recon") })).offenseIds).toEqual([]);
      });

      it("has its own position, not the terrain's", () => {
        const where = terrain(3, 4);
        const unit = deployed(createWorld(), deploy({ where }));
        expect(unit.position).not.toBe(where.position);
        unit.position.x = 99;
        expect(where.position).toEqual({ x: 3, y: 4 });
      });

      it("has its own definition key, not the one of the action", () => {
        const what = key("unit", "tank");
        const unit = deployed(createWorld(), deploy({ what }));
        expect(unit.definition).toEqual(what);
        expect(unit.definition).not.toBe(what);
      });
    });

    describe("the id of the new unit", () => {
      const idAfter = (units: UnitObject[]) => deployed(createWorld(units), deploy()).identifier.id;

      it("is unit-1 when there are no units", () => {
        expect(idAfter([])).toBe("unit-1");
      });

      it("is the one after the highest, not after the last or the number of units", () => {
        expect(idAfter([existing("unit-1", 0, 0), existing("unit-5", 0, 1), existing("unit-2", 0, 2)])).toBe("unit-6");
      });

      it("is after a number of two digits", () => {
        expect(idAfter([existing("unit-9", 0, 0), existing("unit-10", 0, 1)])).toBe("unit-11");
      });

      it("leaves out the ids that are not unit-<number>", () => {
        expect(idAfter([existing("unit-3", 0, 0), existing("unit-x", 0, 1), existing("tank-9", 0, 2), existing("unit-4a", 0, 3), existing("a-unit-8", 0, 4)])).toBe("unit-4");
      });

      it("leaves out the units of other games", () => {
        expect(idAfter([existing("unit-2", 0, 0), existing("unit-7", 0, 1, "g2")])).toBe("unit-3");
      });
    });

    it("saves a movement object of the movement of the kind, with a full tank, for the new unit", () => {
      const { service, saved } = createWorld();
      service.execute(service.plan(deploy())!);
      expect(saved("movement")).toEqual([
        { identifier: { id: "movement-1", gameId: "g1", unitId: "unit-1" }, definition: key("movement", "foot"), fuel: 60 },
      ] satisfies MovementObject[]);
    });

    it.each([["infantry", 99], ["recon", 80], ["tank", 60]])("saves the movement of a %s with its full tank: %i fuel", (name, fuel) => {
      const { service, saved } = createWorld();
      service.execute(service.plan(deploy({ what: key("unit", name) }))!);
      expect((saved("movement") as MovementObject[]).map((movement) => movement.fuel)).toEqual([fuel]);
    });

    it("gives the movement object the id that the unit holds, and the unit's id", () => {
      const { service, saved } = createWorld([existing("unit-4", 0, 0)]);
      service.execute(service.plan(deploy())!);
      const [unit] = saved("unit") as UnitObject[];
      const [movement] = saved("movement") as MovementObject[];
      expect(movement.identifier).toEqual({ id: unit.movementId, gameId: "g1", unitId: unit.identifier.id });
    });

    it("saves an offense object for each offense of the kind, full, for the new unit", () => {
      const { service, saved } = createWorld();
      service.execute(service.plan(deploy())!);
      expect(saved("offense")).toEqual([
        { identifier: { id: "offense-1", gameId: "g1", unitId: "unit-1" }, definition: key("offense", "cannon"), ammo: 9 },
        { identifier: { id: "offense-2", gameId: "g1", unitId: "unit-1" }, definition: key("offense", "machine-gun"), ammo: 99 },
      ] satisfies OffenseObject[]);
    });

    it("gives the offense objects the ids that the unit lists, and the unit's id", () => {
      const { service, saved } = createWorld();
      service.execute(service.plan(deploy({ what: key("unit", "tank") }))!);
      const [unit] = saved("unit") as UnitObject[];
      const offenses = saved("offense") as OffenseObject[];
      expect(offenses.map((offense) => offense.identifier.id)).toEqual(unit.offenseIds);
      expect(offenses.every((offense) => offense.identifier.unitId === unit.identifier.id)).toBe(true);
    });

    it("saves an offense with a capacity of zero with no rounds", () => {
      const { service, saved } = createWorld();
      service.execute(service.plan(deploy({ what: key("unit", "zero") }))!);
      expect((saved("offense") as OffenseObject[]).map((offense) => offense.ammo)).toEqual([0]);
    });

    it("saves no offense objects for a kind with no offenses", () => {
      const { service, saved } = createWorld();
      service.execute(service.plan(deploy({ what: key("unit", "recon") }))!);
      expect(saved("offense")).toEqual([]);
    });

    it("saves the player whose turn it is, with the funds that are left", () => {
      const { service, saved } = createWorld();
      service.execute(service.plan(deploy())!);
      expect(saved("player")).toEqual([{ ...player("p1", 0, 10000), funds: 3000 }]); // a tank costs 7000
    });

    it("saves the player of the second turn, and not the first, on their turn", () => {
      const { service, saved } = createWorld();
      service.execute(service.plan(deploy({ gameTurn: 1, where: terrain(3, 4, "p2") }))!);
      expect(saved("player")).toEqual([{ ...player("p2", 1, 10000), funds: 3000 }]);
    });

    it("can use all the funds there are", () => {
      const { service, saved } = withFunds(7000);
      service.execute(service.plan(deploy())!);
      expect((saved("player")[0] as PlayerObject).funds).toBe(0);
    });

    it("leaves the funds of the other player as they were", () => {
      const { service, saved } = createWorld();
      service.execute(service.plan(deploy())!);
      expect((saved("player") as PlayerObject[]).map((saved) => saved.identifier.id)).toEqual(["p1"]);
    });

    it("saves the unit, then its movement, then its offenses, then the player", () => {
      const { service, saves } = createWorld();
      service.execute(service.plan(deploy())!);
      expect(saves.map((save) => save.scope)).toEqual(["unit", "movement", "offense", "offense", "player"]);
    });

    it("does not save the terrain", () => {
      const { service, saves } = createWorld();
      service.execute(service.plan(deploy())!);
      expect(saves.map((save) => save.scope)).not.toContain("terrain");
    });

    it("does not change the action it was given", () => {
      const { service } = createWorld();
      const actionInput = deploy();
      const before = structuredClone(actionInput);
      service.execute(service.plan(actionInput)!);
      expect(actionInput).toEqual(before);
    });

    it("keeps a square from being deployed on twice: the new unit is there", () => {
      const { service, saved } = withFunds(20000);
      service.execute(service.plan(deploy())!);
      expect(saved("unit")).toHaveLength(1);
      const again = deploy();
      expect(service.plan(again)).toBeUndefined();
    });

    it("gives the next unit the next id, and takes the funds that are left", () => {
      const { service, saved } = withFunds(9000);
      service.execute(service.plan(deploy({ where: terrain(1, 1), what: key("unit", "infantry") }))!);
      service.execute(service.plan(deploy({ where: terrain(2, 1), what: key("unit", "infantry") }))!);
      expect((saved("unit") as UnitObject[]).map((unit) => unit.identifier.id)).toEqual(["unit-1", "unit-2"]);
      expect((saved("player") as PlayerObject[]).map((player) => player.funds)).toEqual([8000, 7000]);
    });

    it("stops when the funds run out", () => {
      const { service, saved } = withFunds(1500);
      service.execute(service.plan(deploy({ where: terrain(1, 1), what: key("unit", "infantry") }))!);
      expect((saved("player")[0] as PlayerObject).funds).toBe(500);
      expect(service.plan(deploy({ where: terrain(2, 1), what: key("unit", "infantry") }))).toBeUndefined();
    });

    it.each([
      ["the player whose turn it is does not control the terrain", () => ({ world: createWorld(), actionInput: deploy({ gameTurn: 1 }) })],
      ["no player has the turn", () => ({ world: createWorld(), actionInput: deploy({ gameTurn: 5 }) })],
      ["the terrain is controlled by another player", () => ({ world: createWorld(), actionInput: deploy({ where: terrain(3, 4, "p2") }) })],
      ["the player cannot afford the unit", () => ({ world: withFunds(6999), actionInput: deploy() })],
      ["the terrain is in another game", () => ({ world: createWorld(), actionInput: deploy({ where: terrain(3, 4, "p1", "g2") }) })],
      ["a unit of the kind has an offense that is not defined", () => ({ world: createWorld(), actionInput: deploy({ what: key("unit", "artillery") }) })],
    ])("gives nothing and saves nothing when %s", (_reason, build) => {
      const { world: { service, saves }, actionInput } = build();
      expect(service.plan(actionInput)).toBeUndefined();
      expect(saves).toEqual([]);
    });

    it("saves nothing when a unit is on the terrain", () => {
      const { service, saves } = createWorld([existing("unit-1", 3, 4)]);
      expect(saves).toEqual([]);
    });
  });
});
