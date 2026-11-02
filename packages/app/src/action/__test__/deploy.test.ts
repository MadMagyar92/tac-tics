import type {
  BaseObject,
  Definition,
  DefinitionKey,
  DefinitionService,
  DeployAction,
  GameObject,
  Id,
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
});

const definitions: Definition[] = [
  offenseDefinition("cannon", 9),
  offenseDefinition("machine-gun", -1),
  offenseDefinition("empty", 0),
  kind("tank", 7000, 60, ["cannon", "machine-gun"]),
  kind("infantry", 1000, 99, ["machine-gun"]),
  kind("recon", 4000, 80, []),
  kind("free", 0, 10, []),
  kind("artillery", 6000, 50, ["cannon", "missing"]), // an offense that is not defined
  kind("zero", 1000, 5, ["empty"]), // an offense with a capacity of zero
];

type Held = { units: UnitObject[] };

/**
 * A definition service that knows `definitions` and remembers what it was asked for, and an object service that holds
 * `units` and remembers every save, in order. A saved unit joins the units held.
 */
function createWorld(units: UnitObject[] = []) {
  const known = new Map(definitions.map((definition) => [`${definition.definition.scope}:${definition.definition.name}`, definition]));
  const requested: DefinitionKey[] = [];
  const definitionService: DefinitionService = {
    get<D extends Definition>(requestedKey: DefinitionKey): D | undefined {
      requested.push(requestedKey);
      return known.get(`${requestedKey.scope}:${requestedKey.name}`) as D | undefined;
    },
  };

  const held: Held = { units: [...units] };
  const saves: { scope: string; object: unknown }[] = [];
  const unexpected = (what: string): never => {
    throw new Error(`unexpected ${what}`);
  };
  const objectService: ObjectService = {
    loadAll<O extends BaseObject<Id>>(scope: string) {
      if (scope !== "unit") {
        unexpected(`loadAll in the scope "${scope}"`);
      }
      return new Map(held.units.map((unit) => [unit.identifier, unit])) as unknown as Map<O["identifier"], O>;
    },
    load: () => unexpected("load"),
    delete: () => unexpected("delete"),
    save<O extends BaseObject<Id>>(scope: string, object: O) {
      saves.push({ scope, object });
      if (scope === "unit") {
        held.units.push(object as unknown as UnitObject);
      }
      return object.identifier;
    },
  };

  const saved = (scope: string) => saves.filter((save) => save.scope === scope).map((save) => save.object);
  return { service: new DeployActionService(definitionService, objectService), requested, saves, saved, held };
}

const game = (playerTurn = 0, id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn });

const player = (id = "p1", order = 0, funds = 10000, gameId = "g1"): PlayerObject => ({
  identifier: { id, gameId },
  definition: key("player", "orange-star"),
  order,
  funds,
});

/** The terrain at (x, y), controlled by `playerId`, or by nobody when it is null. */
const terrain = (x: number, y: number, playerId: string | null = "p1", gameId = "g1"): TerrainObject => ({
  identifier: { id: `base-${x}-${y}`, gameId },
  definition: key("terrain", "base"),
  position: { x, y },
  playerId: playerId ?? undefined,
});

const existing = (id: string, x: number, y: number, gameId = "g1", playerId = "p2"): UnitObject => ({
  identifier: { id, gameId },
  definition: key("unit", "recon"),
  position: { x, y },
  moved: false,
  acted: false,
  health: 100,
  fuel: 80,
  playerId,
  offenseIds: [],
});

type Options = { gameTurn?: number; gameId?: string; who?: PlayerObject; where?: TerrainObject; what?: DefinitionKey };

const deploy = ({ gameTurn = 0, gameId = "g1", who = player(), where = terrain(3, 4), what = key("unit", "tank") }: Options = {}): DeployAction => ({
  definition: DEPLOY_ACTION,
  game: game(gameTurn, gameId),
  terrain: where,
  player: who,
  unitDefinition: what,
});

describe("DEPLOY_ACTION", () => {
  it("is the action named deploy", () => {
    expect(DEPLOY_ACTION).toEqual({ scope: "action", name: "deploy" });
  });
});

