import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { addObjects, cleanUp, copyConfig, editObjects, realAppConfig } from "../../test/config";
import { createApp } from "../app";

afterEach(cleanUp);

/** What an object file of the repo's config holds. */
const objectsOf = (scope: string): any[] => JSON.parse(readFileSync(join(dirname(realAppConfig), "object", `${scope}.json`), "utf8"));

const attack = { scope: "action", name: "attack" };

describe("createApp with the repo's config", () => {
  const app = createApp({ appConfigPath: realAppConfig });
  const [game] = objectsOf("game");
  const [orangeStar, blueMoon] = objectsOf("player");
  const [tank] = objectsOf("unit");
  const terrain = objectsOf("terrain");

  // GET /game and GET /game/game-1
  describe("games", () => {
    it("lists the games of the object file", async () => {
      const res = await request(app).get("/game");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(objectsOf("game"));
    });

    it("gives a game by its id, with the key of its definition", async () => {
      const res = await request(app).get("/game/game-1");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(game);
      expect(res.body.definition).toEqual({ scope: "game", name: "2-player" });
    });

    it("returns 404 for an unknown game", async () => {
      const res = await request(app).get("/game/nope");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Game nope not found" });
    });

    it("returns 404 for any /game/:gameId/* request when the game does not exist", async () => {
      for (const path of ["player", "player/player-1", "unit", "unit/unit-1", "unit/unit-1/attack", "unit/unit-1/unload", "terrain", "terrain/terrain-1"]) {
        const res = await request(app).get(`/game/nope/${path}`);
        expect(res.status, path).toBe(404);
        expect(res.body, path).toEqual({ error: "Game nope not found" });
      }
    });
  });

  // GET /game/game-1/player and GET /game/game-1/player/player-2
  describe("players", () => {
    it("lists the players of the game", async () => {
      const res = await request(app).get("/game/game-1/player");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([orangeStar, blueMoon]);
    });

    it("gives a player by its id, with the key of its definition", async () => {
      const res = await request(app).get("/game/game-1/player/player-2");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(blueMoon);
      expect(res.body.definition).toEqual({ scope: "player", name: "blue-moon" });
    });

    it("returns 404 for an unknown player", async () => {
      const res = await request(app).get("/game/game-1/player/nope");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Player nope not found in game game-1" });
    });
  });

  // GET /game/game-1/unit and GET /game/game-1/unit/unit-1
  describe("units", () => {
    it("lists the units of the game", async () => {
      const res = await request(app).get("/game/game-1/unit");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([tank]);
    });

    it("gives a unit by its id, with the key of its definition and the ids of its offenses", async () => {
      const res = await request(app).get("/game/game-1/unit/unit-1");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(tank);
      expect(res.body.definition).toEqual({ scope: "unit", name: "tank" });
      expect(res.body.offenseIds).toEqual(["offense-1", "offense-2"]);
    });

    it("returns 404 for an unknown unit", async () => {
      const res = await request(app).get("/game/game-1/unit/nope");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit nope not found in game game-1" });
    });
  });

  // GET /game/game-1/terrain, GET /game/game-1/terrain/terrain-15 and GET /game/game-1/terrain/sea-150
  describe("terrain", () => {
    it("lists every square of the map of the game: the terrain of the object file, then the sea", async () => {
      const res = await request(app).get("/game/game-1/terrain");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(150);
      expect(res.body.slice(0, terrain.length)).toEqual(terrain);
      expect(res.body.slice(terrain.length).every((square: any) => square.definition.name === "sea")).toBe(true);
    });

    it("gives a terrain of the object file by its id, with the key of its definition and its position", async () => {
      const res = await request(app).get("/game/game-1/terrain/terrain-15");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(terrain.find((object) => object.identifier.id === "terrain-15"));
      expect(res.body.definition).toEqual({ scope: "terrain", name: "woods" });
      expect(res.body.position).toEqual({ x: 3, y: 2 });
    });

    it("gives the default terrain of the map for a square the object file does not hold", async () => {
      const res = await request(app).get("/game/game-1/terrain/sea-150");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        identifier: { id: "sea-150", gameId: "game-1" },
        definition: { scope: "terrain", name: "sea" },
        position: { x: 14, y: 9 },
        health: 20,
      });
    });

    it("returns 404 for an unknown terrain", async () => {
      const res = await request(app).get("/game/game-1/terrain/nope");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Terrain nope not found in game game-1" });
    });
  });

  // GET /game/game-1/unit/unit-1/attack and GET /game/game-1/unit/unit-1/attack/unit-2
  describe("attacks", () => {
    it("lists none when the unit has no one to attack", async () => {
      const res = await request(app).get("/game/game-1/unit/unit-1/attack");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 404 for an unknown target", async () => {
      const res = await request(app).get("/game/game-1/unit/unit-1/attack/nope");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit nope not found in game game-1" });
    });

    it("does not let a unit attack itself", async () => {
      expect((await request(app).get("/game/game-1/unit/unit-1/attack/unit-1")).status).toBe(404);
      expect((await request(app).post("/game/game-1/unit/unit-1/attack/unit-1")).status).toBe(409);
    });

    it("returns 404 for the attacks of an unknown unit", async () => {
      const res = await request(app).get("/game/game-1/unit/nope/attack");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit nope not found in game game-1" });
    });
  });

  it("has no routes that change anything but the attack", async () => {
    for (const path of ["/game", "/game/game-1", "/game/game-1/player", "/game/game-1/terrain", "/game/game-1/unit", "/game/game-1/unit/unit-1", "/game/game-1/unit/unit-1/attack"]) {
      for (const method of ["post", "put", "delete"] as const) {
        const res = await request(app)[method](path).send({});
        expect(res.status, `${method} ${path}`).toBe(404);
      }
    }
  });
});

