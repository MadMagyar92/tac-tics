import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { ObjectServiceImpl } from "@tac-tics/app";
import { realAppConfig } from "../../../test/config";
import { terrainRouter } from "../terrain";

/** The terrain of the repo's config: terrain-1 to terrain-600, a 30 by 20 grid of plains in game-1. */
describe("GET /game/:gameId/terrain/:id", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express().use("/game/:gameId/terrain", terrainRouter(new ObjectServiceImpl(realAppConfig)));
  });

  it("returns the terrain as JSON, with the key of its definition and its position", async () => {
    const res = await request(app).get("/game/game-1/terrain/terrain-31");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      identifier: { id: "terrain-31", gameId: "game-1" },
      definition: { scope: "terrain", name: "plain" },
      position: { x: 0, y: 1 },
    });
  });

  it("returns 404 for an unknown terrain", async () => {
    const res = await request(app).get("/game/game-1/terrain/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Terrain nope not found in game game-1" });
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
