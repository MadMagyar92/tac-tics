import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { type ActionService, type GameObject, type MultiMoveActionInput, type MultiMoveActionOutput, Scope, type TerrainObject, type UnitObject } from "@tac-tics/api";
import { MOVE_ACTION, ObjectServiceImpl } from "@tac-tics/app";
import { realAppConfig } from "../../../test/config";
import { moveRouter } from "../unit";

function createApp(moveService: ActionService<MultiMoveActionInput, MultiMoveActionOutput>, objectService: ObjectServiceImpl) {
  return express().use(
    "/game/:gameId/unit/:unitId/move",
    (req, res, next) => {
      const { gameId, unitId } = req.params as Record<string, string>;
      res.locals.game = objectService.load<GameObject>(Scope.Game, { id: gameId });
      res.locals.unit = objectService.load<UnitObject>(Scope.Unit, { id: unitId, gameId });
      next();
    },
    moveRouter(moveService, objectService),
  );
}

/** A move service that accepts what `accepts` says, and gives a cost of 1 and the terrain it was asked to move onto. */
function createStubMoveService(accepts: (move: MultiMoveActionInput) => boolean = () => true) {
  const asked: MultiMoveActionInput[] = [];
  const previewed: MultiMoveActionInput[] = [];
  const executed: MultiMoveActionInput[] = [];
  const outputOf = ({ definition, path }: MultiMoveActionInput): MultiMoveActionOutput => ({ definition, cost: 1, terrainId: path[0].identifier.id });
  const service: ActionService<MultiMoveActionInput, MultiMoveActionOutput> = {
    canExecute(move) {
      asked.push(move);
      return accepts(move);
    },
    preview(move) {
      previewed.push(move);
      return outputOf(move);
    },
    execute(move) {
      executed.push(move);
      return outputOf(move);
    },
  };
  return { service, asked, previewed, executed };
}

function terrainIn(id: string, gameId: string): TerrainObject {
  return { identifier: { id, gameId }, definition: { scope: Scope.Terrain, name: "plain" }, position: { x: 0, y: 0 }, playerId: undefined };
}

const onlyTerrain = (...ids: string[]) => (move: MultiMoveActionInput) => ids.includes(move.path[0].identifier.id);

