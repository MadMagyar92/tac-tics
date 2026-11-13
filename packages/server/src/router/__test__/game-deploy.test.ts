import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { type ActionService, type DeployActionInput, type DeployActionOutput, type GameObject, type PlayerObject, Scope, type TerrainObject, type UnitObject } from "@tac-tics/api";
import { DEPLOY_ACTION, ObjectServiceImpl } from "@tac-tics/app";
import { realAppConfig } from "../../../test/config";
import { deployRouter } from "../game";

function createApp(deployService: ActionService<DeployActionInput, DeployActionOutput>, objectService: ObjectServiceImpl) {
  return express().use(
    "/game/:gameId/deploy",
    (req, res, next) => {
      const { gameId } = req.params as Record<string, string>;
      res.locals.game = objectService.load<GameObject>(Scope.Game, { id: gameId });
      next();
    },
    deployRouter(deployService, objectService),
  );
}

/** A deploy service that accepts what `accepts` says, gives unit-2 as the new unit's id, and saves that unit on the terrain to `objects`, if it is given them, when it executes. */
function createStubDeployService(accepts: (deploy: DeployActionInput) => boolean = () => true, objects?: ObjectServiceImpl) {
  const asked: DeployActionInput[] = [];
  const previewed: DeployActionInput[] = [];
  const executed: DeployActionInput[] = [];
  const unitOf = ({ game, terrain, unitDefinition }: DeployActionInput): UnitObject => ({
    identifier: { id: "unit-2", gameId: game.identifier.id },
    definition: unitDefinition,
    position: { ...terrain.position },
    moved: false,
    acted: false,
    health: 100,
    fuel: 1,
    playerId: "player-1",
    offenseIds: [],
  });
  const service: ActionService<DeployActionInput, DeployActionOutput> = {
    canExecute(deploy) {
      asked.push(deploy);
      return accepts(deploy);
    },
    preview(deploy) {
      previewed.push(deploy);
      return { definition: deploy.definition, unitId: "unit-2" };
    },
    execute(deploy) {
      executed.push(deploy);
      objects?.save<UnitObject>(Scope.Unit, unitOf(deploy));
      return { definition: deploy.definition, unitId: "unit-2" };
    },
  };
  return { service, asked, previewed, executed };
}

function startObjects() {
  return new ObjectServiceImpl(realAppConfig);
}

const path = "/game/game-1/deploy/terrain-2";

