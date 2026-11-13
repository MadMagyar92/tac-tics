import type { DefinitionKey, GameDefinition } from "@tac-tics/api";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanUp, copyConfig, realAppConfig } from "../../../test/config";
import { loadAppConfigFile } from "../../app";
import {
  GameDefinitionHandler,
  MapDefinitionHandler,
  MovementDefinitionHandler,
  OffenseDefinitionHandler,
  PlayerDefinitionHandler,
  sameKey,
  TerrainDefinitionHandler,
  UnitDefinitionHandler,
} from "..";

afterEach(cleanUp);

const game = (name: string, playersMax = 2): GameDefinition => ({ definition: { scope: "game", name }, turnsMax: 100, playersMax });

describe("sameKey", () => {
    const key: DefinitionKey = { scope: "unit", name: "tank" };

    it("is true for keys with the same scope and name", () => {
        expect(sameKey(key, { scope: "unit", name: "tank" })).toBe(true);
        expect(sameKey(key, key)).toBe(true);
    });

    it("is false when only the scope differs", () => {
        expect(sameKey(key, { scope: "offense", name: "tank" })).toBe(false);
    });

    it("is false when only the name differs", () => {
        expect(sameKey(key, { scope: "unit", name: "recon" })).toBe(false);
    });

    it("is false when both differ", () => {
        expect(sameKey(key, { scope: "offense", name: "recon" })).toBe(false);
    });

    it("looks at the scope and the name only", () => {
        expect(sameKey({ ...key, extra: 1 } as DefinitionKey, { ...key, extra: 2 } as DefinitionKey)).toBe(true);
    });
});

describe.each([
    ["game", (appConfig: string) => new GameDefinitionHandler(appConfig, loadAppConfigFile(appConfig))],
    ["map", (appConfig: string) => new MapDefinitionHandler(appConfig, loadAppConfigFile(appConfig))],
    ["movement", (appConfig: string) => new MovementDefinitionHandler(appConfig, loadAppConfigFile(appConfig))],
    ["offense", (appConfig: string) => new OffenseDefinitionHandler(appConfig, loadAppConfigFile(appConfig))],
    ["player", (appConfig: string) => new PlayerDefinitionHandler(appConfig, loadAppConfigFile(appConfig))],
    ["terrain", (appConfig: string) => new TerrainDefinitionHandler(appConfig, loadAppConfigFile(appConfig))],
    ["unit", (appConfig: string) => new UnitDefinitionHandler(appConfig, loadAppConfigFile(appConfig))],
])("the %s definition handler", (scope, create) => {
    const file = join(dirname(realAppConfig), "definition", `${scope}.config.json`);
    const definitions = (): any[] => JSON.parse(readFileSync(file, "utf8"));

    it("has its scope", () => {
        expect(create(realAppConfig).scope).toBe(scope);
    });

    it("accepts keys of its scope and no others", () => {
        const handler = create(realAppConfig);
        expect(handler.accept({ scope, name: "anything" })).toBe(true);
        expect(handler.accept({ scope: `${scope}s`, name: "anything" })).toBe(false);
        expect(handler.accept({ scope: "action", name: "anything" })).toBe(false);
    });

    it("holds the definitions of its file, and no others", () => {
        const handler = create(realAppConfig);
        for (const definition of definitions()) expect(handler.get(definition.definition)).toEqual(definition);
        expect(handler.get({ scope, name: "x" })).toBeUndefined();
    });

    it("gives all its definitions, by their keys, with loadAll", () => {
        const all = create(realAppConfig).loadAll();
        expect([...all.values()]).toEqual(definitions());
        expect([...all.keys()]).toEqual(definitions().map((definition) => definition.definition));
    });
});

/** A copy of the repo's config, with the file of the game definitions holding `definitions`. */
const gameFile = (definitions: unknown) => {
    const { directory, appConfig } = copyConfig();
    const path = join(directory, "definition", "game.config.json");
    writeFileSync(path, typeof definitions === "string" ? definitions : JSON.stringify(definitions));
    return { appConfig, path };
};

/** The game handler on a copy of the repo's config whose game definition file holds exactly `definitions`. */
const gameHandler = (definitions: unknown[]) => {
    const { appConfig } = gameFile(definitions);
    return new GameDefinitionHandler(appConfig, loadAppConfigFile(appConfig));
};