describe("createApp with units to attack", () => {
  const unit = (id: string, definition: string, x: number, y: number, playerId = "player-2") => ({
    identifier: { id, gameId: "game-1" },
    definition: { scope: "unit", name: definition },
    position: { x, y },
    moved: false,
    acted: false,
    health: 100,
    playerId,
    movementId: "movement-1",
    offenseIds: [],
    transportIds: [],
  });

  /** An app on a copy of the repo's config, whose unit file also holds the enemies and the ally. */
  const start = () => {
    const { directory, appConfig } = copyConfig();
    addObjects(directory, "unit", [
      unit("enemy-recon", "recon", 4, 2), // next to the tank at (3, 2); the tank cannon does 85 to it, the machine gun 40
      unit("enemy-infantry", "infantry", 3, 3), // next to the tank; only the machine gun can hurt it
      unit("enemy-lander", "lander", 2, 2), // next to the tank; only the cannon can hurt it, and it has 9 rounds
      unit("far-recon", "recon", 10, 10), // out of range
      unit("ally-recon", "recon", 3, 1, "player-1"), // next to the tank, on its side
    ]);
    return { app: createApp({ appConfigPath: appConfig }), directory, appConfig };
  };

  /** The URI of the attacks of the tank: `/game/game-1/unit/unit-1/attack`. With a target, the URI of the attack on it: `/game/game-1/unit/unit-1/attack/enemy-recon`. */
  const attackPath = (targetId?: string) => `/game/game-1/unit/unit-1/attack${targetId ? `/${targetId}` : ""}`;
  const healthOf = async (app: ReturnType<typeof createApp>, id: string) => (await request(app).get(`/game/game-1/unit/${id}`)).body.health;
  const targetsOf = async (app: ReturnType<typeof createApp>) =>
    (await request(app).get(attackPath())).body.map((actionInput: any) => actionInput.target.identifier.id).sort();

  it("lists the attacks the unit can carry out: on the enemies in range that it can damage", async () => {
    const { app } = start();
    const res = await request(app).get(attackPath());
    expect(res.status).toBe(200);
    expect(await targetsOf(app)).toEqual(["enemy-infantry", "enemy-lander", "enemy-recon"]);
    for (const actionInput of res.body) {
      expect(actionInput.definition).toEqual(attack);
      expect(actionInput.game.identifier).toEqual({ id: "game-1" });
      expect(actionInput.unit.identifier).toEqual({ id: "unit-1", gameId: "game-1" });
    }
  });

  it("gives the attack on a target it can carry out", async () => {
    const { app } = start();
    const res = await request(app).get(attackPath("enemy-recon"));
    expect(res.status).toBe(200);
    expect(res.body.definition).toEqual(attack);
    expect(res.body.target.identifier).toEqual({ id: "enemy-recon", gameId: "game-1" });
    expect(res.body.target.health).toBe(100);
  });

  it.each(["far-recon", "ally-recon"])("returns 404 for the attack on %s, which cannot be carried out", async (targetId) => {
    const { app } = start();
    const res = await request(app).get(attackPath(targetId));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: `Unit ${targetId} cannot be attacked by unit unit-1` });
  });

  it.each(["far-recon", "ally-recon"])("returns 409 when asked to carry out the attack on %s", async (targetId) => {
    const { app } = start();
    const res = await request(app).post(attackPath(targetId));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: `Unit ${targetId} cannot be attacked by unit unit-1` });
    expect(await healthOf(app, targetId)).toBe(100);
  });

  it("takes the damage of the first weapon that can hurt the target off its health", async () => {
    const { app } = start();
    const res = await request(app).post(attackPath("enemy-recon"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ definition: attack, target: { identifier: { id: "enemy-recon" }, health: 15 }, offense: { identifier: { id: "offense-1" } } }); // the tank cannon
    expect(await healthOf(app, "enemy-recon")).toBe(15);
  });

  it("falls back to the weapon that can hurt the target when the first cannot", async () => {
    const { app } = start();
    const res = await request(app).post(attackPath("enemy-infantry"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ definition: attack, target: { identifier: { id: "enemy-infantry" }, health: 25 }, offense: { identifier: { id: "offense-2" } } }); // the machine gun
    expect(await healthOf(app, "enemy-infantry")).toBe(25);
  });

  it("removes a unit the damage takes below zero health, taking the whole damage off its health", async () => {
    const { directory, appConfig } = copyConfig();
    addObjects(directory, "unit", [{ ...unit("wounded-recon", "recon", 4, 2), health: 30 }]);
    const app = createApp({ appConfigPath: appConfig });
    const res = await request(app).post(attackPath("wounded-recon"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ definition: attack, target: { identifier: { id: "wounded-recon" }, health: -55 }, offense: { identifier: { id: "offense-1" } } });
    expect((await request(app).get("/game/game-1/unit/wounded-recon")).status).toBe(404);
    expect((await request(app).post(attackPath("wounded-recon"))).status).toBe(404);
    const units = (await request(app).get("/game/game-1/unit")).body.map((unit: any) => unit.identifier.id);
    expect(units).not.toContain("wounded-recon");
  });

  it("refuses to move the unit onto an ally", async () => {
    const { app } = start();
    expect((await request(app).post("/game/game-1/unit/unit-1/move/terrain-2")).status).toBe(409); // the ally recon is at (3, 1)
  });

  it("refuses to move the unit onto an enemy", async () => {
    const { app } = start();
    expect((await request(app).post("/game/game-1/unit/unit-1/move/terrain-14")).status).toBe(409); // the enemy lander is at (2, 2)
  });

  it("lists no attacks, and refuses any, once the unit has acted", async () => {
    const { app } = start();
    await request(app).post(attackPath("enemy-recon"));
    expect(await targetsOf(app)).toEqual([]);
    expect((await request(app).post(attackPath("enemy-infantry"))).status).toBe(409);
    expect(await healthOf(app, "enemy-infantry")).toBe(100);
  });

  it("removes a unit the damage brings to exactly zero health", async () => {
    const { directory, appConfig } = copyConfig();
    addObjects(directory, "unit", [{ ...unit("wounded-recon", "recon", 4, 2), health: 85 }]); // the tank cannon does 85
    const app = createApp({ appConfigPath: appConfig });
    const res = await request(app).post(attackPath("wounded-recon"));
    expect(res.body).toMatchObject({ definition: attack, target: { identifier: { id: "wounded-recon" }, health: 0 }, offense: { identifier: { id: "offense-1" } } });
    expect((await request(app).get("/game/game-1/unit/wounded-recon")).status).toBe(404);
  });

  it("keeps a unit the damage leaves with 1 health", async () => {
    const { directory, appConfig } = copyConfig();
    addObjects(directory, "unit", [{ ...unit("wounded-recon", "recon", 4, 2), health: 86 }]);
    const app = createApp({ appConfigPath: appConfig });
    await request(app).post(attackPath("wounded-recon"));
    expect(await healthOf(app, "wounded-recon")).toBe(1);
  });

  it("marks the attacker as acted, leaving its health as it was, and the other units alone", async () => {
    const { app } = start();
    await request(app).post(attackPath("enemy-recon"));
    expect((await request(app).get("/game/game-1/unit/unit-1")).body.acted).toBe(true);
    expect(await healthOf(app, "unit-1")).toBe(100);
    expect(await healthOf(app, "enemy-infantry")).toBe(100);
    expect(await healthOf(app, "far-recon")).toBe(100);
  });

  it("refuses an attack only a weapon with no ammo left could make", async () => {
    const { directory, appConfig } = copyConfig();
    addObjects(directory, "unit", [unit("enemy-lander", "lander", 2, 2), unit("enemy-recon", "recon", 4, 2)]);
    editObjects(directory, "offense", (offenses) => {
      offenses.find((offense) => offense.identifier.id === "offense-1").ammo = 0; // the cannon
    });
    const app = createApp({ appConfigPath: appConfig });
    // The cannon is empty, and the machine gun cannot hurt a lander.
    expect(await targetsOf(app)).toEqual(["enemy-recon"]);
    expect((await request(app).post(attackPath("enemy-lander"))).status).toBe(409);
    expect(await healthOf(app, "enemy-lander")).toBe(100);
  });

  it("only changes the app's memory, not the object files", async () => {
    const { app, directory } = start();
    const files = ["game", "offense", "player", "terrain", "unit"].map((scope) => join(directory, "object", `${scope}.json`));
    const before = files.map((file) => readFileSync(file, "utf8"));
    await request(app).post(attackPath("enemy-lander"));
    expect(files.map((file) => readFileSync(file, "utf8"))).toEqual(before);
  });

  it("starts again from the files, in another app", async () => {
    const { app, appConfig } = start();
    await request(app).post(attackPath("enemy-recon"));
    expect(await healthOf(app, "enemy-recon")).toBe(15);
    expect(await healthOf(createApp({ appConfigPath: appConfig }), "enemy-recon")).toBe(100);
  });
});

