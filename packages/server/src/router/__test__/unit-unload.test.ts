import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  type ActionService,
  type GameObject,
  Scope,
  type TerrainObject,
  type UnitObject,
  type UnloadActionInput,
  type UnloadActionOutput,
  type UnloadActionPlan,
  type UnloadActionResult,
} from "@tac-tics/api";
import { isInGame, ObjectServiceImpl, UNLOAD_ACTION } from "@tac-tics/app";
import { createStubActionService, realAppConfig } from "../../../test/config";
import { unloadRouter } from "../unit";

const unit = (id: string, name: string, transportIds: string[] = [], gameId = "game-1"): UnitObject => ({
  identifier: { id, gameId },
  definition: { scope: Scope.Unit, name },
  position: { x: 2, y: 4 },
  moved: false,
  acted: false,
  health: 100,
  playerId: "player-1",
  movementId: "movement-1",
  offenseIds: [],
  transportIds,
});

/** An object service on the repo's config that also holds the carrier apc-1, the two units it transports, a unit another carrier transports, and a unit of another game whose id it transports. */
function createObjectService() {
  const objects = new ObjectServiceImpl(realAppConfig);
  for (const held of [
    unit("apc-1", "apc", ["rider-1", "rider-2", "elsewhere"]),
    unit("rider-1", "infantry"),
    unit("rider-2", "mech"),
    unit("lander-1", "lander", ["stranger"]),
    unit("stranger", "infantry"),
    unit("elsewhere", "infantry", [], "game-2"),
  ]) {
    objects.save<UnitObject>(Scope.Unit, held);
  }
  return objects;
}

function createApp(unloadService: ActionService<UnloadActionInput, UnloadActionPlan, UnloadActionResult, UnloadActionOutput>, objectService: ObjectServiceImpl) {
  return express().use(
    "/game/:gameId/unit/:unitId/unload",
    (req, res, next) => {
      const { gameId, unitId } = req.params as Record<string, string>;
      res.locals.game = objectService.load<GameObject>(Scope.Game, { id: gameId });
      res.locals.unit = objectService.load<UnitObject>(Scope.Unit, { id: unitId, gameId });
      next();
    },
    unloadRouter(unloadService, objectService),
  );
}

/** An unload service that accepts what `accepts` says, and gives the carrier as acted, no longer transporting the unit, and the unit on the terrain. */
function createStubUnloadService(accepts: (unload: UnloadActionInput) => boolean = () => true) {
  const asked: UnloadActionInput[] = [];
  const previewed: UnloadActionInput[] = [];
  const executed: UnloadActionInput[] = [];
  const resultOf = ({ unit: carrier, target, terrain }: UnloadActionInput): UnloadActionResult => ({
    unit: { ...carrier, acted: true, transportIds: carrier.transportIds.filter((id) => id !== target.identifier.id) },
    target: { ...target, position: { ...terrain.position } },
  });
  const outputOf = (unload: UnloadActionInput): UnloadActionOutput => ({ definition: unload.definition, ...resultOf(unload) });
  const service = createStubActionService<UnloadActionInput, UnloadActionPlan, UnloadActionResult, UnloadActionOutput>({
    canPlan(unload) {
      asked.push(unload);
      return accepts(unload);
    },
    preview(unload) {
      previewed.push(unload);
      return resultOf(unload);
    },
    execute(unload) {
      executed.push(unload);
      return outputOf(unload);
    },
  });
  return { service, asked, previewed, executed };
}

const only = (...pairs: [string, string][]) => (unload: UnloadActionInput) =>
  pairs.some(([targetId, terrainId]) => unload.target.identifier.id === targetId && unload.terrain.identifier.id === terrainId);