describe("DeployActionService", () => {
  describe("canExecute", () => {
    it("is true for the current player, on a terrain the player controls, with the funds, and no unit there", () => {
      expect(createWorld().service.canExecute(deploy())).toBe(true);
    });

    describe("the turn", () => {
      it("is false when it is the turn of another player", () => {
        expect(createWorld().service.canExecute(deploy({ gameTurn: 1 }))).toBe(false);
      });

      it("is true for the player of the second turn, on their turn", () => {
        const who = player("p2", 1);
        expect(createWorld().service.canExecute(deploy({ gameTurn: 1, who, where: terrain(3, 4, "p2") }))).toBe(true);
      });
    });

    describe("the control of the terrain", () => {
      it("is false for a terrain another player controls", () => {
        expect(createWorld().service.canExecute(deploy({ where: terrain(3, 4, "p2") }))).toBe(false);
      });

      it("is false for a terrain nobody controls", () => {
        expect(createWorld().service.canExecute(deploy({ where: terrain(3, 4, null) }))).toBe(false);
      });
    });

    describe("the funds", () => {
      it.each([[7000, true], [7001, true], [10000, true], [6999, false], [0, false]])("with %i funds, a tank that costs 7000 is %s", (funds, allowed) => {
        expect(createWorld().service.canExecute(deploy({ who: player("p1", 0, funds) }))).toBe(allowed);
      });

      it("is true for a unit that costs nothing, with no funds", () => {
        expect(createWorld().service.canExecute(deploy({ who: player("p1", 0, 0), what: key("unit", "free") }))).toBe(true);
      });
    });

    describe("the units there are", () => {
      it("is false when a unit is on the terrain", () => {
        expect(createWorld([existing("unit-1", 3, 4)]).service.canExecute(deploy())).toBe(false);
      });

      it("is false when a unit of the same player is on the terrain", () => {
        expect(createWorld([existing("unit-1", 3, 4, "g1", "p1")]).service.canExecute(deploy())).toBe(false);
      });

      it("is true when the units are on other squares", () => {
        expect(createWorld([existing("unit-1", 3, 5), existing("unit-2", 4, 4), existing("unit-3", 0, 0)]).service.canExecute(deploy())).toBe(true);
      });

      it("is true when the unit on that square is in another game", () => {
        expect(createWorld([existing("unit-1", 3, 4, "g2")]).service.canExecute(deploy())).toBe(true);
      });
    });

    describe("the game", () => {
      it("is false when the player is in another game", () => {
        expect(createWorld().service.canExecute(deploy({ who: player("p1", 0, 10000, "g2") }))).toBe(false);
      });

      it("is false when the terrain is in another game", () => {
        expect(createWorld().service.canExecute(deploy({ where: terrain(3, 4, "p1", "g2") }))).toBe(false);
      });

      it("is false when the action is for another game than both are in", () => {
        expect(createWorld().service.canExecute(deploy({ gameId: "g2" }))).toBe(false);
      });
    });

    describe("what is deployed", () => {
      it("is false for a unit that is not defined", () => {
        expect(createWorld().service.canExecute(deploy({ what: key("unit", "ghost") }))).toBe(false);
      });

      it.each([["an offense", key("offense", "cannon")], ["a terrain", key("terrain", "base")]])("is false for the definition of %s, which is not a unit", (_name, what) => {
        const { service, requested } = createWorld();
        expect(service.canExecute(deploy({ what }))).toBe(false);
        expect(requested).toEqual([]);
      });

      it("is false for a unit one of whose offenses is not defined", () => {
        expect(createWorld().service.canExecute(deploy({ what: key("unit", "artillery") }))).toBe(false);
      });
    });

    describe("lookups", () => {
      it("asks for the unit, then for each of its offenses in order", () => {
        const { service, requested } = createWorld();
        service.canExecute(deploy());
        expect(requested).toEqual([key("unit", "tank"), key("offense", "cannon"), key("offense", "machine-gun")]);
      });

      it("asks for no offense when the player cannot deploy", () => {
        const { service, requested } = createWorld();
        service.canExecute(deploy({ who: player("p1", 0, 0) }));
        expect(requested).toEqual([key("unit", "tank")]);
      });

      it("asks for nothing when the game is not the one of the player and the terrain", () => {
        const { service, requested } = createWorld();
        service.canExecute(deploy({ gameId: "g2" }));
        expect(requested).toEqual([]);
      });
    });

    it("changes nothing and saves nothing", () => {
      const { service, saves } = createWorld();
      const action = deploy();
      const before = structuredClone(action);
      service.canExecute(action);
      expect(action).toEqual(before);
      expect(saves).toEqual([]);
    });
  });

  describe("preview", () => {
    it("gives the action with the new unit on the position of the terrain", () => {
      const result = createWorld().service.preview(deploy({ where: terrain(3, 4) }));
      expect(result.unit?.position).toEqual({ x: 3, y: 4 });
    });

    it("gives the player with the cost of the unit taken off their funds", () => {
      const result = createWorld().service.preview(deploy({ who: player("p1", 0, 10000) }));
      expect(result.player.funds).toBe(3000); // a tank costs 7000
    });

    it("can use all the funds there are", () => {
      expect(createWorld().service.preview(deploy({ who: player("p1", 0, 7000) })).player.funds).toBe(0);
    });

    it("makes the unit of the kind asked for, the player's, with the fuel and health a new unit has", () => {
      const result = createWorld().service.preview(deploy());
      expect(result.unit).toEqual({
        identifier: { id: "unit-1", gameId: "g1" },
        definition: key("unit", "tank"),
        position: { x: 3, y: 4 },
        moved: false,
        acted: false,
        health: 100,
        fuel: 60,
        playerId: "p1",
        offenseIds: ["offense-1", "offense-2"],
      });
    });

    it.each([["infantry", 99], ["recon", 80], ["artillery-less tank", 60]])("fills the tank of a %s: %i fuel", (name, fuel) => {
      const what = key("unit", name === "artillery-less tank" ? "tank" : name);
      expect(createWorld().service.preview(deploy({ what })).unit?.fuel).toBe(fuel);
    });

    it("gives the unit offenses for each offense of its kind, and none for a kind with none", () => {
      expect(createWorld().service.preview(deploy({ what: key("unit", "infantry") })).unit?.offenseIds).toEqual(["offense-1"]);
      expect(createWorld().service.preview(deploy({ what: key("unit", "recon") })).unit?.offenseIds).toEqual([]);
    });

    it("gives the unit its own position, not the terrain's", () => {
      const where = terrain(3, 4);
      const result = createWorld().service.preview(deploy({ where }));
      expect(result.unit?.position).not.toBe(where.position);
      result.unit!.position.x = 99;
      expect(where.position).toEqual({ x: 3, y: 4 });
    });

    it("gives the unit its own definition key, not the one of the action", () => {
      const what = key("unit", "tank");
      const result = createWorld().service.preview(deploy({ what }));
      expect(result.unit?.definition).toEqual(what);
      expect(result.unit?.definition).not.toBe(what);
    });

    describe("the id of the unit", () => {
      const idAfter = (units: UnitObject[]) => createWorld(units).service.preview(deploy()).unit?.identifier.id;

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

    describe("the offenses of the unit", () => {
      it("are not saved, only the ids are given", () => {
        const { service, saves } = createWorld();
        service.preview(deploy());
        expect(saves).toEqual([]);
      });
    });

    it("saves nothing", () => {
      const { service, saves } = createWorld();
      service.preview(deploy());
      expect(saves).toEqual([]);
    });

    it("leaves the rest of the action, and the terrain, as they were", () => {
      const action = deploy();
      const result = createWorld().service.preview(action);
      expect(result).toEqual({ ...action, player: { ...action.player, funds: 3000 }, unit: result.unit });
      expect(result.terrain).toBe(action.terrain);
      expect(result.game).toBe(action.game);
    });

    it("does not change the action it was given", () => {
      const action = deploy();
      const before = structuredClone(action);
      createWorld().service.preview(action);
      expect(action).toEqual(before);
      expect(action.unit).toBeUndefined();
    });

    it("gives the same action every time, since nothing is spent", () => {
      const { service } = createWorld();
      const action = deploy({ who: player("p1", 0, 7000) });
      expect(service.preview(action)).toEqual(service.preview(action));
      expect(service.canExecute(action)).toBe(true);
    });

    it.each([
      ["it is not the player's turn", () => deploy({ gameTurn: 1 })],
      ["the terrain is controlled by another player", () => deploy({ where: terrain(3, 4, "p2") })],
      ["the terrain is controlled by nobody", () => deploy({ where: terrain(3, 4, null) })],
      ["the player cannot afford the unit", () => deploy({ who: player("p1", 0, 6999) })],
      ["the unit is not defined", () => deploy({ what: key("unit", "ghost") })],
      ["the player is in another game", () => deploy({ who: player("p1", 0, 10000, "g2") })],
    ])("gives the action as it is when %s", (_reason, build) => {
      const { service, saves } = createWorld();
      const action = build();
      expect(service.canExecute(action)).toBe(false);
      expect(service.preview(action)).toBe(action);
      expect(saves).toEqual([]);
    });

    it("gives the action as it is when a unit is on the terrain", () => {
      const { service } = createWorld([existing("unit-1", 3, 4)]);
      const action = deploy();
      expect(service.preview(action)).toBe(action);
    });
  });

  describe("execute", () => {
    it("gives what preview gives", () => {
      const action = () => deploy({ what: key("unit", "infantry"), who: player("p1", 0, 2500) });
      const existingUnits = () => [existing("unit-1", 0, 0)];
      expect(createWorld(existingUnits()).service.execute(action())).toEqual(createWorld(existingUnits()).service.preview(action()));
    });

    it("saves the new unit, as the action gives it", () => {
      const { service, saved } = createWorld();
      const result = service.execute(deploy());
      expect(saved("unit")).toHaveLength(1);
      expect(saved("unit")[0]).toBe(result.unit);
    });

    it("saves an offense object for each offense of the kind, full, for the new unit", () => {
      const { service, saved } = createWorld();
      service.execute(deploy());
      expect(saved("offense")).toEqual([
        { identifier: { id: "offense-1", gameId: "g1", unitId: "unit-1" }, definition: key("offense", "cannon"), ammo: 9 },
        { identifier: { id: "offense-2", gameId: "g1", unitId: "unit-1" }, definition: key("offense", "machine-gun"), ammo: -1 },
      ] satisfies OffenseObject[]);
    });

    it("gives the offense objects the ids that the unit lists, and the unit's id", () => {
      const { service, saved } = createWorld();
      const result = service.execute(deploy({ what: key("unit", "tank") }));
      const offenses = saved("offense") as OffenseObject[];
      expect(offenses.map((offense) => offense.identifier.id)).toEqual(result.unit?.offenseIds);
      expect(offenses.every((offense) => offense.identifier.unitId === result.unit?.identifier.id)).toBe(true);
    });

    it("saves an offense with a capacity of zero with no rounds", () => {
      const { service, saved } = createWorld();
      service.execute(deploy({ what: key("unit", "zero") }));
      expect((saved("offense") as OffenseObject[]).map((offense) => offense.ammo)).toEqual([0]);
    });

    it("saves no offense objects for a kind with no offenses", () => {
      const { service, saved } = createWorld();
      service.execute(deploy({ what: key("unit", "recon") }));
      expect(saved("offense")).toEqual([]);
    });

    it("saves the player, with the funds that are left", () => {
      const { service, saved } = createWorld();
      const result = service.execute(deploy({ who: player("p1", 0, 10000) }));
      expect(saved("player")).toHaveLength(1);
      expect(saved("player")[0]).toBe(result.player);
      expect((saved("player")[0] as PlayerObject).funds).toBe(3000);
      expect((saved("player")[0] as PlayerObject).identifier).toEqual({ id: "p1", gameId: "g1" });
    });

    it("saves the unit, then its offenses, then the player", () => {
      const { service, saves } = createWorld();
      service.execute(deploy());
      expect(saves.map((save) => save.scope)).toEqual(["unit", "offense", "offense", "player"]);
    });

    it("does not save the terrain", () => {
      const { service, saves } = createWorld();
      service.execute(deploy());
      expect(saves.map((save) => save.scope)).not.toContain("terrain");
    });

    it("does not change the action it was given", () => {
      const { service } = createWorld();
      const action = deploy();
      const before = structuredClone(action);
      service.execute(action);
      expect(action).toEqual(before);
    });

    it("keeps a square from being deployed on twice: the new unit is there", () => {
      const { service } = createWorld();
      const first = service.execute(deploy({ who: player("p1", 0, 20000) }));
      expect(first.unit).toBeDefined();
      const again = deploy({ who: first.player });
      expect(service.canExecute(again)).toBe(false);
      expect(service.execute(again)).toBe(again);
    });

    it("gives the next unit the next id, and takes the funds that are left", () => {
      const { service } = createWorld();
      const first = service.execute(deploy({ who: player("p1", 0, 9000), where: terrain(1, 1), what: key("unit", "infantry") }));
      const second = service.execute(deploy({ who: first.player, where: terrain(2, 1), what: key("unit", "infantry") }));
      expect([first.unit?.identifier.id, second.unit?.identifier.id]).toEqual(["unit-1", "unit-2"]);
      expect([first.player.funds, second.player.funds]).toEqual([8000, 7000]);
    });

    it("stops when the funds run out", () => {
      const { service } = createWorld();
      const first = service.execute(deploy({ who: player("p1", 0, 1500), where: terrain(1, 1), what: key("unit", "infantry") }));
      const next = deploy({ who: first.player, where: terrain(2, 1), what: key("unit", "infantry") });
      expect(first.player.funds).toBe(500);
      expect(service.canExecute(next)).toBe(false);
    });

    it.each([
      ["it is not the player's turn", () => deploy({ gameTurn: 1 })],
      ["the terrain is controlled by another player", () => deploy({ where: terrain(3, 4, "p2") })],
      ["the player cannot afford the unit", () => deploy({ who: player("p1", 0, 6999) })],
      ["the terrain is in another game", () => deploy({ where: terrain(3, 4, "p1", "g2") })],
      ["a unit of the kind has an offense that is not defined", () => deploy({ what: key("unit", "artillery") })],
    ])("returns the action as it is and saves nothing when %s", (_reason, build) => {
      const { service, saves } = createWorld();
      const action = build();
      expect(service.canExecute(action)).toBe(false);
      expect(service.execute(action)).toBe(action);
      expect(saves).toEqual([]);
    });

    it("saves nothing when a unit is on the terrain", () => {
      const { service, saves } = createWorld([existing("unit-1", 3, 4)]);
      const action = deploy();
      expect(service.execute(action)).toBe(action);
      expect(saves).toEqual([]);
    });
  });
});