describe("createApp with a unit on a city", () => {
  const infantry = {
    identifier: { id: "infantry-1", gameId: "game-1" },
    definition: { scope: "unit", name: "infantry" },
    position: { x: 9, y: 2 }, // the city terrain-20
    moved: false,
    acted: false,
    health: 100,
    playerId: "player-1",
    movementId: "movement-1",
    offenseIds: [],
    transportIds: [],
  };

  const start = () => {
    const { directory, appConfig } = copyConfig();
    addObjects(directory, "unit", [infantry]);
    return createApp({ appConfigPath: appConfig });
  };

  it("takes a tenth of the unit's health off the city, marks the unit as acted, and refuses a second capture", async () => {
    const app = start();
    const capture = { scope: "action", name: "capture" };

    const first = await request(app).post("/game/game-1/unit/infantry-1/capture");
    expect(first.body).toMatchObject({ definition: capture, unit: { identifier: { id: "infantry-1" }, acted: true }, target: { identifier: { id: "terrain-20" }, health: 10 } });
    expect((await request(app).get("/game/game-1/terrain/terrain-20")).body).toMatchObject({ health: 10 });
    expect((await request(app).get("/game/game-1/unit/infantry-1")).body.acted).toBe(true);
    expect((await request(app).post("/game/game-1/unit/infantry-1/capture")).status).toBe(409);
  });

  it("refuses a unit that cannot capture, or is not on terrain that can be captured", async () => {
    const app = start();
    expect((await request(app).get("/game/game-1/unit/unit-1/capture")).status).toBe(404);
    expect((await request(app).post("/game/game-1/unit/unit-1/capture")).status).toBe(409);
  });

  it("hands the turn to the next player, then to the first of the next turn", async () => {
    const app = start();
    const endTurn = { scope: "action", name: "end-turn" };

    expect((await request(app).get("/game/game-1/end-turn")).body.game).toMatchObject({ turn: 0, playerTurn: 1 });
    expect((await request(app).post("/game/game-1/end-turn")).body).toMatchObject({ definition: endTurn, game: { turn: 0, playerTurn: 1 } });
    expect((await request(app).post("/game/game-1/end-turn")).body).toMatchObject({ definition: endTurn, game: { turn: 1, playerTurn: 0 } });
    expect((await request(app).get("/game/game-1")).body).toMatchObject({ turn: 1, playerTurn: 0 });
  });

  it("makes the units of the player who has the turn next ready again", async () => {
    const { directory, appConfig } = copyConfig();
    addObjects(directory, "unit", [{ ...infantry, playerId: "player-2", moved: true, acted: true }]);
    const app = createApp({ appConfigPath: appConfig });

    await request(app).post("/game/game-1/end-turn");

    expect((await request(app).get("/game/game-1/unit/infantry-1")).body).toMatchObject({ moved: false, acted: false });
  });

  it("returns 404 for the end of the turn of an unknown game", async () => {
    expect((await request(start()).post("/game/nope/end-turn")).status).toBe(404);
  });
});