describe("deployRouter", () => {
  describe("POST /game/:gameId/deploy/:terrainId", () => {
    it("builds the deploy from the game, the terrain, and the unit named in the body", async () => {
      const objects = startObjects();
      const { service, asked } = createStubDeployService();

      await request(createApp(service, objects)).post(path).send({ unit: "tank" });

      expect(asked).toEqual([
        {
          definition: DEPLOY_ACTION,
          game: objects.load<GameObject>(Scope.Game, { id: "game-1" }),
          terrain: objects.load<TerrainObject>(Scope.Terrain, { id: "terrain-2", gameId: "game-1" }),
          unitDefinition: { scope: "unit", name: "tank" },
        },
      ]);
    });

    it("executes the deploy, and gives the unit of the id the service returned", async () => {
      const objects = startObjects();
      const { service, executed } = createStubDeployService(() => true, objects);

      const res = await request(createApp(service, objects)).post(path).send({ unit: "tank" });

      expect(res.status).toBe(200);
      expect(executed).toHaveLength(1);
      expect(res.body).toEqual(objects.load<UnitObject>(Scope.Unit, { id: "unit-2", gameId: "game-1" }));
      expect(res.body.definition).toEqual({ scope: "unit", name: "tank" });
    });

    it("previews nothing", async () => {
      const { service, previewed } = createStubDeployService();
      await request(createApp(service, startObjects())).post(path).send({ unit: "tank" });
      expect(previewed).toEqual([]);
    });

    it("leaves saving to the deploy service: it changes no stored player or unit itself", async () => {
      const objects = startObjects();
      const before = objects.load<PlayerObject>(Scope.Player, { id: "player-1", gameId: "game-1" });
      const units = objects.loadAll<UnitObject>(Scope.Unit);
      const { service } = createStubDeployService();

      await request(createApp(service, objects)).post(path).send({ unit: "tank" });

      expect(objects.load<PlayerObject>(Scope.Player, { id: "player-1", gameId: "game-1" })).toEqual(before);
      expect(objects.loadAll<UnitObject>(Scope.Unit)).toEqual(units);
    });

    it("returns 409 and executes nothing when canExecute does not accept the deploy", async () => {
      const { service, executed } = createStubDeployService(() => false);
      const res = await request(createApp(service, startObjects())).post(path).send({ unit: "tank" });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Unit tank cannot be deployed on terrain terrain-2" });
      expect(executed).toEqual([]);
    });
  });

  describe("GET /game/:gameId/deploy/:terrainId", () => {
    it("gives the preview of the deploy built from the game, the terrain and the unit in the query", async () => {
      const objects = startObjects();
      const { service, asked, previewed } = createStubDeployService();

      const res = await request(createApp(service, objects)).get(`${path}?unit=infantry`);

      expect(res.status).toBe(200);
      expect(asked[0].unitDefinition).toEqual({ scope: "unit", name: "infantry" });
      expect(previewed).toEqual(asked);
      expect(res.body).toEqual({ definition: DEPLOY_ACTION, unitId: "unit-2" });
    });

    it("executes nothing", async () => {
      const { service, executed } = createStubDeployService();
      await request(createApp(service, startObjects())).get(`${path}?unit=infantry`);
      expect(executed).toEqual([]);
    });

    it("does not read the unit from a body", async () => {
      const { service, asked } = createStubDeployService();
      const res = await request(createApp(service, startObjects())).get(path).send({ unit: "tank" });
      expect(res.status).toBe(400);
      expect(asked).toEqual([]);
    });

    it("returns 404 and previews nothing when canExecute does not accept the deploy", async () => {
      const { service, previewed } = createStubDeployService(() => false);
      const res = await request(createApp(service, startObjects())).get(`${path}?unit=tank`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit tank cannot be deployed on terrain terrain-2" });
      expect(previewed).toEqual([]);
    });
  });

  describe("the unit to deploy", () => {
    const missing = { error: 'Expected the name of the unit to deploy as "unit"' };

    it.each([
      ["no body", undefined],
      ["an empty body", {}],
      ["an empty name", { unit: "" }],
      ["a number", { unit: 3 }],
      ["a list", { unit: ["tank"] }],
      ["an object", { unit: { name: "tank" } }],
      ["null", { unit: null }],
    ])("is refused with 400 for %s", async (_name, body) => {
      const { service, asked } = createStubDeployService();
      const call = request(createApp(service, startObjects())).post(path);
      const res = await (body === undefined ? call : call.send(body));
      expect(res.status).toBe(400);
      expect(res.body).toEqual(missing);
      expect(asked).toEqual([]);
    });

    it.each(["", "?unit=", "?unit=a&unit=b", "?other=tank"])("is refused with 400 for a GET with the query %j", async (query) => {
      const { service, asked } = createStubDeployService();
      const res = await request(createApp(service, startObjects())).get(`${path}${query}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual(missing);
      expect(asked).toEqual([]);
    });
  });

  describe("the player", () => {
    it("is left to the deploy service: the router asks it even when no player has the turn", async () => {
      const objects = startObjects();
      const game = objects.load<GameObject>(Scope.Game, { id: "game-1" })!;
      objects.save<GameObject>(Scope.Game, { ...game, playerTurn: 5 });
      const { service, asked } = createStubDeployService();

      const res = await request(createApp(service, objects)).post(path).send({ unit: "tank" });

      expect(res.status).toBe(200);
      expect(asked).toHaveLength(1);
      expect(asked[0]).not.toHaveProperty("player");
    });

    it("gives the deploy service the game, so that it can tell whose turn it is", async () => {
      const objects = startObjects();
      const game = objects.load<GameObject>(Scope.Game, { id: "game-1" })!;
      objects.save<GameObject>(Scope.Game, { ...game, playerTurn: 1 });
      const { service, asked } = createStubDeployService();

      await request(createApp(service, objects)).post(path).send({ unit: "tank" });

      expect(asked[0].game.playerTurn).toBe(1);
    });
  });

  describe("the terrain", () => {
    it("is refused with 404 when it is not in the game", async () => {
      const { service, asked } = createStubDeployService();
      const res = await request(createApp(service, startObjects())).post("/game/game-1/deploy/nope").send({ unit: "tank" });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Terrain nope not found in game game-1" });
      expect(asked).toEqual([]);
    });

    it("is not one of another game's terrain", async () => {
      const objects = startObjects();
      objects.save<TerrainObject>(Scope.Terrain, {
        identifier: { id: "elsewhere", gameId: "game-2" },
        definition: { scope: "terrain", name: "base" },
        position: { x: 0, y: 0 },
        health: 20,
        playerId: "player-1",
      });
      const { service } = createStubDeployService();
      const res = await request(createApp(service, objects)).get("/game/game-1/deploy/elsewhere?unit=tank");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Terrain elsewhere not found in game game-1" });
    });
  });

  it("has no other routes: only GET and POST on a terrain", async () => {
    const { service } = createStubDeployService();
    const app = createApp(service, startObjects());
    expect((await request(app).post("/game/game-1/deploy").send({ unit: "tank" })).status).toBe(404);
    expect((await request(app).get("/game/game-1/deploy")).status).toBe(404);
    expect((await request(app).put(path).send({ unit: "tank" })).status).toBe(404);
    expect((await request(app).delete(path)).status).toBe(404);
  });
});
