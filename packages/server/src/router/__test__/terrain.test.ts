import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { type OutpostObject, Scope, type TerrainObject } from "@tac-tics/api";
import { ObjectServiceImpl } from "@tac-tics/app";
import { realAppConfig } from "../../../test/config";
import { terrainRouter } from "../terrain";

/** The terrain of the repo's config: game-1 is played on map-1, Spann Island, a 15 by 10 grid, of which the static terrain of the map holds 129 squares and the outposts of the game hold the other 21. */
describe("GET /game/:gameId/terrain/:id", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express().use("/game/:gameId/terrain", terrainRouter(new ObjectServiceImpl(realAppConfig)));
  });

  it("lists every square of the game, the static terrain of its map and then its outposts", async () => {
    const res = await request(app).get("/game/game-1/terrain");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(150);
    expect(res.body[0].identifier).toEqual({ id: "terrain-000", mapId: "map-1" });
    expect(res.body[129].identifier).toEqual({ id: "outpost-026", gameId: "game-1" });
    expect(res.body.filter((terrain: any) => terrain.definition.name === "sea")).toHaveLength(65);
    expect(new Set(res.body.map((terrain: any) => terrain.identifier.id)).size).toBe(150);
  });

  it("lists nothing for a game that has no map", async () => {
    const res = await request(app).get("/game/game-2/terrain");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns an outpost of the game as JSON, with the key of its definition, its position and its player", async () => {
    const res = await request(app).get("/game/game-1/terrain/outpost-026");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      identifier: { id: "outpost-026", gameId: "game-1" },
      definition: { scope: "outpost", name: "factory" },
      position: { x: 11, y: 1 },
      health: 20,
      playerId: "player-2",
    });
  });

  it("returns the static terrain of the map of the game as JSON, with the key of its definition and its position", async () => {
    const res = await request(app).get("/game/game-1/terrain/terrain-017");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      identifier: { id: "terrain-017", mapId: "map-1" },
      definition: { scope: "terrain", name: "plain" },
      position: { x: 2, y: 1 },
    });
  });

  it("returns the sea of the map as static terrain, like any other", async () => {
    const res = await request(app).get("/game/game-1/terrain/terrain-015");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      identifier: { id: "terrain-015", mapId: "map-1" },
      definition: { scope: "terrain", name: "sea" },
      position: { x: 0, y: 1 },
    });
  });

  it.each(["nope", "terrain-150", "terrain-86", "plain-017"])("returns 404 for %s, which is not a square of the map", async (id) => {
    const res = await request(app).get(`/game/game-1/terrain/${id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: `Terrain ${id} not found in game game-1` });
  });

  it("returns 404 for an unknown game", async () => {
    const res = await request(app).get("/game/nope/terrain/terrain-017");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Terrain terrain-017 not found in game nope" });
  });

  it("does not find a terrain under a different game", async () => {
    const res = await request(app).get("/game/game-2/terrain/terrain-017");
    expect(res.status).toBe(404);
  });

  it("neither lists nor finds an outpost of another game, or the static terrain of another map", async () => {
    const objects = new ObjectServiceImpl(realAppConfig);
    objects.save<OutpostObject>(Scope.Outpost, { identifier: { id: "captured", gameId: "game-2" }, definition: { scope: "outpost", name: "city" }, position: { x: 0, y: 0 }, health: 20, playerId: undefined });
    objects.save<TerrainObject>(Scope.Terrain, { identifier: { id: "placed", mapId: "map-2" }, definition: { scope: "terrain", name: "plain" }, position: { x: 0, y: 0 } });
    const other = express().use("/game/:gameId/terrain", terrainRouter(objects));
    expect((await request(other).get("/game/game-1/terrain")).body).toHaveLength(150);
    expect((await request(other).get("/game/game-1/terrain/captured")).status).toBe(404);
    expect((await request(other).get("/game/game-1/terrain/placed")).status).toBe(404);
  });
});