describe("createApp start-up", () => {
  it("fails when the app config does not exist", () => {
    const { directory } = copyConfig();
    expect(() => createApp({ appConfigPath: join(directory, "missing.json") })).toThrow("cannot be parsed");
  });

  it("fails, naming the file, when a definition file is not valid", () => {
    const { directory, appConfig } = copyConfig();
    writeFileSync(join(directory, "definition", "unit.config.json"), "[ not json");
    expect(() => createApp({ appConfigPath: appConfig })).toThrow("unit.config.json cannot be parsed");
  });

  it("fails, naming the file, when an object file holds an object of another scope", () => {
    const { directory, appConfig } = copyConfig();
    addObjects(directory, "unit", objectsOf("game"));
    expect(() => createApp({ appConfigPath: appConfig })).toThrow("unit.json");
  });
});

describe("createApp moving", () => {
  /** The URI of the moves of the tank: `/game/game-1/unit/unit-1/move`. With a terrain, the URI of the move onto it: `/game/game-1/unit/unit-1/move/terrain-16`. */
  const movePath = (terrainId?: string) => `/game/game-1/unit/unit-1/move${terrainId ? `/${terrainId}` : ""}`;

  /** An app on a copy of the repo's config, where the tank is at (3, 2) with 60 fuel; `change` can edit the copy's objects first. */
  function start(change: (directory: string) => void = () => undefined) {
    const { directory, appConfig } = copyConfig();
    change(directory);
    return { app: createApp({ appConfigPath: appConfig }), directory };
  }

  const tankOf = async (app: ReturnType<typeof createApp>) => (await request(app).get("/game/game-1/unit/unit-1")).body;

  it("lists the terrain next to the unit that it can move onto", async () => {
    const { app } = start();
    const res = await request(app).get(movePath());
    expect(res.status).toBe(200);
    expect(res.body.map((move: any) => move.targets[0].identifier.id)).toEqual(["terrain-2", "terrain-14", "terrain-16", "terrain-27"]);
    expect(res.body[0].definition).toEqual({ scope: "action", name: "move" });
  });

  it("leaves out the terrain the unit's movement cannot enter", async () => {
    const { app } = start((directory) =>
      editObjects(directory, "terrain", (terrain) => {
        terrain.find((object) => object.identifier.id === "terrain-16").definition.name = "mountain"; // a tread has no cost for a mountain
      }),
    );
    const res = await request(app).get(movePath());
    expect(res.body.map((move: any) => move.targets[0].identifier.id)).toEqual(["terrain-2", "terrain-14", "terrain-27"]);
    expect((await request(app).post(movePath("terrain-16"))).status).toBe(409);
  });

  it("previews a move without making it", async () => {
    const { app } = start();
    const res = await request(app).get(movePath("terrain-16"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ unit: { identifier: { id: "unit-1" }, position: { x: 4, y: 2 }, moved: true }, movement: { fuel: 59 } });
    expect((await tankOf(app)).position).toEqual({ x: 3, y: 2 });
    expect((await request(app).post(movePath("terrain-16"))).body.movement.fuel).toBe(59); // the preview spent none of the 60
  });

  it("makes the move: the unit is on the terrain, and the cost of it is off its fuel", async () => {
    const { app } = start();
    const res = await request(app).post(movePath("terrain-16"));
    expect(res.status).toBe(200);
    const tank = await tankOf(app);
    const [movement] = objectsOf("movement");
    expect(res.body).toEqual({ definition: { scope: "action", name: "move" }, unit: tank, movement: { ...movement, fuel: 59 }, interrupted: false });
    expect(tank.position).toEqual({ x: 4, y: 2 });
    expect(tank.moved).toBe(true);
    expect(tank.health).toBe(100);
  });

  it("lists no moves, and refuses any, once the unit has acted", async () => {
    const { app } = start((directory) =>
      editObjects(directory, "unit", (units) => {
        units[0].acted = true;
      }),
    );
    expect((await request(app).get(movePath())).body).toEqual([]);
    expect((await request(app).post(movePath("terrain-16"))).status).toBe(409);
    expect((await tankOf(app)).position).toEqual({ x: 3, y: 2 });
  });

  it("lists no moves, and refuses any, once the unit has moved", async () => {
    const { app } = start();
    await request(app).post(movePath("terrain-16"));
    expect((await request(app).get(movePath())).body).toEqual([]);
    expect((await request(app).post(movePath("terrain-28"))).status).toBe(409);
    expect((await tankOf(app)).position).toEqual({ x: 4, y: 2 });
  });

  it("leaves out the sea of the map, which the unit's movement cannot enter", async () => {
    const { app } = start((directory) =>
      editObjects(directory, "unit", (units) => {
        units[0].position = { x: 1, y: 2 }; // the sea is at (1, 1) and (0, 2)
      }),
    );
    const res = await request(app).get(movePath());
    expect(res.body.map((move: any) => move.targets[0].identifier.id)).toEqual(["terrain-14", "terrain-25"]);
    expect((await request(app).get(movePath("sea-31"))).status).toBe(404);
    expect((await request(app).post(movePath("sea-31"))).status).toBe(409);
  });

  it("refuses a terrain that is not next to the unit", async () => {
    const { app } = start();
    const post = await request(app).post(movePath("terrain-1"));
    expect(post.status).toBe(409);
    expect(post.body).toEqual({ error: "Unit unit-1 cannot move onto terrain terrain-1" });
    expect((await request(app).get(movePath("terrain-1"))).status).toBe(404);
    expect((await tankOf(app)).position).toEqual({ x: 3, y: 2 });
  });

  it("refuses to move a unit with no fuel left", async () => {
    const { app } = start((directory) =>
      editObjects(directory, "movement", (movements) => {
        movements[0].fuel = 0;
      }),
    );
    expect((await request(app).post(movePath("terrain-16"))).status).toBe(409);
    expect((await request(app).get(movePath())).body).toEqual([]);
  });

  it("returns 404 for a terrain that is not in the game, and for a unit that is not", async () => {
    const { app } = start();
    const terrain = await request(app).post(movePath("nope"));
    expect(terrain.status).toBe(404);
    expect(terrain.body).toEqual({ error: "Terrain nope not found in game game-1" });
    expect((await request(app).get("/game/game-1/unit/nope/move")).status).toBe(404);
  });

  it("only changes the app's memory, not the object files", async () => {
    const { app, directory } = start();
    const file = join(directory, "object", "unit.json");
    const before = readFileSync(file, "utf8");
    await request(app).post(movePath("terrain-16"));
    expect(readFileSync(file, "utf8")).toBe(before);
  });
});

