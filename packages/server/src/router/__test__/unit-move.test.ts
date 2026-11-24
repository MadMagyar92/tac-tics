import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { type ActionService, type GameObject, type MovementObject, type MultiMoveActionInput, type MultiMoveActionOutput, type MultiMoveActionPlan, type MultiMoveActionResult, type OutpostObject, Scope, type TerrainObject, type UnitObject } from "@tac-tics/api";
import { isInGame, MOVE_ACTION, ObjectServiceImpl } from "@tac-tics/app";
import { createStubActionService, realAppConfig } from "../../../test/config";
import { moveRouter } from "../unit";

function createApp(moveService: ActionService<MultiMoveActionInput, MultiMoveActionPlan, MultiMoveActionResult, MultiMoveActionOutput>, objectService: ObjectServiceImpl) {
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

/** The movement of `unit` that the stub move service gives, with 59 fuel. */
const movementOf = ({ identifier, movementId }: UnitObject): MovementObject => ({
  identifier: { id: movementId, gameId: identifier.gameId, unitId: identifier.id },
  definition: { scope: Scope.Movement, name: "tread" },
  fuel: 59,
});

/** A move service that accepts what `accepts` says, and gives the unit on the first terrain it was asked to move onto, and its movement, not interrupted. */
function createStubMoveService(accepts: (move: MultiMoveActionInput) => boolean = () => true) {
  const asked: MultiMoveActionInput[] = [];
  const previewed: MultiMoveActionInput[] = [];
  const executed: MultiMoveActionInput[] = [];
  const resultOf = ({ unit, targets }: MultiMoveActionInput): MultiMoveActionResult => ({ unit: { ...unit, position: { ...targets[0].position } }, movement: movementOf(unit), interrupted: false, transport: undefined });
  const outputOf = (move: MultiMoveActionInput): MultiMoveActionOutput => ({ definition: move.definition, ...resultOf(move) });
  const service = createStubActionService<MultiMoveActionInput, MultiMoveActionPlan, MultiMoveActionResult, MultiMoveActionOutput>({
    canPlan(move) {
      asked.push(move);
      return accepts(move);
    },
    preview(move) {
      previewed.push(move);
      return resultOf(move);
    },
    execute(move) {
      executed.push(move);
      return outputOf(move);
    },
  });
  return { service, asked, previewed, executed };
}

function outpostIn(id: string, gameId: string): OutpostObject {
  return { identifier: { id, gameId }, definition: { scope: Scope.Outpost, name: "city" }, position: { x: 0, y: 0 }, health: 20, playerId: undefined };
}

function terrainOn(id: string, mapId: string): TerrainObject {
  return { identifier: { id, mapId }, definition: { scope: Scope.Terrain, name: "plain" }, position: { x: 0, y: 0 } };
}

const onlyTerrain = (...ids: string[]) => (move: MultiMoveActionInput) => ids.includes(move.targets[0].identifier.id);

describe("moveRouter", () => {
  describe("GET /game/:gameId/unit/:unitId/move", () => {
    it("lists a move for each terrain in the game that plan accepts, the static terrain of its map before its outposts, built from the request's game and unit", async () => {
      const objects = new ObjectServiceImpl(realAppConfig);
      const { service } = createStubMoveService(onlyTerrain("terrain-102", "outpost-058"));
      const tank = objects.load<UnitObject>(Scope.Unit, { id: "unit-1", gameId: "game-1" })!;

      const res = await request(createApp(service, objects)).get("/game/game-1/unit/unit-1/move");

      expect(res.status).toBe(200);
      expect(res.body.map((move: MultiMoveActionInput) => move.targets[0].identifier.id)).toEqual(["terrain-102", "outpost-058"]);
      for (const move of res.body) {
        expect(move.definition).toEqual(MOVE_ACTION);
        expect(move.game.identifier).toEqual({ id: "game-1" });
        expect(move.unit).toEqual(tank);
      }
    });

    it("lists none when plan accepts none", async () => {
      const { service } = createStubMoveService(() => false);
      const res = await request(createApp(service, new ObjectServiceImpl(realAppConfig))).get("/game/game-1/unit/unit-1/move");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("asks plan about every terrain of the game, and none of another game or of the map of another game", async () => {
      const objects = new ObjectServiceImpl(realAppConfig);
      objects.save<OutpostObject>(Scope.Outpost, outpostIn("elsewhere", "game-2"));
      objects.save<TerrainObject>(Scope.Terrain, terrainOn("elsewhere", "map-2"));
      const { service, asked } = createStubMoveService();

      await request(createApp(service, objects)).get("/game/game-1/unit/unit-1/move");

      expect(asked).toHaveLength(150);
      expect(asked.every((move) => isInGame("game-1", "map-1", move.targets[0].identifier))).toBe(true);
    });

    it("changes nothing: it only asks plan", async () => {
      const { service, previewed, executed } = createStubMoveService();
      await request(createApp(service, new ObjectServiceImpl(realAppConfig))).get("/game/game-1/unit/unit-1/move");
      expect(previewed).toEqual([]);
      expect(executed).toEqual([]);
    });
  });

  describe("GET /game/:gameId/unit/:unitId/move/:terrainId", () => {
    it("gives the result of previewing the move built from the request's game, unit and terrain", async () => {
      const objects = new ObjectServiceImpl(realAppConfig);
      const { service, asked, previewed } = createStubMoveService();
      const tank = objects.load<UnitObject>(Scope.Unit, { id: "unit-1", gameId: "game-1" })!;
      const terrain = objects.load<TerrainObject>(Scope.Terrain, { id: "terrain-102", mapId: "map-1" })!;

      const res = await request(createApp(service, objects)).get("/game/game-1/unit/unit-1/move/terrain-102");

      const move = { definition: MOVE_ACTION, game: objects.load(Scope.Game, { id: "game-1" }), unit: tank, targets: [terrain] };
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ unit: { ...tank, position: terrain.position }, movement: movementOf(tank), interrupted: false });
      expect(asked).toEqual([move]);
      expect(previewed).toEqual([move]);
    });

    it("executes nothing", async () => {
      const { service, executed } = createStubMoveService();
      await request(createApp(service, new ObjectServiceImpl(realAppConfig))).get("/game/game-1/unit/unit-1/move/terrain-102");
      expect(executed).toEqual([]);
    });

    it("returns 404 and previews nothing when plan does not accept the move", async () => {
      const { service, previewed } = createStubMoveService(() => false);
      const res = await request(createApp(service, new ObjectServiceImpl(realAppConfig))).get("/game/game-1/unit/unit-1/move/terrain-102");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit unit-1 cannot move onto terrain terrain-102" });
      expect(previewed).toEqual([]);
    });

    it("returns 404 for an unknown terrain, and asks nothing", async () => {
      const { service, asked } = createStubMoveService();
      const res = await request(createApp(service, new ObjectServiceImpl(realAppConfig))).get("/game/game-1/unit/unit-1/move/nope");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Terrain nope not found in game game-1" });
      expect(asked).toEqual([]);
    });

    it("does not find an outpost of another game, nor the static terrain of the map of another game", async () => {
      const objects = new ObjectServiceImpl(realAppConfig);
      objects.save<OutpostObject>(Scope.Outpost, outpostIn("elsewhere", "game-2"));
      objects.save<TerrainObject>(Scope.Terrain, terrainOn("elsewhere", "map-2"));
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

      const res = await request(createApp(service, objects)).post("/game/game-1/unit/unit-1/move/terrain-102");

      expect(res.status).toBe(200);
      expect(executed).toHaveLength(1);
      expect(executed[0].targets[0].identifier.id).toBe("terrain-102");
      expect(res.body).toEqual({ definition: MOVE_ACTION, unit: { ...executed[0].unit, position: executed[0].targets[0].position }, movement: movementOf(executed[0].unit), interrupted: false });
    });

    it("previews nothing", async () => {
      const { service, previewed } = createStubMoveService();
      await request(createApp(service, new ObjectServiceImpl(realAppConfig))).post("/game/game-1/unit/unit-1/move/terrain-102");
      expect(previewed).toEqual([]);
    });

    it("leaves saving to the move service: it changes no stored unit itself", async () => {
      const objects = new ObjectServiceImpl(realAppConfig);
      const before = objects.load<UnitObject>(Scope.Unit, { id: "unit-1", gameId: "game-1" });
      const { service } = createStubMoveService();

      await request(createApp(service, objects)).post("/game/game-1/unit/unit-1/move/terrain-102");

      expect(objects.load<UnitObject>(Scope.Unit, { id: "unit-1", gameId: "game-1" })).toEqual(before);
    });

    it("returns 409 and executes nothing when plan does not accept the move", async () => {
      const { service, executed } = createStubMoveService(() => false);
      const res = await request(createApp(service, new ObjectServiceImpl(realAppConfig))).post("/game/game-1/unit/unit-1/move/terrain-102");
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Unit unit-1 cannot move onto terrain terrain-102" });
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
    expect((await request(app).put("/game/game-1/unit/unit-1/move/terrain-102")).status).toBe(404);
    expect((await request(app).delete("/game/game-1/unit/unit-1/move/terrain-102")).status).toBe(404);
  });
});
