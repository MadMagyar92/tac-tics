import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { type ActionService, type DeployAction, type GameObject, type PlayerObject, Scope, type TerrainObject } from "@tac-tics/api";
import { DEPLOY_ACTION, ObjectServiceImpl } from "@tac-tics/app";
import { realAppConfig } from "../../../test/config";
import { deployRouter } from "../game";

function createApp(deployService: ActionService<DeployAction>, objectService: ObjectServiceImpl) {
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

/** A deploy service that accepts what `accepts` says, and takes 1 off the player's funds so tests can tell the result from the input. */
function createStubDeployService(accepts: (deploy: DeployAction) => boolean = () => true) {
  const asked: DeployAction[] = [];
  const previewed: DeployAction[] = [];
  const executed: DeployAction[] = [];
  const changed = (deploy: DeployAction): DeployAction => ({ ...deploy, player: { ...deploy.player, funds: deploy.player.funds - 1 } });
  const service: ActionService<DeployAction> = {
    canExecute(deploy) {
      asked.push(deploy);
      return accepts(deploy);
    },
    preview(deploy) {
      previewed.push(deploy);
      return changed(deploy);
    },
    execute(deploy) {
      executed.push(deploy);
      return changed(deploy);
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
    it("builds the deploy from the game, the terrain, the player whose turn it is, and the unit named in the body", async () => {
      const objects = startObjects();
      const { service, asked } = createStubDeployService();

      await request(createApp(service, objects)).post(path).send({ unit: "tank" });

      expect(asked).toEqual([
        {
          definition: DEPLOY_ACTION,
          game: objects.load<GameObject>(Scope.Game, { id: "game-1" }),
          terrain: objects.load<TerrainObject>(Scope.Terrain, { id: "terrain-2", gameId: "game-1" }),
          player: objects.load<PlayerObject>(Scope.Player, { id: "player-1", gameId: "game-1" }),
          unitDefinition: { scope: "unit", name: "tank" },
        },
      ]);
    });

    it("executes the deploy, and gives the action the service returned", async () => {
      const objects = startObjects();
      const { service, executed } = createStubDeployService();
      const first = objects.load<PlayerObject>(Scope.Player, { id: "player-1", gameId: "game-1" })!;

      const res = await request(createApp(service, objects)).post(path).send({ unit: "tank" });

      expect(res.status).toBe(200);
      expect(executed).toHaveLength(1);
      expect(res.body.player).toEqual({ ...first, funds: first.funds - 1 });
    });

    it("previews nothing", async () => {
      const { service, previewed } = createStubDeployService();
      await request(createApp(service, startObjects())).post(path).send({ unit: "tank" });
      expect(previewed).toEqual([]);
    });

    it("deploys for the player whose turn it is, whichever that is", async () => {
      const objects = startObjects();
      const game = objects.load<GameObject>(Scope.Game, { id: "game-1" })!;
      objects.save<GameObject>(Scope.Game, { ...game, playerTurn: 1 });
      const { service, asked } = createStubDeployService();

      await request(createApp(service, objects)).post(path).send({ unit: "tank" });

      expect(asked[0].player.identifier.id).toBe("player-2");
    });

    it("leaves saving to the deploy service: it changes no stored player itself", async () => {
      const objects = startObjects();
      const before = objects.load<PlayerObject>(Scope.Player, { id: "player-1", gameId: "game-1" });
      const { service } = createStubDeployService();

      await request(createApp(service, objects)).post(path).send({ unit: "tank" });

      expect(objects.load<PlayerObject>(Scope.Player, { id: "player-1", gameId: "game-1" })).toEqual(before);
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
    it("gives the preview of the deploy built from the game, the terrain, the current player and the unit in the query", async () => {
      const objects = startObjects();
      const { service, asked, previewed } = createStubDeployService();
      const first = objects.load<PlayerObject>(Scope.Player, { id: "player-1", gameId: "game-1" })!;

      const res = await request(createApp(service, objects)).get(`${path}?unit=infantry`);

      expect(res.status).toBe(200);
      expect(asked[0].unitDefinition).toEqual({ scope: "unit", name: "infantry" });
      expect(asked[0].player).toEqual(first);
      expect(previewed).toEqual(asked);
      expect(res.body.player).toEqual({ ...first, funds: first.funds - 1 });
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
    it("is refused with 404 when no player has the turn", async () => {
      const objects = startObjects();
      const game = objects.load<GameObject>(Scope.Game, { id: "game-1" })!;
      objects.save<GameObject>(Scope.Game, { ...game, playerTurn: 5 });
      const { service, asked } = createStubDeployService();

      const res = await request(createApp(service, objects)).post(path).send({ unit: "tank" });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "No player has the turn in game game-1" });
      expect(asked).toEqual([]);
    });

    it("is not one of another game's players", async () => {
      const objects = startObjects();
      for (const id of ["player-1", "player-2"]) {
        objects.delete(Scope.Player, { id, gameId: "game-1" });
      }
      objects.save<PlayerObject>(Scope.Player, {
        identifier: { id: "stranger", gameId: "game-2" },
        definition: { scope: "player", name: "orange-star" },
        order: 0,
        funds: 100,
      });
      const { service } = createStubDeployService();

      const res = await request(createApp(service, objects)).post(path).send({ unit: "tank" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("No player has the turn in game game-1");
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