describe("createApp deploying", () => {
  /** The URI of the deploy onto a terrain: `/game/game-1/deploy/terrain-45`. The unit to deploy goes in the body, or in the query when previewing: `?unit=infantry`. */
  const deployPath = (terrainId: string) => `/game/game-1/deploy/${terrainId}`;
  const everyone = (app: ReturnType<typeof createApp>) => request(app).get("/game/game-1/unit").then((res) => res.body.map((unit: any) => unit.identifier.id));
  const fundsOf = async (app: ReturnType<typeof createApp>, id = "player-1") => (await request(app).get(`/game/game-1/player/${id}`)).body.funds;

  /**
   * An app on a copy of the repo's config where player-1 has `funds`. On Spann Island, terrain-45 at (1, 5) and
   * terrain-56 at (1, 6) are bases of player-1, and terrain-10 at (11, 1) is a base of player-2.
   */
  function start(funds = 10000, change: (directory: string) => void = () => undefined) {
    const { directory, appConfig } = copyConfig();
    editObjects(directory, "player", (players) => {
      players[0].funds = funds;
    });
    change(directory);
    return { app: createApp({ appConfigPath: appConfig }), directory };
  }

  it("deploys a new unit on the terrain, for the player whose turn it is", async () => {
    const { app } = start();
    const res = await request(app).post(deployPath("terrain-45")).send({ unit: "infantry" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      identifier: { id: "unit-2", gameId: "game-1" },
      definition: { scope: "unit", name: "infantry" },
      position: { x: 1, y: 5 },
      moved: false,
      acted: false,
      health: 100,
      playerId: "player-1",
      movementId: "movement-1",
      offenseIds: ["offense-1"],
      transportIds: [],
    });
  });

  it("saves the new unit and the funds", async () => {
    const { app } = start();
    await request(app).post(deployPath("terrain-45")).send({ unit: "infantry" });
    expect(await everyone(app)).toEqual(["unit-1", "unit-2"]);
    expect((await request(app).get("/game/game-1/unit/unit-2")).body.position).toEqual({ x: 1, y: 5 });
    expect(await fundsOf(app)).toBe(9000);
    expect(await fundsOf(app, "player-2")).toBe(0);
  });

  it("deploys for the player whose turn it is, whichever that is, and takes the cost off their funds", async () => {
    const { app } = start(10000, (directory) => {
      editObjects(directory, "game", (games) => {
        games[0].playerTurn = 1;
      });
      editObjects(directory, "player", (players) => {
        players[1].funds = 5000;
      });
    });
    const res = await request(app).post(deployPath("terrain-10")).send({ unit: "infantry" });
    expect(res.status).toBe(200);
    expect(res.body.playerId).toBe("player-2");
    expect(await fundsOf(app, "player-2")).toBe(4000);
    expect(await fundsOf(app)).toBe(10000);
  });

  it("refuses to deploy when no player has the turn", async () => {
    const { app } = start(10000, (directory) =>
      editObjects(directory, "game", (games) => {
        games[0].playerTurn = 5;
      }),
    );
    const post = await request(app).post(deployPath("terrain-45")).send({ unit: "infantry" });
    expect(post.status).toBe(409);
    expect(post.body).toEqual({ error: "Unit infantry cannot be deployed on terrain terrain-45" });
    expect((await request(app).get(`${deployPath("terrain-45")}?unit=infantry`)).status).toBe(404);
    expect(await everyone(app)).toEqual(["unit-1"]);
  });

  it("previews a deploy without making it", async () => {
    const { app } = start();
    const res = await request(app).get(`${deployPath("terrain-45")}?unit=infantry`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ unit: { identifier: { id: "unit-2" }, definition: { scope: "unit", name: "infantry" } }, player: { identifier: { id: "player-1" }, funds: 9000 } });
    expect(await everyone(app)).toEqual(["unit-1"]);
    expect(await fundsOf(app)).toBe(10000);
  });

  it("deploys a unit that can move, and attack with the offenses it was given", async () => {
    const { app } = start(10000, (directory) =>
      addObjects(directory, "unit", [
        {
          identifier: { id: "enemy-infantry", gameId: "game-1" },
          definition: { scope: "unit", name: "infantry" },
          position: { x: 2, y: 4 },
          moved: false,
          acted: false,
          health: 100,
          playerId: "player-2",
          movementId: "movement-1",
          offenseIds: [],
          transportIds: [],
        },
      ]),
    );
    await request(app).post(deployPath("terrain-45")).send({ unit: "infantry" });

    const move = await request(app).post("/game/game-1/unit/unit-2/move/terrain-47");
    expect(move.status).toBe(409); // two squares away
    expect((await request(app).post("/game/game-1/unit/unit-2/move/terrain-35")).status).toBe(200); // (1, 4) is next to (1, 5)

    const attack = await request(app).post("/game/game-1/unit/unit-2/attack/enemy-infantry");
    expect(attack.status).toBe(200); // (2, 4) is next to (1, 4)
    expect((await request(app).get("/game/game-1/unit/enemy-infantry")).body.health).toBe(45); // the rifle: 55
  });

  it("deploys one unit after another with the next id, until the funds run out", async () => {
    const { app } = start(1500);
    const first = await request(app).post(deployPath("terrain-45")).send({ unit: "infantry" });
    expect(first.body.identifier.id).toBe("unit-2");
    expect(await fundsOf(app)).toBe(500);
    const second = await request(app).post(deployPath("terrain-56")).send({ unit: "infantry" });
    expect(second.status).toBe(409);
    expect(await everyone(app)).toEqual(["unit-1", "unit-2"]);
  });

  it("refuses a second unit on the same terrain", async () => {
    const { app } = start();
    expect((await request(app).post(deployPath("terrain-45")).send({ unit: "infantry" })).status).toBe(200);
    const again = await request(app).post(deployPath("terrain-45")).send({ unit: "infantry" });
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: "Unit infantry cannot be deployed on terrain terrain-45" });
    expect(await fundsOf(app)).toBe(9000);
  });

  it.each([
    ["a terrain the player does not control", "terrain-14", "infantry", 10000],
    ["the sea of the map", "sea-2", "infantry", 10000],
    ["a terrain another player controls", "terrain-10", "infantry", 10000],
    ["a unit the player cannot afford", "terrain-45", "infantry", 999],
    ["a unit that is not defined", "terrain-45", "ghost", 10000],
  ])("refuses to deploy on %s", async (_reason, terrainId, unit, funds) => {
    const { app } = start(funds);
    const res = await request(app).post(deployPath(terrainId)).send({ unit });
    expect(res.status).toBe(409);
    expect(await everyone(app)).toEqual(["unit-1"]);
    expect(await fundsOf(app)).toBe(funds);
  });

  it("asks for the name of the unit, and for a terrain that is in the game", async () => {
    const { app } = start();
    const unnamed = await request(app).post(deployPath("terrain-45")).send({});
    expect(unnamed.status).toBe(400);
    expect(unnamed.body).toEqual({ error: 'Expected the name of the unit to deploy as "unit"' });
    const unknown = await request(app).post(deployPath("nope")).send({ unit: "infantry" });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: "Terrain nope not found in game game-1" });
  });

  it("only changes the app's memory, not the object files", async () => {
    const { app, directory } = start();
    const files = ["unit", "offense", "player"].map((scope) => join(directory, "object", `${scope}.json`));
    const before = files.map((file) => readFileSync(file, "utf8"));
    await request(app).post(deployPath("terrain-45")).send({ unit: "tank" });
    expect(files.map((file) => readFileSync(file, "utf8"))).toEqual(before);
  });
});