describe("MemoryDefinitionHandler", () => {
    it("gives the definition with the name asked for", () => {
        const handler = gameHandler([game("2-player", 2), game("3-player", 3)]);
        expect(handler.get({ scope: "game", name: "3-player" })).toEqual(game("3-player", 3));
        expect(handler.get({ scope: "game", name: "2-player" })).toEqual(game("2-player", 2));
    });

    it("gives nothing for a name it does not hold", () => {
        expect(gameHandler([game("2-player")]).get({ scope: "game", name: "9-player" })).toBeUndefined();
    });

    it("gives nothing for a key of another scope, even with a name it holds", () => {
        expect(gameHandler([game("2-player")]).get({ scope: "unit", name: "2-player" })).toBeUndefined();
    });

    it("gives nothing for a name that only exists on Object.prototype", () => {
        const handler = gameHandler([game("2-player")]);
        for (const name of ["constructor", "toString", "__proto__"]) {
            expect(handler.get({ scope: "game", name })).toBeUndefined();
        }
    });

    it("holds nothing when its file holds no definitions", () => {
        const handler = gameHandler([]);
        expect(handler.get({ scope: "game", name: "2-player" })).toBeUndefined();
        expect(handler.loadAll().size).toBe(0);
    });

    it("rejects a definition of another scope, naming the file and the definition", () => {
        const stray = { ...game("tank"), definition: { scope: "unit", name: "tank" } };
        const { appConfig, path } = gameFile([game("2-player"), stray]);
        expect(() => new GameDefinitionHandler(appConfig, loadAppConfigFile(appConfig))).toThrow(`${path}: Definition "tank" has the scope "unit", not "game"`);
    });

    it("rejects two definitions with the same name, naming the file", () => {
        const { appConfig, path } = gameFile([game("2-player"), game("2-player", 3)]);
        expect(() => new GameDefinitionHandler(appConfig, loadAppConfigFile(appConfig))).toThrow(`${path}: There is more than one game definition named "2-player"`);
    });

    it("reports the first problem in the file when there are several", () => {
        const stray = { ...game("tank"), definition: { scope: "unit", name: "tank" } };
        const first = gameFile([stray, game("a"), game("a")]);
        expect(() => new GameDefinitionHandler(first.appConfig, loadAppConfigFile(first.appConfig))).toThrow('Definition "tank" has the scope "unit"');
        const second = gameFile([game("a"), game("a"), stray]);
        expect(() => new GameDefinitionHandler(second.appConfig, loadAppConfigFile(second.appConfig))).toThrow('There is more than one game definition named "a"');
    });

    it("gives out the same definition every time", () => {
        const handler = gameHandler([game("2-player")]);
        expect(handler.get({ scope: "game", name: "2-player" })).toBe(handler.get({ scope: "game", name: "2-player" }));
    });

    it("freezes the definitions, and everything inside them, so that nobody can change what others see", () => {
        const handler = new UnitDefinitionHandler(realAppConfig, loadAppConfigFile(realAppConfig));
        const tank = handler.get({ scope: "unit", name: "tank" })!;
        const fuel = tank.fuelMax;

        expect(tank.offenses.length).toBeGreaterThan(0);
        expect(Object.isFrozen(tank)).toBe(true);
        expect(Object.isFrozen(tank.definition)).toBe(true);
        expect(Object.isFrozen(tank.movement)).toBe(true);
        expect(Object.isFrozen(tank.offenses)).toBe(true);
        expect(Object.isFrozen(tank.offenses[0])).toBe(true);
        expect(() => {
            tank.fuelMax = 1;
        }).toThrow(TypeError);
        expect(() => {
            tank.offenses.push({ scope: "offense", name: "x" });
        }).toThrow(TypeError);
        expect(() => {
            tank.offenses[0].name = "x";
        }).toThrow(TypeError);
        expect(tank.fuelMax).toBe(fuel);
    });

    it("holds values that are not objects, null among them, as they are", () => {
        const odd = { ...game("odd"), nothing: null, text: "x", count: 0, flag: false };
        expect(gameHandler([odd]).get({ scope: "game", name: "odd" })).toEqual(odd);
    });
});

describe("MemoryDefinitionHandler files", () => {
    it("fails, naming the file, when the file does not hold a list", () => {
        const { appConfig, path } = gameFile("{}");
        expect(() => new GameDefinitionHandler(appConfig, loadAppConfigFile(appConfig))).toThrow(`${path} must hold a list of definitions`);
    });

    it.each([["null", "null"], ["a number", "3"], ["a list", "[]"], ["an object with no definition", "{}"], ["a definition with no name", '{ "definition": { "scope": "game" } }']])(
        "fails, naming the file and the item, when an item is %s",
        (_name, item) => {
            const { appConfig, path } = gameFile(`[ ${JSON.stringify(game("first"))}, ${item} ]`);
            expect(() => new GameDefinitionHandler(appConfig, loadAppConfigFile(appConfig))).toThrow(`${path}: item 1 is not a definition with a scope and a name`);
        },
    );
});
