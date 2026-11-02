import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { UnitObject } from "@tac-tics/api";
import { ObjectServiceImpl } from "@tac-tics/app";
import { realAppConfig } from "../../../test/config";
import { unitRouter } from "../unit";

const unit = (id: string, gameId: string, name: string): UnitObject => ({
  identifier: { id, gameId },
  definition: { scope: "unit", name },
  position: { x: 0, y: 0 },
  moved: false,
  acted: false,
  health: 100,
  fuel: 99,
  playerId: "player-1",
  offenseIds: [],
});

/** The objects of the repo's config, whose units are just unit-1, a tank in game-1. */
const objectService = () => new ObjectServiceImpl(realAppConfig);

describe("GET /game/:gameId/unit", () => {
  let app: express.Express;
  let objects: ObjectServiceImpl;

  beforeEach(() => {
    objects = objectService();
    objects.save<UnitObject>("unit", unit("unit-2", "game-1", "recon"));
    objects.save<UnitObject>("unit", unit("unit-3", "game-2", "infantry"));
    app = express().use("/game/:gameId/unit", unitRouter(objects));
  });

  it("returns every unit in the game as a JSON array", async () => {
    const res = await request(app).get("/game/game-1/unit");
    expect(res.status).toBe(200);
    expect(res.body.map((u: UnitObject) => u.identifier.id)).toEqual(["unit-1", "unit-2"]);
    expect(res.body[1]).toEqual(unit("unit-2", "game-1", "recon"));
  });

  it("does not include units from other games", async () => {
    const res = await request(app).get("/game/game-2/unit");
    expect(res.body).toEqual([unit("unit-3", "game-2", "infantry")]);
  });

  it("returns an empty array for a game with no units", async () => {
    const res = await request(app).get("/game/nope/unit");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /game/:gameId/unit/:unitId", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express().use("/game/:gameId/unit", unitRouter(objectService()));
  });

  it("returns the unit as JSON, with the key of its definition", async () => {
    const res = await request(app).get("/game/game-1/unit/unit-1");
    expect(res.status).toBe(200);
    expect(res.body.identifier).toEqual({ id: "unit-1", gameId: "game-1" });
    expect(res.body.definition).toEqual({ scope: "unit", name: "tank" });
    expect(res.body.position).toEqual({ x: 3, y: 2 });
  });

  it("returns 404 for an unknown unit", async () => {
    const res = await request(app).get("/game/game-1/unit/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Unit nope not found in game game-1" });
  });

  it("returns 404 for an unknown game", async () => {
    const res = await request(app).get("/game/nope/unit/unit-1");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Unit unit-1 not found in game nope" });
  });

  it("does not find a unit under a different game", async () => {
    const res = await request(app).get("/game/game-2/unit/unit-1");
    expect(res.status).toBe(404);
  });
});

describe("unitRouter ahead of /game/:gameId/unit/:unitId/* routes", () => {
  let app: express.Express;
  let objects: ObjectServiceImpl;

  beforeEach(() => {
    objects = objectService();
    const thing = express.Router({ mergeParams: true }).get("/", (_req, res) => {
      res.json({ unit: res.locals.unit });
    });
    app = express().use("/game/:gameId/unit", unitRouter(objects)).use("/game/:gameId/unit/:unitId/thing", thing);
  });

  it("passes the loaded unit to later routes as res.locals.unit", async () => {
    const res = await request(app).get("/game/game-1/unit/unit-1/thing");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unit: objects.load<UnitObject>("unit", { id: "unit-1", gameId: "game-1" }) });
  });

  it("returns 404 and skips later routes for an unknown unit", async () => {
    const res = await request(app).get("/game/game-1/unit/nope/thing");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Unit nope not found in game game-1" });
  });

  it("does not find a unit under a different game", async () => {
    const res = await request(app).get("/game/game-2/unit/unit-1/thing");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Unit unit-1 not found in game game-2" });
  });
});
