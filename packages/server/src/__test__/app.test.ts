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
      for (const path of ["player", "player/player-1", "unit", "unit/unit-1", "unit/unit-1/attack", "terrain/terrain-1"]) {
        const res = await request(app).get(`/game/nope/${path}`);
        expect(res.status, path).toBe(404);
        expect(res.body, path).toEqual({ error: "Game nope not found" });
      }
    });
  });

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

  describe("terrain", () => {
    it("gives a terrain by its id, with the key of its definition and its position", async () => {
      const res = await request(app).get("/game/game-1/terrain/terrain-600");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(terrain[599]);
      expect(res.body.definition).toEqual({ scope: "terrain", name: "plain" });
      expect(res.body.position).toEqual({ x: 29, y: 19 });
    });

    it("returns 404 for an unknown terrain", async () => {
      const res = await request(app).get("/game/game-1/terrain/nope");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Terrain nope not found in game game-1" });
    });
  });

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
    for (const path of ["/game", "/game/game-1", "/game/game-1/player", "/game/game-1/unit", "/game/game-1/unit/unit-1", "/game/game-1/unit/unit-1/attack"]) {
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
    fuel: 99,
    playerId,
    offenseIds: [],
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

  const attackPath = (targetId?: string) => `/game/game-1/unit/unit-1/attack${targetId ? `/${targetId}` : ""}`;
  const healthOf = async (app: ReturnType<typeof createApp>, id: string) => (await request(app).get(`/game/game-1/unit/${id}`)).body.health;
  const targetsOf = async (app: ReturnType<typeof createApp>) =>
    (await request(app).get(attackPath())).body.map((action: any) => action.target.identifier.id).sort();

  it("lists the attacks the unit can carry out: on the enemies in range that it can damage", async () => {
    const { app } = start();
    const res = await request(app).get(attackPath());
    expect(res.status).toBe(200);
    expect(await targetsOf(app)).toEqual(["enemy-infantry", "enemy-lander", "enemy-recon"]);
    for (const action of res.body) {
      expect(action.definition).toEqual(attack);
      expect(action.game.identifier).toEqual({ id: "game-1" });
      expect(action.unit.identifier).toEqual({ id: "unit-1", gameId: "game-1" });
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
    expect(res.body.target.health).toBe(15); // the tank cannon: 85
    expect(await healthOf(app, "enemy-recon")).toBe(15);
  });

  it("falls back to the weapon that can hurt the target when the first cannot", async () => {
    const { app } = start();
    const res = await request(app).post(attackPath("enemy-infantry"));
    expect(res.status).toBe(200);
    expect(res.body.target.health).toBe(25); // the machine gun: 75
    expect(await healthOf(app, "enemy-infantry")).toBe(25);
  });

  it("gives a unit the damage takes below zero health as having none, and then removes it", async () => {
    const { app } = start();
    await request(app).post(attackPath("enemy-recon"));
    const res = await request(app).post(attackPath("enemy-recon"));
    expect(res.status).toBe(200);
    expect(res.body.target.health).toBe(0);
    expect((await request(app).get("/game/game-1/unit/enemy-recon")).status).toBe(404);
  });

  it("no longer lists, or lets anyone attack, a unit that was destroyed", async () => {
    const { app } = start();
    await request(app).post(attackPath("enemy-recon"));
    await request(app).post(attackPath("enemy-recon"));
    expect(await targetsOf(app)).toEqual(["enemy-infantry", "enemy-lander"]);
    expect((await request(app).post(attackPath("enemy-recon"))).status).toBe(404);
    const units = (await request(app).get("/game/game-1/unit")).body.map((unit: any) => unit.identifier.id);
    expect(units).not.toContain("enemy-recon");
  });

  it("removes a unit the damage brings to exactly zero health", async () => {
    const { directory, appConfig } = copyConfig();
    addObjects(directory, "unit", [{ ...unit("wounded-recon", "recon", 4, 2), health: 85 }]); // the tank cannon does 85
    const app = createApp({ appConfigPath: appConfig });
    const res = await request(app).post(attackPath("wounded-recon"));
    expect(res.body.target.health).toBe(0);
    expect((await request(app).get("/game/game-1/unit/wounded-recon")).status).toBe(404);
  });

  it("keeps a unit the damage leaves with 1 health", async () => {
    const { directory, appConfig } = copyConfig();
    addObjects(directory, "unit", [{ ...unit("wounded-recon", "recon", 4, 2), health: 86 }]);
    const app = createApp({ appConfigPath: appConfig });
    await request(app).post(attackPath("wounded-recon"));
    expect(await healthOf(app, "wounded-recon")).toBe(1);
  });

  it("leaves the attacker as it was, and the other units alone", async () => {
    const { app } = start();
    await request(app).post(attackPath("enemy-recon"));
    expect(await healthOf(app, "unit-1")).toBe(100);
    expect(await healthOf(app, "enemy-infantry")).toBe(100);
    expect(await healthOf(app, "far-recon")).toBe(100);
  });

  it("uses up a round of ammo with every attack, and stops when there is none left", async () => {
    const { app } = start();
    for (let round = 1; round <= 9; round++) {
      const res = await request(app).post(attackPath("enemy-lander"));
      expect(res.status, `round ${round}`).toBe(200);
      expect(res.body.target.health).toBe(100 - 10 * round);
    }
    // The cannon is empty, and the machine gun cannot hurt a lander.
    expect((await request(app).post(attackPath("enemy-lander"))).status).toBe(409);
    expect(await healthOf(app, "enemy-lander")).toBe(10);
    expect(await targetsOf(app)).toEqual(["enemy-infantry", "enemy-recon"]);
  });

  it("never runs out of the ammo that is unlimited", async () => {
    const { directory, appConfig } = copyConfig();
    const ids = Array.from({ length: 12 }, (_, index) => `infantry-${index}`);
    addObjects(directory, "unit", ids.map((id) => unit(id, "infantry", 3, 3)));
    const app = createApp({ appConfigPath: appConfig });
    for (const id of ids) {
      expect((await request(app).post(attackPath(id))).status).toBe(200);
    }
  });

  it("only changes the app's memory, not the object files", async () => {
    const { app, directory } = start();
    const files = ["game", "offense", "player", "terrain", "unit"].map((scope) => join(directory, "object", `${scope}.json`));
    const before = files.map((file) => readFileSync(file, "utf8"));
    await request(app).post(attackPath("enemy-recon"));
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
    expect(res.body.map((move: any) => move.target.identifier.id)).toEqual(["terrain-34", "terrain-63", "terrain-65", "terrain-94"]);
    expect(res.body[0].definition).toEqual({ scope: "action", name: "move" });
  });

  it("leaves out the terrain the unit's movement cannot enter", async () => {
    const { app } = start((directory) =>
      editObjects(directory, "terrain", (terrain) => {
        terrain.find((object) => object.identifier.id === "terrain-65").definition.name = "mountain"; // a tread has no cost for a mountain
      }),
    );
    const res = await request(app).get(movePath());
    expect(res.body.map((move: any) => move.target.identifier.id)).toEqual(["terrain-34", "terrain-63", "terrain-94"]);
    expect((await request(app).post(movePath("terrain-65"))).status).toBe(409);
  });

  it("previews a move without making it", async () => {
    const { app } = start();
    const res = await request(app).get(movePath("terrain-65"));
    expect(res.status).toBe(200);
    expect(res.body.unit.position).toEqual({ x: 4, y: 2 });
    expect(res.body.unit.fuel).toBe(59);
    expect((await tankOf(app)).position).toEqual({ x: 3, y: 2 });
    expect((await tankOf(app)).fuel).toBe(60);
  });

  it("makes the move: the unit is on the terrain, and the cost of it is off its fuel", async () => {
    const { app } = start();
    const res = await request(app).post(movePath("terrain-65"));
    expect(res.status).toBe(200);
    expect(res.body.unit.position).toEqual({ x: 4, y: 2 });
    const tank = await tankOf(app);
    expect(tank.position).toEqual({ x: 4, y: 2 });
    expect(tank.fuel).toBe(59);
    expect(tank.health).toBe(100);
  });

  it("goes on from where the unit got to", async () => {
    const { app } = start();
    await request(app).post(movePath("terrain-65"));
    const list = await request(app).get(movePath());
    expect(list.body.map((move: any) => move.target.identifier.id)).toEqual(["terrain-35", "terrain-64", "terrain-66", "terrain-95"]);
    expect((await request(app).post(movePath("terrain-66"))).status).toBe(200);
    expect((await tankOf(app)).position).toEqual({ x: 5, y: 2 });
    expect((await tankOf(app)).fuel).toBe(58);
  });

  it("refuses a terrain that is not next to the unit", async () => {
    const { app } = start();
    const post = await request(app).post(movePath("terrain-1"));
    expect(post.status).toBe(409);
    expect(post.body).toEqual({ error: "Unit unit-1 cannot move onto terrain terrain-1" });
    expect((await request(app).get(movePath("terrain-1"))).status).toBe(404);
    expect((await tankOf(app)).position).toEqual({ x: 3, y: 2 });
  });

  it("stops when the fuel runs out", async () => {
    const { app } = start((directory) =>
      editObjects(directory, "unit", (units) => {
        units[0].fuel = 1;
      }),
    );
    expect((await request(app).post(movePath("terrain-65"))).status).toBe(200);
    expect((await tankOf(app)).fuel).toBe(0);
    expect((await request(app).post(movePath("terrain-66"))).status).toBe(409);
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
    await request(app).post(movePath("terrain-65"));
    expect(readFileSync(file, "utf8")).toBe(before);
  });
});

