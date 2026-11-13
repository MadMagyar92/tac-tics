import type { BaseObject, Id, TerrainObject } from "@tac-tics/api";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanUp, copyConfig, scopeItem } from "../../../test/config";
import { loadAppConfigFile } from "../../app";
import { MapDefinitionHandler } from "../../definition";
import { GameObjectHandler, type MemoryObjectHandler, OffenseObjectHandler, PlayerObjectHandler, TerrainObjectHandler, UnitObjectHandler } from "..";

afterEach(cleanUp);

type Item = BaseObject<Id> & Record<string, any>;
type AnyService = MemoryObjectHandler<any, any>;

/** A terrain handler on the app config, which makes virtual terrain for the games of the object file, or for none. */
const createTerrain = (appConfig: string, games: "none" | "real" = "none"): TerrainObjectHandler => {
    const config = loadAppConfigFile(appConfig);
    const handler = games === "real" ? new GameObjectHandler(appConfig, config) : ({ loadAll: () => new Map(), load: () => undefined } as unknown as GameObjectHandler);
    return new TerrainObjectHandler(appConfig, config, handler, new MapDefinitionHandler(appConfig, config));
};

const services: { name: string; scope: string; file: string; create: (appConfig: string) => AnyService }[] = [
    { name: "GameObjectHandler", scope: "game", file: "object/game.json", create: (appConfig) => new GameObjectHandler(appConfig, loadAppConfigFile(appConfig)) },
    { name: "OffenseObjectHandler", scope: "offense", file: "object/offense.json", create: (appConfig) => new OffenseObjectHandler(appConfig, loadAppConfigFile(appConfig)) },
    { name: "PlayerObjectHandler", scope: "player", file: "object/player.json", create: (appConfig) => new PlayerObjectHandler(appConfig, loadAppConfigFile(appConfig)) },
    { name: "TerrainObjectHandler", scope: "terrain", file: "object/terrain.json", create: (appConfig) => createTerrain(appConfig) },
    { name: "UnitObjectHandler", scope: "unit", file: "object/unit.json", create: (appConfig) => new UnitObjectHandler(appConfig, loadAppConfigFile(appConfig)) },
];

const readItems = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Item[];
const editGames = (directory: string, change: (games: Item[]) => void) => {
    const file = join(directory, "object/game.json");
    const games = readItems(file);
    change(games);
    writeFileSync(file, JSON.stringify(games));
};
const values = (service: AnyService) => [...service.loadAll().values()] as Item[];
const withKeysReversed = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
const permutations = <T>(list: T[]): T[][] =>
    list.length < 2 ? [list] : list.flatMap((item, index) => permutations([...list.slice(0, index), ...list.slice(index + 1)]).map((rest) => [item, ...rest]));

