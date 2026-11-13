import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { ObjectServiceImpl } from "@tac-tics/app";
import { realAppConfig } from "../../../test/config";
import { terrainRouter } from "../terrain";

/** The terrain of the repo's config: game-1 is played on Spann Island, a 15 by 10 grid whose squares are sea unless the object file holds them. */
describe("GET /game/:gameId/terrain/:id", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express().use("/game/:gameId/terrain", terrainRouter(new ObjectServiceImpl(realAppConfig)));
  });

  it("lists every square of the map of the game, the terrain of the object file and then the default terrain", async () => {
    const res = await request(app).get("/game/game-1/terrain");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(150);
    expect(res.body[0].identifier).toEqual({ id: "terrain-1", gameId: "game-1" });
    expect(res.body.filter((terrain: any) => terrain.definition.name === "sea")).toHaveLength(65);
    expect(new Set(res.body.map((terrain: any) => terrain.identifier.id)).size).toBe(150);
  });

  it("lists nothing for a game that has no map", async () => {
    const res = await request(app).get("/game/game-2/terrain");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns the terrain of the object file as JSON, with the key of its definition and its position", async () => {
    const res = await request(app).get("/game/game-1/terrain/terrain-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      identifier: { id: "terrain-1", gameId: "game-1" },
      definition: { scope: "terrain", name: "plain" },
      position: { x: 2, y: 1 },
      health: 20,
    });
  });

  it("returns the default terrain of the map for a square the object file does not hold", async () => {
    const res = await request(app).get("/game/game-1/terrain/sea-16");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      identifier: { id: "sea-16", gameId: "game-1" },
      definition: { scope: "terrain", name: "sea" },
      position: { x: 0, y: 1 },
      health: 20,
    });
  });

  it.each(["nope", "sea-0", "sea-151", "terrain-86"])("returns 404 for %s, which is not a square of the map", async (id) => {
    const res = await request(app).get(`/game/game-1/terrain/${id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: `Terrain ${id} not found in game game-1` });
  });

  it("returns 404 for an unknown game", async () => {
    const res = await request(app).get("/game/nope/terrain/terrain-1");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Terrain terrain-1 not found in game nope" });
  });

  it("does not find a terrain under a different game", async () => {
    const res = await request(app).get("/game/game-2/terrain/terrain-1");
    expect(res.status).toBe(404);
  });
});
