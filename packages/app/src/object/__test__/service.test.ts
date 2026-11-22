import type { BaseObject, GameReferenceId, Id, UnitObject } from "@tac-tics/api";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanUp, copyConfig, realAppConfig, scopeItem } from "../../../test/config";
import { ObjectServiceImpl } from "..";

afterEach(cleanUp);

const write = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value));

describe("ObjectServiceImpl", () => {
    const scopes = ["capture", "game", "map", "movement", "offense", "player", "terrain", "unit"];
    const objectFile = (directory: string, scope: string) => join(directory, "object", `${scope}.json`);
    const readObjects = (file: string) => JSON.parse(readFileSync(file, "utf8")) as BaseObject<Id>[];

    describe("with the repo's own config", () => {
        it("starts", () => {
            expect(() => new ObjectServiceImpl(realAppConfig)).not.toThrow();
        });

        it.each(scopes)("gives every %s object of its file, by its identifier", (scope) => {
            const service = new ObjectServiceImpl(realAppConfig);
            const objects = readObjects(objectFile(dirname(realAppConfig), scope));
            expect(objects.length).toBeGreaterThan(0);
            for (const object of objects) expect(service.load(scope, object.identifier)).toEqual(object);
        });

        it("gives the object as the type asked for", () => {
            const identifier: GameReferenceId = { id: "unit-1", gameId: "game-1" };
            const unit = new ObjectServiceImpl(realAppConfig).load<UnitObject>("unit", identifier);
            expect(unit?.health).toBe(100);
            expect(unit?.position).toEqual({ x: 3, y: 2 });
            expect(unit?.definition).toEqual({ scope: "unit", name: "tank" });
        });

        it("gives nothing for an identifier that is not held", () => {
            const service = new ObjectServiceImpl(realAppConfig);
            expect(service.load("unit", { id: "unit-99", gameId: "game-1" } as Id)).toBeUndefined();
            expect(service.load("unit", { id: "unit-1", gameId: "game-2" } as Id)).toBeUndefined();
            expect(service.load("game", { id: "game-99" })).toBeUndefined();
        });

        it("gives nothing when the identifier does not have the fields of the scope's identifiers", () => {
            const service = new ObjectServiceImpl(realAppConfig);
            expect(service.load("unit", { id: "unit-1" })).toBeUndefined();
            expect(service.load("game", { id: "game-1", gameId: "game-1" } as Id)).toBeUndefined();
        });

        it("looks in the scope it is asked for, and no other", () => {
            const service = new ObjectServiceImpl(realAppConfig);
            expect(service.load("terrain", { id: "unit-1", gameId: "game-1" } as Id)).toBeUndefined();
            expect(service.load("unit", { id: "terrain-1", gameId: "game-1" } as Id)).toBeUndefined();
            expect(service.load("player", { id: "unit-1", gameId: "game-1" } as Id)).toBeUndefined();
        });

        it.each(["transport", "weather", "", "constructor", "toString", "__proto__"])("gives nothing for the scope %j, which has no objects", (scope) => {
            expect(new ObjectServiceImpl(realAppConfig).load(scope, { id: "unit-1", gameId: "game-1" } as Id)).toBeUndefined();
        });

        it("hands out copies, so that a change reaches the service only through the handler of the scope", () => {
            const service = new ObjectServiceImpl(realAppConfig);
            const identifier: GameReferenceId = { id: "unit-1", gameId: "game-1" };
            service.load<UnitObject>("unit", identifier)!.health = 1;
            expect(service.load<UnitObject>("unit", identifier)!.health).toBe(100);
        });

        it.each(scopes)("gives all the %s objects of its file, by their identifiers, with loadAll", (scope) => {
            const service = new ObjectServiceImpl(realAppConfig);
            const objects = readObjects(objectFile(dirname(realAppConfig), scope));
            const all = service.loadAll(scope);
            expect([...all.values()]).toEqual(objects);
            expect([...all.keys()]).toEqual(objects.map((object) => object.identifier));
        });

        it("gives the terrain of a map by the id of the map, and the captures of a game by the id of the game", () => {
            const service = new ObjectServiceImpl(realAppConfig);
            expect(service.load("terrain", { id: "terrain-000", mapId: "map-1" } as Id)?.definition).toEqual({ scope: "terrain", name: "sea" });
            expect(service.load("terrain", { id: "terrain-000", gameId: "game-1" } as Id)).toBeUndefined();
            expect(service.load("capture", { id: "terrain-026", gameId: "game-1" } as Id)?.definition).toEqual({ scope: "terrain", name: "base" });
            expect(service.load("capture", { id: "terrain-026", mapId: "map-1" } as Id)).toBeUndefined();
        });

        it.each(["transport", "weather", "", "constructor", "__proto__"])("gives no objects with loadAll for the scope %j", (scope) => {
            expect(new ObjectServiceImpl(realAppConfig).loadAll(scope).size).toBe(0);
        });

        it("serves what it is given to save: the saved object is seen by load and loadAll", () => {
            const service = new ObjectServiceImpl(realAppConfig);
            const identifier: GameReferenceId = { id: "unit-1", gameId: "game-1" };
            const tank = service.load<UnitObject>("unit", identifier)!;
            expect(service.save<UnitObject>("unit", { ...tank, health: 40 })).toEqual(identifier);
            expect(service.load<UnitObject>("unit", identifier)?.health).toBe(40);
            expect(service.loadAll<UnitObject>("unit").get(identifier)).toBeUndefined(); // keys are the identifiers, not copies of them
            expect([...service.loadAll<UnitObject>("unit").values()].map((unit) => unit.health)).toEqual([40]);
        });

        it("holds a new object under its own scope", () => {
            const service = new ObjectServiceImpl(realAppConfig);
            const tank = service.load<UnitObject>("unit", { id: "unit-1", gameId: "game-1" })!;
            service.save<UnitObject>("unit", { ...tank, identifier: { id: "unit-2", gameId: "game-1" } });
            expect(service.loadAll("unit").size).toBe(2);
            expect(service.load<UnitObject>("unit", { id: "unit-2", gameId: "game-1" })?.definition).toEqual(tank.definition);
            expect(service.loadAll("terrain").size).toBe(129);
        });

        it("refuses to save an object under a scope that is not its own", () => {
            const service = new ObjectServiceImpl(realAppConfig);
            const tank = service.load<UnitObject>("unit", { id: "unit-1", gameId: "game-1" })!;
            expect(() => service.save<UnitObject>("terrain", tank)).toThrow('The terrain objects cannot hold the object "unit-1"');
        });

        it.each(["transport", "weather", ""])("refuses to save under the scope %j, which has no objects", (scope) => {
            const service = new ObjectServiceImpl(realAppConfig);
            const tank = service.load<UnitObject>("unit", { id: "unit-1", gameId: "game-1" })!;
            expect(() => service.save<UnitObject>(scope, tank)).toThrow(`No object handler accepts the scope "${scope}"`);
        });

        it("deletes an object, and gives it", () => {
            const service = new ObjectServiceImpl(realAppConfig);
            const identifier: GameReferenceId = { id: "unit-1", gameId: "game-1" };
            const tank = service.load<UnitObject>("unit", identifier);
            expect(service.delete<UnitObject>("unit", identifier)).toEqual(tank);
            expect(service.load("unit", identifier)).toBeUndefined();
            expect(service.delete("unit", identifier)).toBeUndefined();
        });

        it("gives nothing when it deletes from a scope without objects, or an object it does not hold", () => {
            const service = new ObjectServiceImpl(realAppConfig);
            expect(service.delete("transport", { id: "unit-1", gameId: "game-1" } as Id)).toBeUndefined();
            expect(service.delete("unit", { id: "nope", gameId: "game-1" } as Id)).toBeUndefined();
            expect(service.loadAll("unit").size).toBe(1);
        });

        it("keeps the state of each scope apart from the others", () => {
            const service = new ObjectServiceImpl(realAppConfig);
            service.delete("unit", { id: "unit-1", gameId: "game-1" } as Id);
            expect(service.loadAll("terrain").size).toBe(129);
            expect(service.load("game", { id: "game-1" })).toBeDefined();
        });

        it("does not share objects between services", () => {
            const one = new ObjectServiceImpl(realAppConfig);
            const two = new ObjectServiceImpl(realAppConfig);
            expect(one.load("game", { id: "game-1" })).toEqual(two.load("game", { id: "game-1" }));
            expect(one.load("game", { id: "game-1" })).not.toBe(two.load("game", { id: "game-1" }));
        });
    });

    describe("loading", () => {
        it("reads each file once, at start-up: later changes to the files are not seen", () => {
            const { directory, appConfig } = copyConfig();
            const service = new ObjectServiceImpl(appConfig);
            write(objectFile(directory, "game"), []);
            expect(service.load("game", { id: "game-1" })).toBeDefined();
            expect(new ObjectServiceImpl(appConfig).load("game", { id: "game-1" })).toBeUndefined();
        });

        it("accepts a scope that has no objects to load, such as one that only has definitions", () => {
            const { appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            expect(scopeItem(config, "transport").object).toBeUndefined();
            expect(() => new ObjectServiceImpl(appConfig)).not.toThrow();
        });
    });

    describe("rejecting a config that cannot be used", () => {
        it("fails when the app config cannot be read", () => {
            const { directory } = copyConfig();
            expect(() => new ObjectServiceImpl(join(directory, "missing.json"))).toThrow("cannot be parsed");
        });

        it("fails when the app config is not valid", () => {
            const { appConfig } = copyConfig();
            write(appConfig, { nothing: true });
            expect(() => new ObjectServiceImpl(appConfig)).toThrow(`Invalid app config ${appConfig}`);
        });

        it.each(scopes)("fails when the app config has no object file for %s", (scope) => {
            const { appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            delete scopeItem(config, scope).object;
            write(appConfig, config);
            expect(() => new ObjectServiceImpl(appConfig)).toThrow(`scope "${scope}" needs a object file`);
        });

        it("fails when the app config maps objects for a scope nothing handles", () => {
            const { directory, appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            config.push({ scope: "weather", object: "object/weather.json" });
            write(appConfig, config);
            write(objectFile(directory, "weather"), []);
            expect(() => new ObjectServiceImpl(appConfig)).toThrow(`maps objects for the unknown scope "weather"`);
        });

        it("reports the first unknown scope in the app config when there are several", () => {
            const { appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            config.push({ scope: "weather", object: "object/weather.json" });
            config.push({ scope: "ocean", object: "object/ocean.json" });
            write(appConfig, config);
            expect(() => new ObjectServiceImpl(appConfig)).toThrow('the unknown scope "weather"');
        });

        it("loads the scopes in a fixed order, so the first broken file is the one reported", () => {
            const { directory, appConfig } = copyConfig();
            writeFileSync(objectFile(directory, "unit"), "[ not json");
            writeFileSync(objectFile(directory, "game"), "[ not json");
            expect(() => new ObjectServiceImpl(appConfig)).toThrow(objectFile(directory, "game"));
        });

        it("fails, naming the file, when an object file is missing", () => {
            const { directory, appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            scopeItem(config, "unit").object = "object/unit.nowhere.json";
            write(appConfig, config);
            expect(() => new ObjectServiceImpl(appConfig)).toThrow(`${join(directory, "object", "unit.nowhere.json")} cannot be parsed`);
        });

        it("fails, naming the file, when an object file is not valid JSON", () => {
            const { directory, appConfig } = copyConfig();
            writeFileSync(objectFile(directory, "player"), "[ not json");
            expect(() => new ObjectServiceImpl(appConfig)).toThrow(`${objectFile(directory, "player")} cannot be parsed`);
        });

        it.each([["an object", {}], ["null", null], ["a string", "text"]])("fails, naming the file, when an object file holds %s instead of a list", (_what, value) => {
            const { directory, appConfig } = copyConfig();
            write(objectFile(directory, "game"), value);
            expect(() => new ObjectServiceImpl(appConfig)).toThrow(`${objectFile(directory, "game")} must hold a list of objects`);
        });

        it("fails, naming the file, when an object file holds an object of another scope", () => {
            const { directory, appConfig } = copyConfig();
            const stray = readObjects(objectFile(directory, "unit"))[0];
            write(objectFile(directory, "game"), [...readObjects(objectFile(directory, "game")), stray]);
            expect(() => new ObjectServiceImpl(appConfig)).toThrow(`${objectFile(directory, "game")}: The game objects cannot hold the object "${stray.identifier.id}"`);
        });
    });
});