describe("createApp loading and unloading", () => {
  const move = { scope: "action", name: "move" };
  const unload = { scope: "action", name: "unload" };

  /** A unit of player-1 of the kind `definition` at (`x`, `y`), as the object file holds it. */
  const unit = (id: string, definition: string, x: number, y: number) => ({
    identifier: { id, gameId: "game-1" },
    definition: { scope: "unit", name: definition },
    position: { x, y },
    moved: false,
    acted: false,
    health: 100,
    playerId: "player-1",
    movementId: "movement-1",
    offenseIds: [],
    transportIds: [],
  });

  /** The movement of the unit `unitId`, as the object file holds it. */
  const movement = (unitId: string, name: string, fuel: number) => ({
    identifier: { id: "movement-1", gameId: "game-1", unitId },
    definition: { scope: "movement", name },
    fuel,
  });

  /**
   * An app on a copy of the repo's config where, on Spann Island, an apc is on the plain terrain-36 at (2, 4), with an
   * infantry next to it on the plain terrain-35 at (1, 4), another on the city terrain-26 at (2, 3), and a recon on the road terrain-46 at (2, 5).
   */
  function start() {
    const { directory, appConfig } = copyConfig();
    addObjects(directory, "unit", [unit("apc-1", "apc", 2, 4), unit("infantry-1", "infantry", 1, 4), unit("infantry-2", "infantry", 2, 3), unit("recon-1", "recon", 2, 5)]);
    addObjects(directory, "movement", [movement("apc-1", "tread", 70), movement("infantry-1", "foot", 99), movement("infantry-2", "foot", 99), movement("recon-1", "tire", 80)]);
    return { app: createApp({ appConfigPath: appConfig }), directory };
  }

  const unitOf = async (app: ReturnType<typeof createApp>, id: string) => (await request(app).get(`/game/game-1/unit/${id}`)).body;
  const movesOf = async (app: ReturnType<typeof createApp>, id: string) => (await request(app).get(`/game/game-1/unit/${id}/move`)).body;
  const unloadsOf = async (app: ReturnType<typeof createApp>, id: string) =>
    (await request(app).get(`/game/game-1/unit/${id}/unload`)).body.map((input: any) => `${input.target.identifier.id} onto ${input.terrain.identifier.id}`).sort();
  const loadInto = (app: ReturnType<typeof createApp>) => request(app).post("/game/game-1/unit/infantry-1/move/terrain-36");

  it("lists the move onto the carrier's square among the moves of a unit the carrier can load", async () => {
    expect((await movesOf(start().app, "infantry-1")).map((input: any) => input.targets[0].identifier.id)).toContain("terrain-36");
  });

  it("previews a move onto the carrier without making it: the unit on the carrier's square, and the carrier transporting the unit", async () => {
    const { app } = start();

    const res = await request(app).get("/game/game-1/unit/infantry-1/move/terrain-36");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ unit: { position: { x: 2, y: 4 }, moved: true }, interrupted: false, transport: { identifier: { id: "apc-1" }, transportIds: ["infantry-1"] } });
    expect(await unitOf(app, "infantry-1")).toEqual(unit("infantry-1", "infantry", 1, 4));
    expect(await unitOf(app, "apc-1")).toEqual(unit("apc-1", "apc", 2, 4));
  });

  it("loads the unit by moving it onto the carrier: it spends the fuel, is on the carrier's square as moved, and is transported by the carrier", async () => {
    const { app } = start();

    const res = await loadInto(app);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ definition: move, unit: { position: { x: 2, y: 4 }, moved: true }, movement: { fuel: 98 }, interrupted: false, transport: { identifier: { id: "apc-1" }, transportIds: ["infantry-1"] } });
    expect(await unitOf(app, "apc-1")).toEqual({ ...unit("apc-1", "apc", 2, 4), transportIds: ["infantry-1"] });
  });

  it("has no load route of its own: a unit loads by moving", async () => {
    expect((await request(start().app).get("/game/game-1/unit/infantry-1/load")).status).toBe(404);
  });

  it("refuses a move onto a carrier whose transport definition does not allow the unit, and onto one that holds the most it can", async () => {
    const { app } = start();
    expect((await request(app).get("/game/game-1/unit/recon-1/move/terrain-36")).status).toBe(404);
    expect((await request(app).get("/game/game-1/unit/infantry-2/move/terrain-36")).status).toBe(200);

    await loadInto(app);

    expect((await request(app).get("/game/game-1/unit/infantry-2/move/terrain-36")).status).toBe(404);
    expect((await request(app).post("/game/game-1/unit/infantry-2/move/terrain-36")).status).toBe(409);
  });

  it("keeps a loaded unit from moving, even on its player's next turn, and off the square it loaded on once the carrier has left", async () => {
    const { app } = start();
    await loadInto(app);
    await request(app).post("/game/game-1/unit/apc-1/move/terrain-37");
    await request(app).post("/game/game-1/end-turn");
    await request(app).post("/game/game-1/end-turn");

    expect(await unitOf(app, "infantry-1")).toMatchObject({ moved: false, acted: false });
    expect(await unitOf(app, "apc-1")).toMatchObject({ position: { x: 3, y: 4 }, transportIds: ["infantry-1"] });
    expect(await movesOf(app, "infantry-1")).toEqual([]);
    expect((await request(app).get("/game/game-1/unit/recon-1/move/terrain-36")).status).toBe(200);
  });

  it("lets the carrier move with the unit, then unload it next to where the carrier is, as moved and acted, no longer transported", async () => {
    const { app } = start();
    await loadInto(app);
    expect((await request(app).post("/game/game-1/unit/apc-1/move/terrain-37")).status).toBe(200); // the road at (3, 4)

    expect(await unloadsOf(app, "apc-1")).toEqual(["infantry-1 onto terrain-27", "infantry-1 onto terrain-36", "infantry-1 onto terrain-38", "infantry-1 onto terrain-47"]);
    const res = await request(app).post("/game/game-1/unit/apc-1/unload/infantry-1/terrain-38");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      definition: unload,
      unit: { identifier: { id: "apc-1" }, position: { x: 3, y: 4 }, acted: true, transportIds: [] },
      target: { identifier: { id: "infantry-1" }, position: { x: 4, y: 4 }, moved: true, acted: true },
    });
    expect(await unitOf(app, "apc-1")).toMatchObject({ transportIds: [] });
  });

  it("previews an unload without making it", async () => {
    const { app } = start();
    await loadInto(app);

    const res = await request(app).get("/game/game-1/unit/apc-1/unload/infantry-1/terrain-35");

    expect(res.status).toBe(200);
    expect(res.body.target).toMatchObject({ position: { x: 1, y: 4 }, moved: true, acted: true });
    expect(await unitOf(app, "apc-1")).toMatchObject({ transportIds: ["infantry-1"] });
  });

  it("lets the carrier unload once a turn, after which neither it nor the unloaded unit can move", async () => {
    const { app } = start();
    await loadInto(app);
    expect((await request(app).post("/game/game-1/unit/apc-1/unload/infantry-1/terrain-35")).status).toBe(200);

    expect(await unloadsOf(app, "apc-1")).toEqual([]);
    expect(await movesOf(app, "apc-1")).toEqual([]);
    expect(await movesOf(app, "infantry-1")).toEqual([]);
  });

  it("refuses to unload a unit the carrier does not hold, and returns 404 for an unknown unit or terrain", async () => {
    const { app } = start();
    expect((await request(app).get("/game/game-1/unit/apc-1/unload/infantry-1/terrain-37")).status).toBe(404);
    expect((await request(app).post("/game/game-1/unit/apc-1/unload/infantry-1/terrain-37")).status).toBe(409);
    expect((await request(app).get("/game/game-1/unit/apc-1/unload/nope/terrain-37")).body).toEqual({ error: "Unit nope not found in game game-1" });
    expect((await request(app).get("/game/game-1/unit/apc-1/unload/infantry-1/nope")).body).toEqual({ error: "Terrain nope not found in game game-1" });
  });

  it("only changes the app's memory, not the object files", async () => {
    const { app, directory } = start();
    const files = ["unit", "movement"].map((scope) => join(directory, "object", `${scope}.json`));
    const before = files.map((file) => readFileSync(file, "utf8"));
    await loadInto(app);
    await request(app).post("/game/game-1/unit/apc-1/unload/infantry-1/terrain-35");
    expect(files.map((file) => readFileSync(file, "utf8"))).toEqual(before);
  });
});
