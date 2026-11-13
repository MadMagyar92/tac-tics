import type { Definition } from "@tac-tics/api";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanUp, copyConfig, realAppConfig, scopeItem } from "../../../test/config";
import { DefinitionServiceImpl } from "..";

afterEach(cleanUp);

const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Definition[];
const write = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value));

/** The definition files of the config copy in `directory`, by scope. */
const definitionFile = (directory: string, scope: string) => join(directory, "definition", `${scope}.config.json`);

describe("DefinitionServiceImpl", () => {
    describe("with the repo's own config", () => {
        it("starts", () => {
            expect(() => new DefinitionServiceImpl(realAppConfig)).not.toThrow();
        });

        it.each([
            ["game", 3],
            ["movement", 7],
            ["offense", 20],
            ["player", 4],
            ["terrain", 14],
            ["unit", 18],
        ])("serves every %s definition in its file (%i of them)", (scope, count) => {
            const service = new DefinitionServiceImpl(realAppConfig);
            const definitions = read(definitionFile(dirname(realAppConfig), scope));
            expect(definitions).toHaveLength(count);
            for (const definition of definitions) expect(service.get(definition.definition)).toEqual(definition);
        });

        it("serves what the files say", () => {
            const service = new DefinitionServiceImpl(realAppConfig);
            expect(service.get({ scope: "game", name: "2-player" })).toEqual({ definition: { scope: "game", name: "2-player" }, turnsMax: 100, playersMax: 2 });
            expect(service.get({ scope: "player", name: "orange-star" })).toEqual({ definition: { scope: "player", name: "orange-star" }, fundsMax: 999999 });
            expect(service.get({ scope: "terrain", name: "mountain" })).toEqual({ definition: { scope: "terrain", name: "mountain" }, defense: 4, capturable: false });
            expect(service.get({ scope: "unit", name: "tank" })).toEqual({
                definition: { scope: "unit", name: "tank" },
                fundsCost: 7000,
                visionMax: 3,
                fuelMax: 60,
                moveMax: 6,
                movement: { scope: "movement", name: "tread" },
                offenses: [
                    { scope: "offense", name: "tank1" },
                    { scope: "offense", name: "tank2" },
                ],
                actions: [{ scope: "action", name: "attack" }],
            });
            expect(service.get<Definition & { cost: { terrain: { name: string }; cost: number }[] }>({ scope: "movement", name: "foot" })!.cost.find((c) => c.terrain.name === "mountain")).toEqual({
                terrain: { scope: "terrain", name: "mountain" },
                cost: 2,
            });
            expect(service.get<Definition & { ammoMax: number; rangeMin: number }>({ scope: "offense", name: "tank1" })).toMatchObject({ ammoMax: 9, rangeMin: 1 });
        });

        it("gives nothing for a name that is not defined", () => {
            expect(new DefinitionServiceImpl(realAppConfig).get({ scope: "unit", name: "battle-mech" })).toBeUndefined();
        });

        it("gives nothing for a scope that has no definitions", () => {
            expect(new DefinitionServiceImpl(realAppConfig).get({ scope: "weather", name: "rain" })).toBeUndefined();
        });

        it("gives nothing for a name that is defined, but in another scope", () => {
            const service = new DefinitionServiceImpl(realAppConfig);
            expect(service.get({ scope: "offense", name: "tank" })).toBeUndefined(); // "tank" is a unit
            expect(service.get({ scope: "unit", name: "tank" })).toBeDefined();
        });

        it("serves definitions that nobody can change", () => {
            const service = new DefinitionServiceImpl(realAppConfig);
            const tank = service.get<Definition & { fuelMax: number }>({ scope: "unit", name: "tank" })!;
            expect(() => {
                tank.fuelMax = 1;
            }).toThrow(TypeError);
            expect(service.get<Definition & { fuelMax: number }>({ scope: "unit", name: "tank" })!.fuelMax).toBe(60);
        });
    });

    describe("loading", () => {
        it("reads the files named by the app config, relative to the app config", () => {
            const { directory, appConfig } = copyConfig();
            write(definitionFile(directory, "terrain"), [{ definition: { scope: "terrain", name: "lava" }, defense: 9 }]);
            const service = new DefinitionServiceImpl(appConfig);
            expect(service.get({ scope: "terrain", name: "lava" })).toEqual({ definition: { scope: "terrain", name: "lava" }, defense: 9 });
            expect(service.get({ scope: "terrain", name: "plain" })).toBeUndefined();
        });

        it("follows the paths in the app config, wherever they point", () => {
            const { directory, appConfig } = copyConfig();
            write(join(directory, "somewhere-else.json"), [{ definition: { scope: "game", name: "solo" }, turnsMax: 1, playersMax: 1 }]);
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            scopeItem(config, "game").definition = "somewhere-else.json";
            write(appConfig, config);
            expect(new DefinitionServiceImpl(appConfig).get({ scope: "game", name: "solo" })).toBeDefined();
        });

        it("accepts an app config path relative to the working directory", () => {
            const { appConfig } = copyConfig();
            const service = new DefinitionServiceImpl(relative(process.cwd(), appConfig));
            expect(service.get({ scope: "unit", name: "tank" })).toBeDefined();
        });

        it("reads each file once, at start-up: later changes to the files are not seen", () => {
            const { directory, appConfig } = copyConfig();
            const service = new DefinitionServiceImpl(appConfig);
            write(definitionFile(directory, "terrain"), []);
            expect(service.get({ scope: "terrain", name: "plain" })).toBeDefined();
            expect(new DefinitionServiceImpl(appConfig).get({ scope: "terrain", name: "plain" })).toBeUndefined();
        });

        it("accepts a scope that has no definitions to load, such as one that only has objects", () => {
            const { directory, appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            config.push({ scope: "weather", object: "object/weather.json" });
            write(appConfig, config);
            write(join(directory, "object", "weather.json"), []);
            expect(() => new DefinitionServiceImpl(appConfig)).not.toThrow();
        });
    });

    describe("rejecting a config that cannot be used", () => {
        it("fails when the app config cannot be read", () => {
            const { directory } = copyConfig();
            expect(() => new DefinitionServiceImpl(join(directory, "missing.json"))).toThrow("cannot be parsed");
        });

        it("fails when the app config is not valid", () => {
            const { appConfig } = copyConfig();
            write(appConfig, { nothing: true });
            expect(() => new DefinitionServiceImpl(appConfig)).toThrow(`Invalid app config ${appConfig}`);
        });

        it.each(["game", "offense", "player", "terrain", "unit"])("fails when the app config has no definition file for %s", (scope) => {
            const { appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            delete scopeItem(config, scope).definition;
            write(appConfig, config);
            expect(() => new DefinitionServiceImpl(appConfig)).toThrow(`scope "${scope}" needs a definition file`);
        });

        it("fails when the app config leaves a scope with neither a definition file nor an object file", () => {
            const { appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            delete scopeItem(config, "movement").definition;
            write(appConfig, config);
            expect(() => new DefinitionServiceImpl(appConfig)).toThrow('scope "movement" must have a definition file or an object file');
        });

        it("fails when the app config maps definitions for a scope nothing handles", () => {
            const { appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            config.push({ scope: "weather", definition: "definition/weather.config.json" });
            write(appConfig, config);
            expect(() => new DefinitionServiceImpl(appConfig)).toThrow(`maps definitions for the unknown scope "weather"`);
        });

        it("reports the first unknown scope in the app config when there are several", () => {
            const { appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            config.push({ scope: "weather", definition: "definition/weather.config.json" });
            config.push({ scope: "ocean", definition: "definition/ocean.config.json" });
            write(appConfig, config);
            expect(() => new DefinitionServiceImpl(appConfig)).toThrow('the unknown scope "weather"');
        });

        it("loads the scopes in a fixed order, so the first broken file is the one reported", () => {
            const { directory, appConfig } = copyConfig();
            writeFileSync(definitionFile(directory, "unit"), "[ not json");
            writeFileSync(definitionFile(directory, "game"), "[ not json");
            expect(() => new DefinitionServiceImpl(appConfig)).toThrow(definitionFile(directory, "game"));
        });

        it("fails, naming the file, when a definition file is missing", () => {
            const { directory, appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            scopeItem(config, "unit").definition = "definition/unit.nowhere.json";
            write(appConfig, config);
            expect(() => new DefinitionServiceImpl(appConfig)).toThrow(`${join(directory, "definition", "unit.nowhere.json")} cannot be parsed`);
        });

        it("fails, naming the file, when a definition file is not valid JSON", () => {
            const { directory, appConfig } = copyConfig();
            writeFileSync(definitionFile(directory, "player"), "[ not json");
            expect(() => new DefinitionServiceImpl(appConfig)).toThrow(`${definitionFile(directory, "player")} cannot be parsed`);
        });

        it.each([["an object", {}], ["null", null], ["a string", "text"]])("fails, naming the file, when a definition file holds %s instead of a list", (_what, value) => {
            const { directory, appConfig } = copyConfig();
            write(definitionFile(directory, "game"), value);
            expect(() => new DefinitionServiceImpl(appConfig)).toThrow(`${definitionFile(directory, "game")} must hold a list of definitions`);
        });

        it("fails, naming the file, when a definition file holds a definition of another scope", () => {
            const { directory, appConfig } = copyConfig();
            const stray = read(definitionFile(directory, "unit"))[0];
            write(definitionFile(directory, "game"), [...read(definitionFile(directory, "game")), stray]);
            expect(() => new DefinitionServiceImpl(appConfig)).toThrow(`${definitionFile(directory, "game")}: Definition "${stray.definition.name}" has the scope "unit", not "game"`);
        });

        it("fails, naming the file, when a definition file defines a name twice", () => {
            const { directory, appConfig } = copyConfig();
            const games = read(definitionFile(directory, "game"));
            write(definitionFile(directory, "game"), [...games, games[0]]);
            expect(() => new DefinitionServiceImpl(appConfig)).toThrow(`${definitionFile(directory, "game")}: There is more than one game definition named "${games[0].definition.name}"`);
        });
    });
});
