import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { PlayerObject } from "@tac-tics/api";
import { ObjectServiceImpl } from "@tac-tics/app";
import { realAppConfig } from "../../../test/config";
import { playerRouter } from "../player";

const player = (id: string, gameId: string, name: string, order = 0): PlayerObject => ({
  identifier: { id, gameId },
  definition: { scope: "player", name },
  order,
  funds: 0,
});

/** The objects of the repo's config, whose players are player-1 (orange-star) and player-2 (blue-moon), both in game-1. */
const objectService = () => new ObjectServiceImpl(realAppConfig);

describe("GET /game/:gameId/player/:id", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express().use("/game/:gameId/player", playerRouter(objectService()));
  });

  it("returns the player as JSON, with the key of its definition", async () => {
    const res = await request(app).get("/game/game-1/player/player-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      identifier: { id: "player-1", gameId: "game-1" },
      definition: { scope: "player", name: "orange-star" },
      order: 0,
      funds: 0,
    });
  });

  it("returns 404 for an unknown player", async () => {
    const res = await request(app).get("/game/game-1/player/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Player nope not found in game game-1" });
  });

  it("returns 404 for an unknown game", async () => {
    const res = await request(app).get("/game/nope/player/player-1");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Player player-1 not found in game nope" });
  });

  it("does not find a player under a different game", async () => {
    const res = await request(app).get("/game/game-2/player/player-1");
    expect(res.status).toBe(404);
  });
});

describe("GET /game/:gameId/player", () => {
  let app: express.Express;
  let objects: ObjectServiceImpl;

  beforeEach(() => {
    objects = objectService();
    objects.save<PlayerObject>("player", player("player-3", "game-2", "green-earth"));
    app = express().use("/game/:gameId/player", playerRouter(objects));
  });

  it("returns every player in the game as a JSON array", async () => {
    const res = await request(app).get("/game/game-1/player");
    expect(res.status).toBe(200);
    expect(res.body.map((p: PlayerObject) => p.identifier.id)).toEqual(["player-1", "player-2"]);
  });

  it("does not include players from other games", async () => {
    const res = await request(app).get("/game/game-2/player");
    expect(res.body).toEqual([player("player-3", "game-2", "green-earth")]);
  });

  it("returns an empty array for a game with no players", async () => {
    const res = await request(app).get("/game/nope/player");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
