import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import type {
  ActionService,
  AttackActionInput,
  AttackActionOutput,
  AttackActionPlan,
  AttackActionResult,
  BaseObject,
  Definition,
  DefinitionKey,
  DefinitionService,
  GameObject,
  GameReferenceId,
  Id,
  ObjectService,
  OffenseDefinition,
  OffenseObject,
  UnitObject,
} from "@tac-tics/api";
import { ATTACK_ACTION, AttackActionService, ObjectServiceImpl } from "@tac-tics/app";
import { createStubActionService, realAppConfig } from "../../../test/config";
import { attackRouter } from "../unit";

const key = (scope: string, name: string): DefinitionKey => ({ scope, name });

const game = (id = "g1"): GameObject => ({ identifier: { id }, definition: key("game", "2-player"), turn: 0, playerTurn: 0, mapDefinition: key("map", "m1") });

type UnitOptions = { gameId?: string; playerId?: string; x?: number; y?: number; health?: number; offenseIds?: string[] };

const unit = (
  id: string,
  definition: string,
  { gameId = "g1", playerId = "p2", x = 0, y = 0, health = 100, offenseIds = [] }: UnitOptions = {},
): UnitObject => ({
  identifier: { id, gameId },
  definition: key("unit", definition),
  position: { x, y },
  moved: false,
  acted: false,
  health,
  playerId,
  movementId: "movement-1",
  offenseIds,
});

const unitKey = (id: GameReferenceId) => `${id.gameId}:${id.id}`;

/**
 * An object service, started on the repo's config but with exactly `units` for units and no offenses, that remembers
 * which units were saved.
 */
function createUnitService(units: UnitObject[]) {
  const service = new ObjectServiceImpl(realAppConfig);
  for (const scope of ["unit", "offense"]) {
    for (const identifier of [...service.loadAll(scope).keys()]) service.delete(scope, identifier);
  }
  for (const unit of units) service.save<UnitObject>("unit", unit);

  const saved: UnitObject[] = [];
  const save = service.save.bind(service);
  service.save = <O extends BaseObject<Id>>(scope: string, object: O) => {
    if (scope === "unit") saved.push(object as unknown as UnitObject);
    return save(scope, object);
  };
  return {
    service,
    saved,
    /** The units held, by game and id. */
    get stored() {
      return new Map([...service.loadAll<UnitObject>("unit").values()].map((u) => [unitKey(u.identifier), u]));
    },
  };
}

/**
 * Stands in for the routers mounted before the attack router: it loads `res.locals.game` and `res.locals.unit`
 * from the path, then hands over to the attack router.
 */
function createApp(attackService: ActionService<AttackActionInput, AttackActionPlan, AttackActionResult, AttackActionOutput>, objectService: ObjectService) {
  return express().use(
    "/game/:gameId/unit/:unitId/attack",
    (req, res, next) => {
      const { gameId, unitId } = req.params as Record<string, string>;
      res.locals.game = game(gameId);
      res.locals.unit = objectService.load<UnitObject>("unit", { id: unitId, gameId });
      next();
    },
    attackRouter(attackService, objectService),
  );
}

/** An attack service that accepts what `accepts` says and always gives 10 damage with the offense "gun". It remembers every call. */
function createStubAttackService(accepts: (actionInput: AttackActionInput) => boolean = () => true) {
  const asked: AttackActionInput[] = [];
  const executed: AttackActionInput[] = [];
  const outputOf = ({ definition, unit, target }: AttackActionInput): AttackActionOutput => ({
    definition,
    unit,
    target: { ...target, health: target.health - 10 },
    offense: { identifier: { id: "gun", gameId: unit.identifier.gameId, unitId: unit.identifier.id }, definition: key("offense", "gun"), ammo: 1 },
  });
  const service = createStubActionService<AttackActionInput, AttackActionPlan, AttackActionResult, AttackActionOutput>({
    canPlan(actionInput) {
      asked.push(actionInput);
      return accepts(actionInput);
    },
    execute(actionInput) {
      executed.push(actionInput);
      return outputOf(actionInput);
    },
  });
  return { service, asked, executed };
}