describe.each(services)("$name", ({ scope, file, create }) => {
    /** A copy of the repo's config, the service started on it, and the objects the object file holds. */
    const start = () => {
        const copy = copyConfig();
        const path = join(copy.directory, file);
        return { ...copy, path, items: readItems(path), service: create(copy.appConfig) };
    };

    describe("starting up", () => {
        it("accepts its own scope and no other", () => {
            const { service } = start();
            expect(service.accept(scope)).toBe(true);
            for (const other of services.map((s) => s.scope).filter((name) => name !== scope)) expect(service.accept(other), other).toBe(false);
            for (const name of ["", `${scope}s`, scope.toUpperCase(), "movement", "action"]) expect(service.accept(name), name).toBe(false);
        });

        it("knows its scope", () => {
            const { service } = start();
            expect(service.scope).toBe(scope);
        });

        it("loads the whole object file, in order", () => {
            const { service, items } = start();
            expect(items.length).toBeGreaterThan(0);
            expect(values(service)).toEqual(items);
        });

        it("fails when the app config has no object file for its scope", () => {
            const { appConfig } = copyConfig();
            const config = JSON.parse(readFileSync(appConfig, "utf8"));
            delete scopeItem(config, scope).object;
            writeFileSync(appConfig, JSON.stringify(config));
            expect(() => create(appConfig)).toThrow(`scope "${scope}" needs a object file`);
        });

        it("fails, naming the file, when the object file is missing", () => {
            const { appConfig, path } = start();
            rmSync(path);
            expect(() => create(appConfig)).toThrow(`${path} cannot be parsed`);
        });

        it("fails, naming the file, when the object file is not valid JSON", () => {
            const { appConfig, path } = start();
            writeFileSync(path, "[ nope");
            expect(() => create(appConfig)).toThrow(`${path} cannot be parsed`);
        });

        it.each([["an object", {}], ["null", null], ["text", "game"]])("fails, naming the file, when the object file holds %s instead of a list", (_what, value) => {
            const { appConfig, path } = start();
            writeFileSync(path, JSON.stringify(value));
            expect(() => create(appConfig)).toThrow(`${path} must hold a list of objects`);
        });

        it.each([
            ["a number", 1],
            ["null", null],
            ["a list", []],
            ["an object with nothing in it", {}],
            ["an object with no definition", { identifier: { id: "x" } }],
            ["an object with no identifier", { definition: { scope: "x", name: "y" } }],
            ["an object whose identifier has no id", { identifier: {}, definition: { scope: "x", name: "y" } }],
            ["an object whose id is not text", { identifier: { id: 1 }, definition: { scope: "x", name: "y" } }],
            ["an object whose definition is not an object", { identifier: { id: "x" }, definition: "game" }],
        ])("fails, naming the file and the item, when an item is %s", (_what, item) => {
            const { appConfig, path, items } = start();
            writeFileSync(path, JSON.stringify([...items, item]));
            expect(() => create(appConfig)).toThrow(`${path}: item ${items.length} is not an object with an identifier and a definition`);
        });

        it("fails, naming the file, when an object has a definition of another scope", () => {
            const { appConfig, path, items } = start();
            writeFileSync(path, JSON.stringify([{ ...items[0], definition: { scope: "weather", name: "rain" } }]));
            expect(() => create(appConfig)).toThrow(`${path}: The ${scope} objects cannot hold the object "${items[0].identifier.id}"`);
        });

        it("fails, naming the file, when two objects have the same identifier", () => {
            const { appConfig, path, items } = start();
            writeFileSync(path, JSON.stringify([...items, withKeysReversed(items[0])]));
            expect(() => create(appConfig)).toThrow(`${path}: there is more than one object with the identifier`);
        });

        it("starts empty from an empty object file", () => {
            const { appConfig, path } = start();
            writeFileSync(path, "[]");
            expect(values(create(appConfig))).toEqual([]);
        });
    });

    describe("load and loadAll", () => {
        it("give the object with an identifier", () => {
            const { service, items } = start();
            for (const item of items.slice(0, 20)) expect(service.load(item.identifier)).toEqual(item);
        });

        it("find an object whatever the order of the fields of the identifier", () => {
            const { service, items } = start();
            expect(service.load(withKeysReversed(items[0].identifier))).toEqual(items[0]);
            for (const entries of permutations(Object.entries(items[0].identifier))) {
                expect(service.load(Object.fromEntries(entries) as Id)).toEqual(items[0]);
            }
        });

        it("give nothing for an identifier that is not held", () => {
            const { service, items } = start();
            expect(service.load({ ...items[0].identifier, id: "no-such-object" })).toBeUndefined();
        });

        it("hand out copies: changing one changes nothing that is held", () => {
            const { service, items } = start();
            const copy = service.load(items[0].identifier) as Item;
            copy.definition.name = "changed";
            copy.identifier.id = "changed";
            expect(service.load(items[0].identifier)).toEqual(items[0]);

            const [, fromAll] = [...service.loadAll()][0];
            fromAll.definition.name = "changed";
            expect(values(service)).toEqual(items);
        });

        it("loadAll keys each object by its own identifier", () => {
            const { service } = start();
            for (const [key, object] of service.loadAll()) expect(key).toBe(object.identifier);
        });
    });

    describe("save", () => {
        it("replaces the object with the same identifier, in memory only", () => {
            const { service, appConfig, path, items } = start();
            const before = readFileSync(path, "utf8");
            const changed = { ...items[0], note: "changed" };

            service.save(changed);

            expect(service.load(items[0].identifier)).toEqual(changed);
            expect(readFileSync(path, "utf8")).toBe(before);
            expect(create(appConfig).load(items[0].identifier)).toEqual(items[0]);
        });

        it("returns the identifier of the object", () => {
            const { service, items } = start();
            expect(service.save(items[0])).toEqual(items[0].identifier);
        });

        it("keeps the place of an object it replaces, and puts a new object last", () => {
            const { service, items } = start();
            const added = { ...items[0], identifier: { ...items[0].identifier, id: "brand-new" } };

            service.save(added);
            service.save({ ...items[0], note: "changed" });

            const held = values(service);
            expect(held.map((object) => object.identifier.id)).toEqual([...items.map((item) => item.identifier.id), "brand-new"]);
            expect(held[0]).toEqual({ ...items[0], note: "changed" });
        });

        it("keeps its own copy: changing the object afterwards changes nothing", () => {
            const { service, items } = start();
            const object = { ...items[0], note: "saved", definition: { ...items[0].definition } };
            service.save(object);
            object.note = "changed after saving";
            object.definition.name = "changed after saving";
            expect(service.load(items[0].identifier)).toEqual({ ...items[0], note: "saved" });
        });

        it("rejects an object whose definition has another scope, holding nothing new", () => {
            const { service, items } = start();
            expect(() => service.save({ ...items[0], identifier: { ...items[0].identifier, id: "stray" }, definition: { scope: "weather", name: "rain" } })).toThrow(
                `The ${scope} objects cannot hold the object "stray", whose definition has the scope "weather"`,
            );
            expect(values(service)).toEqual(items);
        });
    });

    describe("delete", () => {
        it("removes the object from memory only, and returns it", () => {
            const { service, appConfig, path, items } = start();
            const before = readFileSync(path, "utf8");

            expect(service.delete(items[0].identifier)).toEqual(items[0]);

            expect(service.load(items[0].identifier)).toBeUndefined();
            expect(values(service)).toEqual(items.slice(1));
            expect(readFileSync(path, "utf8")).toBe(before);
            expect(create(appConfig).load(items[0].identifier)).toEqual(items[0]);
        });

        it("gives nothing, and removes nothing, for an identifier that is not held", () => {
            const { service, items } = start();
            expect(service.delete({ ...items[0].identifier, id: "no-such-object" })).toBeUndefined();
            expect(values(service)).toEqual(items);
        });

        it("finds the object whatever the order of the fields of the identifier", () => {
            const { service, items } = start();
            expect(service.delete(withKeysReversed(items[0].identifier))).toEqual(items[0]);
        });
    });

    describe("saveAll", () => {
        it("writes the objects held to the file, and only then do they reach it", () => {
            const { service, appConfig, path, items } = start();
            service.save({ ...items[0], identifier: { ...items[0].identifier, id: "brand-new" } });
            service.save({ ...items[0], note: "changed" });
            if (items.length > 1) {
                service.delete(items[1].identifier);
            }
            const expected = values(service);
            expect(readItems(path)).toEqual(items);

            service.saveAll();

            expect(readItems(path)).toEqual(expected);
            expect(readFileSync(path, "utf8")).toBe(`${JSON.stringify(expected)}\n`);
            expect(values(create(appConfig))).toEqual(expected);
        });

        it("returns the objects it saved, keyed by their identifiers", () => {
            const { service } = start();
            service.save({ ...values(service)[0], note: "changed" });
            const saved = service.saveAll();
            expect([...saved.values()]).toEqual(values(service));
            for (const [key, object] of saved) expect(key).toBe(object.identifier);
        });

        it("writes the same objects back when nothing changed", () => {
            const { service, path, items } = start();
            service.saveAll();
            expect(readItems(path)).toEqual(items);
        });

        it("writes the objects that were deleted out of the file", () => {
            const { service, appConfig, items } = start();
            for (const item of items) service.delete(item.identifier);
            service.saveAll();
            expect(values(create(appConfig))).toEqual([]);
        });

        it("writes its own file and no other", () => {
            const { service, directory, path, items } = start();
            const others = ["definition/game.config.json", "definition/unit.config.json", "object/game.json", "object/unit.json", "app.config.json"]
                .map((name) => join(directory, name))
                .filter((name) => name !== path);
            const before = others.map((name) => readFileSync(name, "utf8"));

            service.save({ ...items[0], note: "changed" });
            service.saveAll();

            expect(others.map((name) => readFileSync(name, "utf8"))).toEqual(before);
        });

        it("leaves no temporary file behind", () => {
            const { service, path } = start();
            const before = readdirSync(dirname(path));
            service.saveAll();
            expect(readdirSync(dirname(path))).toEqual(before);
        });

        it("keeps the objects in memory when the file cannot be written", () => {
            const { service, path, items } = start();
            service.save({ ...items[0], note: "changed" });
            const expected = values(service);

            rmSync(dirname(path), { recursive: true });

            expect(() => service.saveAll()).toThrow();
            expect(values(service)).toEqual(expected);
        });

        it("is the only thing that writes: load, save and delete never touch the file", () => {
            const { service, path, items } = start();
            const before = readFileSync(path, "utf8");
            service.load(items[0].identifier);
            service.loadAll();
            service.save({ ...items[0], note: "changed" });
            service.delete(items[0].identifier);
            expect(readFileSync(path, "utf8")).toBe(before);
        });
    });
});