describe("moveRouter", () => {
  describe("GET /game/:gameId/unit/:unitId/move", () => {
    it("lists a move for each terrain in the game that canExecute accepts, built from the request's game and unit", async () => {
      const objects = new ObjectServiceImpl(realAppConfig);
      const { service } = createStubMoveService(onlyTerrain("terrain-65", "terrain-34"));
      const tank = objects.load<UnitObject>(Scope.Unit, { id: "unit-1", gameId: "game-1" })!;

      const res = await request(createApp(service, objects)).get("/game/game-1/unit/unit-1/move");

      expect(res.status).toBe(200);
      expect(res.body.map((move: MultiMoveActionInput) => move.path[0].identifier.id)).toEqual(["terrain-34", "terrain-65"]);
      for (const move of res.body) {
        expect(move.definition).toEqual(MOVE_ACTION);
        expect(move.game.identifier).toEqual({ id: "game-1" });
        expect(move.unit).toEqual(tank);
      }
    });

    it("lists none when canExecute accepts none", async () => {
      const { service } = createStubMoveService(() => false);
      const res = await request(createApp(service, new ObjectServiceImpl(realAppConfig))).get("/game/game-1/unit/unit-1/move");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("asks canExecute about every terrain of the game, and none of another game", async () => {
      const objects = new ObjectServiceImpl(realAppConfig);
      objects.save<TerrainObject>(Scope.Terrain, terrainIn("elsewhere", "game-2"));
      const { service, asked } = createStubMoveService();

      await request(createApp(service, objects)).get("/game/game-1/unit/unit-1/move");

      expect(asked).toHaveLength(150);
      expect(asked.map((move) => move.path[0].identifier.gameId)).toEqual(Array(150).fill("game-1"));
    });

    it("changes nothing: it only asks canExecute", async () => {
      const { service, previewed, executed } = createStubMoveService();
      await request(createApp(service, new ObjectServiceImpl(realAppConfig))).get("/game/game-1/unit/unit-1/move");
      expect(previewed).toEqual([]);
      expect(executed).toEqual([]);
    });
  });

  describe("GET /game/:gameId/unit/:unitId/move/:terrainId", () => {
    it("gives the preview of the move built from the request's game, unit and terrain", async () => {
      const objects = new ObjectServiceImpl(realAppConfig);
      const { service, asked, previewed } = createStubMoveService();
      const tank = objects.load<UnitObject>(Scope.Unit, { id: "unit-1", gameId: "game-1" })!;
      const terrain = objects.load<TerrainObject>(Scope.Terrain, { id: "terrain-65", gameId: "game-1" })!;

      const res = await request(createApp(service, objects)).get("/game/game-1/unit/unit-1/move/terrain-65");

      const move = { definition: MOVE_ACTION, game: objects.load(Scope.Game, { id: "game-1" }), unit: tank, path: [terrain] };
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ definition: MOVE_ACTION, cost: 1, terrainId: "terrain-65" });
      expect(asked).toEqual([move]);
      expect(previewed).toEqual([move]);
    });

    it("executes nothing", async () => {
      const { service, executed } = createStubMoveService();
      await request(createApp(service, new ObjectServiceImpl(realAppConfig))).get("/game/game-1/unit/unit-1/move/terrain-65");
      expect(executed).toEqual([]);
    });

    it("returns 404 and previews nothing when canExecute does not accept the move", async () => {
      const { service, previewed } = createStubMoveService(() => false);
      const res = await request(createApp(service, new ObjectServiceImpl(realAppConfig))).get("/game/game-1/unit/unit-1/move/terrain-65");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit unit-1 cannot move onto terrain terrain-65" });
      expect(previewed).toEqual([]);
    });

    it("returns 404 for an unknown terrain, and asks nothing", async () => {
      const { service, asked } = createStubMoveService();
      const res = await request(createApp(service, new ObjectServiceImpl(realAppConfig))).get("/game/game-1/unit/unit-1/move/nope");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Terrain nope not found in game game-1" });
      expect(asked).toEqual([]);
    });

    it("does not find a terrain in another game", async () => {
      const objects = new ObjectServiceImpl(realAppConfig);
      objects.save<TerrainObject>(Scope.Terrain, terrainIn("elsewhere", "game-2"));
      const { service } = createStubMoveService();
      const res = await request(createApp(service, objects)).get("/game/game-1/unit/unit-1/move/elsewhere");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Terrain elsewhere not found in game game-1" });
    });
  });

  describe("POST /game/:gameId/unit/:unitId/move/:terrainId", () => {
    it("executes the move built from the request's game, unit and terrain, and gives the output the service returned", async () => {
      const objects = new ObjectServiceImpl(realAppConfig);
      const { service, executed } = createStubMoveService();

      const res = await request(createApp(service, objects)).post("/game/game-1/unit/unit-1/move/terrain-65");

      expect(res.status).toBe(200);
      expect(executed).toHaveLength(1);
      expect(executed[0].path[0].identifier.id).toBe("terrain-65");
      expect(res.body).toEqual({ definition: MOVE_ACTION, cost: 1, terrainId: "terrain-65" });
    });

    it("previews nothing", async () => {
      const { service, previewed } = createStubMoveService();
      await request(createApp(service, new ObjectServiceImpl(realAppConfig))).post("/game/game-1/unit/unit-1/move/terrain-65");
      expect(previewed).toEqual([]);
    });

    it("leaves saving to the move service: it changes no stored unit itself", async () => {
      const objects = new ObjectServiceImpl(realAppConfig);
      const before = objects.load<UnitObject>(Scope.Unit, { id: "unit-1", gameId: "game-1" });
      const { service } = createStubMoveService();

      await request(createApp(service, objects)).post("/game/game-1/unit/unit-1/move/terrain-65");

      expect(objects.load<UnitObject>(Scope.Unit, { id: "unit-1", gameId: "game-1" })).toEqual(before);
    });

    it("returns 409 and executes nothing when canExecute does not accept the move", async () => {
      const { service, executed } = createStubMoveService(() => false);
      const res = await request(createApp(service, new ObjectServiceImpl(realAppConfig))).post("/game/game-1/unit/unit-1/move/terrain-65");
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Unit unit-1 cannot move onto terrain terrain-65" });
      expect(executed).toEqual([]);
    });

    it("returns 404 for an unknown terrain, and executes nothing", async () => {
      const { service, executed } = createStubMoveService();
      const res = await request(createApp(service, new ObjectServiceImpl(realAppConfig))).post("/game/game-1/unit/unit-1/move/nope");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Terrain nope not found in game game-1" });
      expect(executed).toEqual([]);
    });
  });

  it("has no other routes: only GET on the list, and GET and POST on a terrain", async () => {
    const { service } = createStubMoveService();
    const app = createApp(service, new ObjectServiceImpl(realAppConfig));
    expect((await request(app).post("/game/game-1/unit/unit-1/move")).status).toBe(404);
    expect((await request(app).put("/game/game-1/unit/unit-1/move/terrain-65")).status).toBe(404);
    expect((await request(app).delete("/game/game-1/unit/unit-1/move/terrain-65")).status).toBe(404);
  });
});