describe("unloadRouter", () => {
  describe("GET /game/:gameId/unit/:unitId/unload", () => {
    it("lists an unload for each unit the carrier transports and each terrain in the game that plan accepts, built from the request's game and carrier", async () => {
      const objects = createObjectService();
      const { service } = createStubUnloadService(only(["rider-1", "terrain-061"], ["rider-2", "terrain-063"]));
      const carrier = objects.load<UnitObject>(Scope.Unit, { id: "apc-1", gameId: "game-1" });

      const res = await request(createApp(service, objects)).get("/game/game-1/unit/apc-1/unload");

      expect(res.status).toBe(200);
      expect(res.body.map((unload: UnloadActionInput) => [unload.target.identifier.id, unload.terrain.identifier.id])).toEqual([
        ["rider-1", "terrain-061"],
        ["rider-2", "terrain-063"],
      ]);
      for (const unload of res.body) {
        expect(unload.definition).toEqual(UNLOAD_ACTION);
        expect(unload.game.identifier).toEqual({ id: "game-1" });
        expect(unload.unit).toEqual(carrier);
      }
    });

    it("lists none when plan accepts none", async () => {
      const { service } = createStubUnloadService(() => false);
      const res = await request(createApp(service, createObjectService())).get("/game/game-1/unit/apc-1/unload");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("asks plan only about the units the carrier transports in the game, for every terrain of the game", async () => {
      const { service, asked } = createStubUnloadService();

      await request(createApp(service, createObjectService())).get("/game/game-1/unit/apc-1/unload");

      expect(asked).toHaveLength(300);
      expect([...new Set(asked.map((unload) => unload.target.identifier.id))]).toEqual(["rider-1", "rider-2"]);
      expect(asked.every((unload) => isInGame("game-1", "map-1", unload.terrain.identifier))).toBe(true);
    });

    it("asks nothing for a unit that holds no units", async () => {
      const { service, asked } = createStubUnloadService();
      const res = await request(createApp(service, createObjectService())).get("/game/game-1/unit/unit-1/unload");
      expect(res.body).toEqual([]);
      expect(asked).toEqual([]);
    });

    it("changes nothing: it only asks plan", async () => {
      const { service, previewed, executed } = createStubUnloadService();
      await request(createApp(service, createObjectService())).get("/game/game-1/unit/apc-1/unload");
      expect(previewed).toEqual([]);
      expect(executed).toEqual([]);
    });
  });

  describe("GET /game/:gameId/unit/:unitId/unload/:targetId/:terrainId", () => {
    it("gives the result of previewing the unload built from the request's game, carrier, unit and terrain", async () => {
      const objects = createObjectService();
      const { service, asked, previewed } = createStubUnloadService();
      const carrier = objects.load<UnitObject>(Scope.Unit, { id: "apc-1", gameId: "game-1" })!;
      const target = objects.load<UnitObject>(Scope.Unit, { id: "rider-1", gameId: "game-1" })!;
      const terrain = objects.load<TerrainObject>(Scope.Terrain, { id: "terrain-061", mapId: "map-1" })!;

      const res = await request(createApp(service, objects)).get("/game/game-1/unit/apc-1/unload/rider-1/terrain-061");

      const unload = { definition: UNLOAD_ACTION, game: objects.load(Scope.Game, { id: "game-1" }), unit: carrier, target, terrain };
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ unit: { ...carrier, acted: true, transportIds: ["rider-2", "elsewhere"] }, target: { ...target, position: terrain.position } });
      expect(asked).toEqual([unload]);
      expect(previewed).toEqual([unload]);
    });

    it("executes nothing", async () => {
      const { service, executed } = createStubUnloadService();
      await request(createApp(service, createObjectService())).get("/game/game-1/unit/apc-1/unload/rider-1/terrain-061");
      expect(executed).toEqual([]);
    });

    it("returns 404 and previews nothing when plan does not accept the unload", async () => {
      const { service, previewed } = createStubUnloadService(() => false);
      const res = await request(createApp(service, createObjectService())).get("/game/game-1/unit/apc-1/unload/rider-1/terrain-061");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit rider-1 cannot be unloaded by unit apc-1 onto terrain terrain-061" });
      expect(previewed).toEqual([]);
    });

    it.each([
      ["an unknown unit", "nope/terrain-061", "Unit nope not found in game game-1"],
      ["a unit of another game", "elsewhere/terrain-061", "Unit elsewhere not found in game game-1"],
      ["an unknown terrain", "rider-1/nope", "Terrain nope not found in game game-1"],
    ])("returns 404 for %s, and asks nothing", async (_what, path, error) => {
      const { service, asked } = createStubUnloadService();
      const res = await request(createApp(service, createObjectService())).get(`/game/game-1/unit/apc-1/unload/${path}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error });
      expect(asked).toEqual([]);
    });
  });

  describe("POST /game/:gameId/unit/:unitId/unload/:targetId/:terrainId", () => {
    it("executes the unload built from the request's game, carrier, unit and terrain, and gives the output the service returned", async () => {
      const { service, executed } = createStubUnloadService();

      const res = await request(createApp(service, createObjectService())).post("/game/game-1/unit/apc-1/unload/rider-1/terrain-061");

      expect(res.status).toBe(200);
      expect(executed).toHaveLength(1);
      expect([executed[0].unit.identifier.id, executed[0].target.identifier.id, executed[0].terrain.identifier.id]).toEqual(["apc-1", "rider-1", "terrain-061"]);
      expect(res.body).toEqual({
        definition: UNLOAD_ACTION,
        unit: { ...executed[0].unit, acted: true, transportIds: ["rider-2", "elsewhere"] },
        target: { ...executed[0].target, position: executed[0].terrain.position },
      });
    });

    it("previews nothing", async () => {
      const { service, previewed } = createStubUnloadService();
      await request(createApp(service, createObjectService())).post("/game/game-1/unit/apc-1/unload/rider-1/terrain-061");
      expect(previewed).toEqual([]);
    });

    it("leaves saving to the unload service: it changes no stored unit itself", async () => {
      const objects = createObjectService();
      const before = [objects.load<UnitObject>(Scope.Unit, { id: "apc-1", gameId: "game-1" }), objects.load<UnitObject>(Scope.Unit, { id: "rider-1", gameId: "game-1" })];
      const { service } = createStubUnloadService();

      await request(createApp(service, objects)).post("/game/game-1/unit/apc-1/unload/rider-1/terrain-061");

      expect([objects.load<UnitObject>(Scope.Unit, { id: "apc-1", gameId: "game-1" }), objects.load<UnitObject>(Scope.Unit, { id: "rider-1", gameId: "game-1" })]).toEqual(before);
    });

    it("returns 409 and executes nothing when plan does not accept the unload", async () => {
      const { service, executed } = createStubUnloadService(() => false);
      const res = await request(createApp(service, createObjectService())).post("/game/game-1/unit/apc-1/unload/rider-1/terrain-061");
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Unit rider-1 cannot be unloaded by unit apc-1 onto terrain terrain-061" });
      expect(executed).toEqual([]);
    });

    it.each([
      ["an unknown unit", "nope/terrain-061", "Unit nope not found in game game-1"],
      ["an unknown terrain", "rider-1/nope", "Terrain nope not found in game game-1"],
    ])("returns 404 for %s, and executes nothing", async (_what, path, error) => {
      const { service, executed } = createStubUnloadService();
      const res = await request(createApp(service, createObjectService())).post(`/game/game-1/unit/apc-1/unload/${path}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error });
      expect(executed).toEqual([]);
    });
  });

  it("has no other routes: only GET on the list, and GET and POST on a unit and a terrain", async () => {
    const { service } = createStubUnloadService();
    const app = createApp(service, createObjectService());
    expect((await request(app).post("/game/game-1/unit/apc-1/unload")).status).toBe(404);
    expect((await request(app).get("/game/game-1/unit/apc-1/unload/rider-1")).status).toBe(404);
    expect((await request(app).post("/game/game-1/unit/apc-1/unload/rider-1")).status).toBe(404);
    expect((await request(app).put("/game/game-1/unit/apc-1/unload/rider-1/terrain-061")).status).toBe(404);
    expect((await request(app).delete("/game/game-1/unit/apc-1/unload/rider-1/terrain-061")).status).toBe(404);
  });
});