describe("telling objects apart", () => {
    const start = (service: (appConfig: string) => AnyService, file: string) => {
        const copy = copyConfig();
        return { ...copy, items: readItems(join(copy.directory, file)), service: service(copy.appConfig) };
    };

    it.each([
        ["unit", "object/unit.json", (appConfig: string) => new UnitObjectHandler(appConfig, loadAppConfigFile(appConfig))],
        ["terrain", "object/terrain.json", (appConfig: string) => createTerrain(appConfig)],
        ["player", "object/player.json", (appConfig: string) => new PlayerObjectHandler(appConfig, loadAppConfigFile(appConfig))],
    ])("holds the %s with an id in one game apart from the one with that id in another game", (_scope, file, create) => {
        const { service, items } = start(create, file);
        const inOtherGame = { ...items[0], identifier: { id: items[0].identifier.id, gameId: "another-game" }, note: "other" };

        service.save(inOtherGame);

        expect(values(service)).toHaveLength(items.length + 1);
        expect(service.load(items[0].identifier)).toEqual(items[0]);
        expect(service.load(inOtherGame.identifier)).toEqual(inOtherGame);
        service.delete(inOtherGame.identifier);
        expect(service.load(items[0].identifier)).toEqual(items[0]);
    });

    it("holds an offense of one unit apart from the offense with that id of another unit of the same game", () => {
        const { service, items } = start((appConfig) => new OffenseObjectHandler(appConfig, loadAppConfigFile(appConfig)), "object/offense.json");
        const ofOtherUnit = { ...items[0], identifier: { ...items[0].identifier, unitId: "another-unit" }, note: "other" };

        service.save(ofOtherUnit);

        expect(values(service)).toHaveLength(items.length + 1);
        expect(service.load(items[0].identifier)).toEqual(items[0]);
        expect(service.load(ofOtherUnit.identifier)).toEqual(ofOtherUnit);
    });

    it("holds a game by its id alone", () => {
        const { service, items } = start((appConfig) => new GameObjectHandler(appConfig, loadAppConfigFile(appConfig)), "object/game.json");
        service.save({ ...items[0], note: "changed" });
        expect(values(service)).toHaveLength(items.length);
    });

    it("does not mix up identifiers whose fields run together: a:b + c is not a + b:c", () => {
        const { service, items } = start((appConfig) => new UnitObjectHandler(appConfig, loadAppConfigFile(appConfig)), "object/unit.json");
        const one = { ...items[0], identifier: { id: "c", gameId: "a:b" }, note: "one" };
        const other = { ...items[0], identifier: { id: "b:c", gameId: "a" }, note: "other" };

        service.save(one);
        service.save(other);

        expect(values(service)).toHaveLength(items.length + 2);
        expect(service.load(one.identifier)).toEqual(one);
        expect(service.load(other.identifier)).toEqual(other);
    });
});