describe("createApp deploying", () => {
  const deployPath = (terrainId: string) => `/game/game-1/deploy/${terrainId}`;
  const everyone = (app: ReturnType<typeof createApp>) => request(app).get("/game/game-1/unit").then((res) => res.body.map((unit: any) => unit.identifier.id));
  const fundsOf = async (app: ReturnType<typeof createApp>, id = "player-1") => (await request(app).get(`/game/game-1/player/${id}`)).body.funds;

  /**
   * An app on a copy of the repo's config where player-1 has `funds`, terrain-2 at (1, 0) is a base of player-1, and
   * terrain-3 at (2, 0) is a base of player-2.
   */
  function start(funds = 10000, change: (directory: string) => void = () => undefined) {
    const { directory, appConfig } = copyConfig();
    editObjects(directory, "terrain", (terrain) => {
      for (const [id, owner] of [["terrain-2", "player-1"], ["terrain-3", "player-2"]]) {
        const object = terrain.find((candidate) => candidate.identifier.id === id);
        object.definition.name = "base";
        object.playerId = owner;
      }
    });
    editObjects(directory, "player", (players) => {
      players[0].funds = funds;
    });
    change(directory);
    return { app: createApp({ appConfigPath: appConfig }), directory };
  }

  it("deploys a new unit on the terrain, for the player whose turn it is, and takes its cost off their funds", async () => {
    const { app } = start();
    const res = await request(app).post(deployPath("terrain-2")).send({ unit: "infantry" });
    expect(res.status).toBe(200);
    expect(res.body.unit).toEqual({
      identifier: { id: "unit-2", gameId: "game-1" },
      definition: { scope: "unit", name: "infantry" },
      position: { x: 1, y: 0 },
      moved: false,
      acted: false,
      health: 100,
      fuel: 99,
      playerId: "player-1",
      offenseIds: ["offense-1"],
    });
    expect(res.body.player.funds).toBe(9000);
  });

  it("saves the new unit and the funds", async () => {
    const { app } = start();
    await request(app).post(deployPath("terrain-2")).send({ unit: "infantry" });
    expect(await everyone(app)).toEqual(["unit-1", "unit-2"]);
    expect((await request(app).get("/game/game-1/unit/unit-2")).body.position).toEqual({ x: 1, y: 0 });
    expect(await fundsOf(app)).toBe(9000);
    expect(await fundsOf(app, "player-2")).toBe(0);
  });

  it("previews a deploy without making it", async () => {
    const { app } = start();
    const res = await request(app).get(`${deployPath("terrain-2")}?unit=infantry`);
    expect(res.status).toBe(200);
    expect(res.body.unit.identifier.id).toBe("unit-2");
    expect(res.body.player.funds).toBe(9000);
    expect(await everyone(app)).toEqual(["unit-1"]);
    expect(await fundsOf(app)).toBe(10000);
  });

  it("deploys a unit that can move, and attack with the offenses it was given", async () => {
    const { app } = start(10000, (directory) =>
      addObjects(directory, "unit", [
        {
          identifier: { id: "enemy-infantry", gameId: "game-1" },
          definition: { scope: "unit", name: "infantry" },
          position: { x: 1, y: 1 },
          moved: false,
          acted: false,
          health: 100,
          fuel: 99,
          playerId: "player-2",
          offenseIds: [],
        },
      ]),
    );
    await request(app).post(deployPath("terrain-2")).send({ unit: "infantry" });

    const attack = await request(app).post("/game/game-1/unit/unit-2/attack/enemy-infantry");
    expect(attack.status).toBe(200);
    expect(attack.body.target.health).toBe(45); // the rifle: 55

    const move = await request(app).post("/game/game-1/unit/unit-2/move/terrain-4");
    expect(move.status).toBe(409); // two squares away
    expect((await request(app).post("/game/game-1/unit/unit-2/move/terrain-32")).status).toBe(200); // (1, 1) is next to (1, 0)
  });

  it("deploys one unit after another with the next id, until the funds run out", async () => {
    const { app } = start(1500, (directory) =>
      editObjects(directory, "terrain", (terrain) => {
        const second = terrain.find((object) => object.identifier.id === "terrain-62");
        second.playerId = "player-1";
      }),
    );
    const first = await request(app).post(deployPath("terrain-2")).send({ unit: "infantry" });
    expect(first.body.unit.identifier.id).toBe("unit-2");
    expect(await fundsOf(app)).toBe(500);
    const second = await request(app).post(deployPath("terrain-62")).send({ unit: "infantry" });
    expect(second.status).toBe(409);
    expect(await everyone(app)).toEqual(["unit-1", "unit-2"]);
  });

  it("refuses a second unit on the same terrain", async () => {
    const { app } = start();
    expect((await request(app).post(deployPath("terrain-2")).send({ unit: "infantry" })).status).toBe(200);
    const again = await request(app).post(deployPath("terrain-2")).send({ unit: "infantry" });
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: "Unit infantry cannot be deployed on terrain terrain-2" });
    expect(await fundsOf(app)).toBe(9000);
  });

  it.each([
    ["a terrain the player does not control", "terrain-4", "infantry", 10000],
    ["a terrain another player controls", "terrain-3", "infantry", 10000],
    ["a unit the player cannot afford", "terrain-2", "infantry", 999],
    ["a unit that is not defined", "terrain-2", "ghost", 10000],
  ])("refuses to deploy on %s", async (_reason, terrainId, unit, funds) => {
    const { app } = start(funds);
    const res = await request(app).post(deployPath(terrainId)).send({ unit });
    expect(res.status).toBe(409);
    expect(await everyone(app)).toEqual(["unit-1"]);
    expect(await fundsOf(app)).toBe(funds);
  });

  it("asks for the name of the unit, and for a terrain that is in the game", async () => {
    const { app } = start();
    const unnamed = await request(app).post(deployPath("terrain-2")).send({});
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
    await request(app).post(deployPath("terrain-2")).send({ unit: "tank" });
    expect(files.map((file) => readFileSync(file, "utf8"))).toEqual(before);
  });
});