/** Player p1's attacker, an enemy and an ally of it in game g1, and two units that are not in g1's reach. */
const roster = () => [
  unit("attacker", "tank", { playerId: "p1" }),
  unit("enemy-1", "recon", { playerId: "p2" }),
  unit("ally", "recon", { playerId: "p1" }),
  unit("enemy-2", "recon", { playerId: "p2" }),
  unit("elsewhere", "recon", { playerId: "p2", gameId: "g2" }),
];
const enemiesOnly = (actionInput: AttackActionInput) => actionInput.target.playerId !== actionInput.unit.playerId;

describe("attackRouter", () => {
  describe("GET /game/:gameId/unit/:unitId/attack", () => {
    it("lists an attack for each other unit in the game that plan accepts, built from the request's game and unit", async () => {
      const units = createUnitService(roster());
      const { service } = createStubAttackService(enemiesOnly);

      const res = await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { definition: ATTACK_ACTION, game: game(), unit: roster()[0], target: roster()[1] },
        { definition: ATTACK_ACTION, game: game(), unit: roster()[0], target: roster()[3] },
      ]);
    });

    it("asks plan about every other unit of the game, and about no one else", async () => {
      const units = createUnitService(roster());
      const { service, asked } = createStubAttackService();

      await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack");

      expect(asked.map((actionInput) => actionInput.target.identifier.id)).toEqual(["enemy-1", "ally", "enemy-2"]);
    });

    it("lists everything plan accepts, even units of the same player: the rules are the service's", async () => {
      const units = createUnitService(roster());
      const { service } = createStubAttackService(() => true);

      const res = await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack");

      expect(res.body.map((actionInput: AttackActionInput) => actionInput.target.identifier.id)).toEqual(["enemy-1", "ally", "enemy-2"]);
    });

    it("lists nothing when plan accepts no one", async () => {
      const units = createUnitService(roster());
      const { service } = createStubAttackService(() => false);

      const res = await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("lists nothing when the unit is alone in its game", async () => {
      const units = createUnitService([unit("attacker", "tank", { playerId: "p1" }), unit("elsewhere", "recon", { gameId: "g2" })]);
      const { service, asked } = createStubAttackService();

      const res = await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack");

      expect(res.body).toEqual([]);
      expect(asked).toEqual([]);
    });

    it("executes and saves nothing", async () => {
      const units = createUnitService(roster());
      const { service, executed } = createStubAttackService();

      await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack");

      expect(executed).toEqual([]);
      expect(units.saved).toEqual([]);
    });
  });

  describe("GET /game/:gameId/unit/:unitId/attack/:targetId", () => {
    it("returns the attack on that target when plan accepts it", async () => {
      const units = createUnitService(roster());
      const { service } = createStubAttackService(enemiesOnly);

      const res = await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack/enemy-2");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ definition: ATTACK_ACTION, game: game(), unit: roster()[0], target: roster()[3] });
    });

    it("asks plan about exactly that attack", async () => {
      const units = createUnitService(roster());
      const { service, asked } = createStubAttackService();

      await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack/enemy-2");

      expect(asked).toEqual([{ definition: ATTACK_ACTION, game: game(), unit: roster()[0], target: roster()[3] }]);
    });

    it("returns 404 when plan does not accept the attack", async () => {
      const units = createUnitService(roster());
      const { service } = createStubAttackService(enemiesOnly);

      const res = await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack/ally");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit ally cannot be attacked by unit attacker" });
    });

    it("returns 404 for an unknown target", async () => {
      const units = createUnitService(roster());
      const { service, asked } = createStubAttackService();

      const res = await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack/nope");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit nope not found in game g1" });
      expect(asked).toEqual([]);
    });

    it("does not find a target in another game", async () => {
      const units = createUnitService(roster());
      const { service } = createStubAttackService();

      const res = await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack/elsewhere");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit elsewhere not found in game g1" });
    });

    it("executes and saves nothing", async () => {
      const units = createUnitService(roster());
      const { service, executed } = createStubAttackService();

      await request(createApp(service, units.service)).get("/game/g1/unit/attacker/attack/enemy-1");

      expect(executed).toEqual([]);
      expect(units.saved).toEqual([]);
    });
  });

  describe("POST /game/:gameId/unit/:unitId/attack/:targetId", () => {
    it("executes the attack built from the request's game, unit and target", async () => {
      const units = createUnitService(roster());
      const { service, executed } = createStubAttackService();

      await request(createApp(service, units.service)).post("/game/g1/unit/attacker/attack/enemy-1");

      expect(executed).toEqual([{ definition: ATTACK_ACTION, game: game(), unit: roster()[0], target: roster()[1] }]);
    });

    it("responds with the output the service returned", async () => {
      const units = createUnitService(roster());
      const { service } = createStubAttackService();

      const res = await request(createApp(service, units.service)).post("/game/g1/unit/attacker/attack/enemy-1");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ definition: ATTACK_ACTION, target: { identifier: { id: "enemy-1" }, health: 90 }, offense: { identifier: { id: "gun" } } });
    });

    it("leaves saving to the attack service: it saves no unit itself", async () => {
      const units = createUnitService(roster());
      const { service } = createStubAttackService();

      await request(createApp(service, units.service)).post("/game/g1/unit/attacker/attack/enemy-1");

      expect(units.saved).toEqual([]);
    });

    it("changes no stored unit itself, and deletes none", async () => {
      const units = createUnitService(roster());
      const { service } = createStubAttackService();

      await request(createApp(service, units.service)).post("/game/g1/unit/attacker/attack/enemy-1");

      expect([...units.stored.values()]).toEqual(roster());
    });

    it("returns 409 and executes and saves nothing when plan does not accept the attack", async () => {
      const units = createUnitService(roster());
      const { service, executed } = createStubAttackService(enemiesOnly);

      const res = await request(createApp(service, units.service)).post("/game/g1/unit/attacker/attack/ally");

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Unit ally cannot be attacked by unit attacker" });
      expect(executed).toEqual([]);
      expect(units.saved).toEqual([]);
    });

    it("returns 404 for an unknown target, and executes and saves nothing", async () => {
      const units = createUnitService(roster());
      const { service, asked, executed } = createStubAttackService();

      const res = await request(createApp(service, units.service)).post("/game/g1/unit/attacker/attack/nope");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit nope not found in game g1" });
      expect(asked).toEqual([]);
      expect(executed).toEqual([]);
      expect(units.saved).toEqual([]);
    });

    it("does not find a target in another game", async () => {
      const units = createUnitService(roster());
      const { service, executed } = createStubAttackService();

      const res = await request(createApp(service, units.service)).post("/game/g1/unit/attacker/attack/elsewhere");

      expect(res.status).toBe(404);
      expect(executed).toEqual([]);
    });
  });

  it("has no other routes: only GET on the list and GET and POST on a target", async () => {
    const units = createUnitService(roster());
    const { service } = createStubAttackService();
    const app = createApp(service, units.service);

    expect((await request(app).post("/game/g1/unit/attacker/attack")).status).toBe(404);
    expect((await request(app).put("/game/g1/unit/attacker/attack/enemy-1")).status).toBe(404);
    expect((await request(app).delete("/game/g1/unit/attacker/attack/enemy-1")).status).toBe(404);
    expect(units.saved).toEqual([]);
  });

  describe("with the real AttackActionService", () => {
    const offenseDefinitions: OffenseDefinition[] = [
      { definition: key("offense", "tank1"), ammoMax: 9, rangeMin: 1, rangeMax: 1, damage: [{ unit: key("unit", "recon"), damage: 85 }] }, // cannon
      { definition: key("offense", "tank2"), ammoMax: 99, rangeMin: 1, rangeMax: 1, damage: [{ unit: key("unit", "recon"), damage: 40 }] }, // machine gun
    ];

    /** The attacker is a tank with a cannon holding `cannonRounds` and a machine gun holding 99. */
    function createWorld(cannonRounds: number, otherUnits: UnitObject[]) {
      const units = createUnitService([unit("attacker", "tank", { playerId: "p1", offenseIds: ["cannon", "mg"] }), ...otherUnits]);

      const known = new Map<string, Definition>(offenseDefinitions.map((d) => [`${d.definition.scope}:${d.definition.name}`, d]));
      const definitionService: DefinitionService = {
        get: <D extends Definition>(requested: DefinitionKey) => known.get(`${requested.scope}:${requested.name}`) as D | undefined,
      };

      for (const [id, definition, ammo] of [
        ["cannon", "tank1", cannonRounds],
        ["mg", "tank2", 99],
      ] as const) {
        units.service.save<OffenseObject>("offense", {
          identifier: { id, gameId: "g1", unitId: "attacker" },
          definition: key("offense", definition),
          ammo,
        });
      }

      const app = createApp(new AttackActionService(definitionService, units.service), units.service);
      return {
        app,
        units,
        rounds: (id: string) => units.service.load<OffenseObject>("offense", { id, gameId: "g1", unitId: "attacker" })?.ammo,
      };
    }

    const enemy = (id: string, options: UnitOptions = {}) => unit(id, "recon", { playerId: "p2", x: 1, ...options });

    it("lists only the units the attacker can reach, that are not its own, and that it can damage", async () => {
      const { app } = createWorld(9, [
        enemy("close"),
        enemy("far", { x: 5 }),
        unit("ally", "recon", { playerId: "p1", x: 1 }),
        enemy("elsewhere", { gameId: "g2" }),
        unit("tank-target", "tank", { playerId: "p2", x: 1 }), // neither weapon has damage against a tank
      ]);

      const res = await request(app).get("/game/g1/unit/attacker/attack");

      expect(res.status).toBe(200);
      expect(res.body.map((actionInput: AttackActionInput) => actionInput.target.identifier.id)).toEqual(["close"]);
    });

    it("carries the attack out: lowers the target's health in the unit store and spends a round of the cannon", async () => {
      const { app, units, rounds } = createWorld(9, [enemy("close")]);

      const res = await request(app).post("/game/g1/unit/attacker/attack/close");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ definition: ATTACK_ACTION, target: { identifier: { id: "close" }, health: 15 }, offense: { identifier: { id: "cannon" }, ammo: 8 } });
      expect(units.stored.get("g1:close")?.health).toBe(15);
      expect(rounds("cannon")).toBe(8);
      expect(rounds("mg")).toBe(99);
    });

    it("removes a target the attack takes below zero health from the unit store", async () => {
      const { app, units } = createWorld(9, [enemy("close", { health: 30 })]);

      const res = await request(app).post("/game/g1/unit/attacker/attack/close");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ definition: ATTACK_ACTION, target: { identifier: { id: "close" }, health: -55 }, offense: { identifier: { id: "cannon" } } });
      expect(units.stored.has("g1:close")).toBe(false);
      expect(units.stored.has("g1:attacker")).toBe(true);
    });

    it("removes the offenses of a target the attack destroys, and no other offense", async () => {
      const { app, units } = createWorld(9, [enemy("close", { health: 30, offenseIds: ["gun-1", "gun-2"] })]);
      const offenseOf = (unitId: string, id: string) => ({ identifier: { id, gameId: "g1", unitId }, definition: key("offense", "tank2"), ammo: 99 });
      for (const id of ["gun-1", "gun-2"]) {
        units.service.save<OffenseObject>("offense", offenseOf("close", id));
      }
      units.service.save<OffenseObject>("offense", offenseOf("elsewhere", "gun-1"));

      await request(app).post("/game/g1/unit/attacker/attack/close");

      const offenseLeft = (unitId: string, id: string) => units.service.load<OffenseObject>("offense", { id, gameId: "g1", unitId });
      expect(offenseLeft("close", "gun-1")).toBeUndefined();
      expect(offenseLeft("close", "gun-2")).toBeUndefined();
      expect(offenseLeft("elsewhere", "gun-1")).toBeDefined();
      expect(offenseLeft("attacker", "cannon")).toBeDefined();
    });

    it("no longer finds a target that was destroyed", async () => {
      const { app } = createWorld(9, [enemy("close", { health: 30 })]);

      await request(app).post("/game/g1/unit/attacker/attack/close");
      const res = await request(app).get("/game/g1/unit/attacker/attack/close");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit close not found in game g1" });
    });

    it("removes a target the attack brings to exactly zero health", async () => {
      const { app, units } = createWorld(9, [enemy("close", { health: 85 })]);

      await request(app).post("/game/g1/unit/attacker/attack/close");

      expect(units.stored.has("g1:close")).toBe(false);
    });

    it("keeps a target the attack leaves with 1 health", async () => {
      const { app, units } = createWorld(9, [enemy("close", { health: 86 })]);

      await request(app).post("/game/g1/unit/attacker/attack/close");

      expect(units.stored.get("g1:close")?.health).toBe(1);
    });

    it("marks the attacker as acted in the unit store, and refuses its next attack", async () => {
      const { app, units } = createWorld(9, [enemy("first"), enemy("second", { y: 1, x: 0 })]);

      await request(app).post("/game/g1/unit/attacker/attack/first");
      const res = await request(app).post("/game/g1/unit/attacker/attack/second");

      expect(units.stored.get("g1:attacker")?.acted).toBe(true);
      expect(res.status).toBe(409);
      expect(units.stored.get("g1:second")?.health).toBe(100);
    });

    it("spends the last round of the cannon", async () => {
      const { app, units, rounds } = createWorld(1, [enemy("close")]);

      await request(app).post("/game/g1/unit/attacker/attack/close");

      expect(units.stored.get("g1:close")?.health).toBe(15);
      expect(rounds("cannon")).toBe(0);
    });

    it("falls back to the machine gun when the cannon is empty, spending a round of the machine gun", async () => {
      const { app, units, rounds } = createWorld(0, [enemy("close")]);

      const res = await request(app).post("/game/g1/unit/attacker/attack/close");

      expect(res.body).toMatchObject({ definition: ATTACK_ACTION, target: { identifier: { id: "close" }, health: 60 }, offense: { identifier: { id: "mg" } } });
      expect(units.stored.get("g1:close")?.health).toBe(60);
      expect(rounds("cannon")).toBe(0);
      expect(rounds("mg")).toBe(98);
    });

    it("refuses an attack on a unit out of reach, changing nothing", async () => {
      const { app, units, rounds } = createWorld(9, [enemy("far", { x: 5 })]);

      const res = await request(app).post("/game/g1/unit/attacker/attack/far");

      expect(res.status).toBe(409);
      expect(units.saved).toEqual([]);
      expect(units.stored.get("g1:far")?.health).toBe(100);
      expect(rounds("cannon")).toBe(9);
    });

    it("refuses an attack on an ally, changing nothing", async () => {
      const { app, units } = createWorld(9, [unit("ally", "recon", { playerId: "p1", x: 1 })]);

      const res = await request(app).post("/game/g1/unit/attacker/attack/ally");

      expect(res.status).toBe(409);
      expect(units.saved).toEqual([]);
    });
  });
});
