import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { GameObject } from "@tac-tics/api";
import { ObjectServiceImpl } from "@tac-tics/app";
import { realAppConfig } from "../../../test/config";
import { gameRouter } from "../game";

const game = (id: string, name = "2-player"): GameObject => ({ identifier: { id }, definition: { scope: "game", name }, turn: 0, playerTurn: 0 });

/** The objects of the repo's config, whose games are just game-1. */
const objectService = () => new ObjectServiceImpl(realAppConfig);

describe("GET /game", () => {
  it("returns every stored game as a JSON array", async () => {
    const objects = objectService();
    objects.save<GameObject>("game", game("game-2", "3-player"));
    const res = await request(express().use("/game", gameRouter(objects))).get("/game");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([...objects.loadAll<GameObject>("game").values()]);
    expect(res.body.map((g: GameObject) => g.identifier.id)).toEqual(["game-1", "game-2"]);
  });

  it("returns an empty array when no games exist", async () => {
    const objects = objectService();
    objects.delete("game", { id: "game-1" });
    const res = await request(express().use("/game", gameRouter(objects))).get("/game");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /game/:gameId", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express().use("/game", gameRouter(objectService()));
  });

  it("returns the game as JSON, with the key of its definition", async () => {
    const res = await request(app).get("/game/game-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ identifier: { id: "game-1" }, definition: { scope: "game", name: "2-player" }, turn: 0, playerTurn: 0 });
  });

  it("returns 404 for an unknown id", async () => {
    const res = await request(app).get("/game/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Game nope not found" });
  });
});

describe("gameRouter ahead of /game/:gameId/* routes", () => {
  let app: express.Express;
  let objects: ObjectServiceImpl;

  beforeEach(() => {
    objects = objectService();
    const thing = express.Router({ mergeParams: true }).get("/", (_req, res) => {
      res.json({ game: res.locals.game });
    });
    app = express().use("/game", gameRouter(objects)).use("/game/:gameId/thing", thing);
  });

  it("passes the loaded game to later routes as res.locals.game", async () => {
    const res = await request(app).get("/game/game-1/thing");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ game: objects.load<GameObject>("game", { id: "game-1" }) });
  });

  it("passes on a game saved after the router was made", async () => {
    objects.save<GameObject>("game", game("game-2", "4-player"));
    const res = await request(app).get("/game/game-2/thing");
    expect(res.body).toEqual({ game: game("game-2", "4-player") });
  });

  it("returns 404 and skips later routes for an unknown game", async () => {
    const res = await request(app).get("/game/nope/thing");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Game nope not found" });
  });
});