describe("TerrainObjectHandler with the games of the repo's config", () => {
    /** A copy of the repo's config, the handler started on it with its games, and the terrain the object file holds. */
    const start = () => {
        const copy = copyConfig();
        const path = join(copy.directory, "object/terrain.json");
        return { ...copy, path, items: readItems(path), service: createTerrain(copy.appConfig, "real") };
    };

    const sea = (n: number): TerrainObject => ({
        identifier: { id: `sea-${n}`, gameId: "game-1" },
        definition: { scope: "terrain", name: "sea" },
        position: { x: (n - 1) % 15, y: Math.floor((n - 1) / 15) },
        health: 20,
        playerId: undefined,
    });

    it("gives the default terrain of the map of the game for a square the object file does not hold, by the number of the square", () => {
        const { service } = start();
        expect(service.load({ id: "sea-1", gameId: "game-1" })).toEqual(sea(1));
        expect(service.load({ id: "sea-16", gameId: "game-1" })).toEqual(sea(16));
        expect(service.load({ id: "sea-150", gameId: "game-1" })).toEqual(sea(150));
    });

    it("gives the terrain of the object file for a square it holds, by the id it holds it under", () => {
        const { service, items } = start();
        for (const item of items) expect(service.load(item.identifier)).toEqual(item);
    });

    it("numbers the terrain of the object file without regard to where it is", () => {
        const { items } = start();
        expect(items.map((item) => item.identifier.id)).toEqual(items.map((_, index) => `terrain-${index + 1}`));
    });

    it("gives nothing for the number of a square the object file holds, which is not virtual", () => {
        const { service, items } = start();
        const { x, y } = items[0].position;
        expect(service.load({ id: `sea-${y * 15 + x + 1}`, gameId: "game-1" })).toBeUndefined();
    });

    it.each([
        ["a number past the last square", { id: "sea-151", gameId: "game-1" }],
        ["the number 0", { id: "sea-0", gameId: "game-1" }],
        ["an id that is not of a square", { id: "nope", gameId: "game-1" }],
        ["an id with no number", { id: "sea-", gameId: "game-1" }],
        ["an id with a number that is not whole", { id: "sea-1.5", gameId: "game-1" }],
        ["the number of a square of another terrain than the default", { id: "woods-1", gameId: "game-1" }],
        ["an id of the object file that it does not hold", { id: "terrain-86", gameId: "game-1" }],
        ["a game that does not exist", { id: "sea-1", gameId: "game-2" }],
    ])("gives nothing for %s", (_what, identifier) => {
        expect(start().service.load(identifier)).toBeUndefined();
    });

    it("gives nothing for a game whose map is not defined", () => {
        const copy = copyConfig();
        editGames(copy.directory, (games) => {
            games[0].mapDefinition = { scope: "map", name: "nowhere" };
        });
        const service = createTerrain(copy.appConfig, "real");
        expect(service.load({ id: "sea-1", gameId: "game-1" })).toBeUndefined();
        expect(service.loadAll().size).toBe(readItems(join(copy.directory, "object/terrain.json")).length);
    });

    it("gives every square of the map with loadAll: the terrain of the object file, then the default terrain", () => {
        const { service, items } = start();
        const all = [...service.loadAll().values()];
        expect(all).toHaveLength(150);
        expect(all.slice(0, items.length)).toEqual(items);
        expect(all.slice(items.length).every((terrain) => terrain.definition.name === "sea")).toBe(true);
        expect(new Set(all.map(({ position }) => `${position.x},${position.y}`)).size).toBe(150);
        for (const [key, object] of service.loadAll()) expect(key).toBe(object.identifier);
    });

    it("gives every square an id of its own", () => {
        const { service } = start();
        const ids = [...service.loadAll().values()].map((terrain) => terrain.identifier.id);
        expect(new Set(ids).size).toBe(150);
    });

    it("gives the same id to the same square of the map every time, whatever else is held", () => {
        const { service, items } = start();
        const before = service.load({ id: "sea-1", gameId: "game-1" });
        service.delete(items[0].identifier);
        service.save({ ...items[1], identifier: { ...items[1].identifier, id: "terrain-99" } });
        expect(service.load({ id: "sea-1", gameId: "game-1" })).toEqual(before);
    });

    it("only writes the terrain of the object file", () => {
        const { service, path, items } = start();
        service.saveAll();
        expect(readItems(path)).toEqual(items);
    });

    it("keeps a square of the default terrain once it is saved", () => {
        const { service, path, items } = start();
        const owned = { ...sea(1), playerId: "player-1" };
        service.save(owned);
        expect(service.load(owned.identifier)).toEqual(owned);
        expect(service.loadAll().size).toBe(150);
        service.saveAll();
        expect(readItems(path)).toEqual([...items, owned]);
    });

    it("gives the default terrain again for a square whose terrain is deleted, by its number", () => {
        const { service, items } = start();
        const [first] = items;
        service.delete(first.identifier);
        expect(service.load(first.identifier)).toBeUndefined();
        const number = first.position.y * 15 + first.position.x + 1;
        expect(service.load({ id: `sea-${number}`, gameId: "game-1" })).toEqual(sea(number));
        expect(service.loadAll().size).toBe(150);
    });
});
