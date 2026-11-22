import type { BaseObject, CaptureObject, Id, TerrainObject } from "@tac-tics/api";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanUp, copyConfig, scopeItem } from "../../../test/config";
import { loadAppConfigFile } from "../../app";
import { CaptureDefinitionHandler, MapDefinitionHandler } from "../../definition";
import { CaptureObjectHandler, GameObjectHandler, MapObjectHandler, type MemoryObjectHandler, MovementObjectHandler, OffenseObjectHandler, PlayerObjectHandler, TerrainObjectHandler, UnitObjectHandler } from "..";

afterEach(cleanUp);

type Item = BaseObject<Id> & Record<string, any>;
type AnyService = MemoryObjectHandler<any, any>;

const services: { name: string; scope: string; file: string; create: (appConfig: string) => AnyService }[] = [
    { name: "CaptureObjectHandler", scope: "capture", file: "object/capture.json", create: (appConfig) => new CaptureObjectHandler(appConfig, loadAppConfigFile(appConfig)) },
    { name: "GameObjectHandler", scope: "game", file: "object/game.json", create: (appConfig) => new GameObjectHandler(appConfig, loadAppConfigFile(appConfig)) },
    { name: "MapObjectHandler", scope: "map", file: "object/map.json", create: (appConfig) => new MapObjectHandler(appConfig, loadAppConfigFile(appConfig)) },
    { name: "MovementObjectHandler", scope: "movement", file: "object/movement.json", create: (appConfig) => new MovementObjectHandler(appConfig, loadAppConfigFile(appConfig)) },
    { name: "OffenseObjectHandler", scope: "offense", file: "object/offense.json", create: (appConfig) => new OffenseObjectHandler(appConfig, loadAppConfigFile(appConfig)) },
    { name: "PlayerObjectHandler", scope: "player", file: "object/player.json", create: (appConfig) => new PlayerObjectHandler(appConfig, loadAppConfigFile(appConfig)) },
    { name: "TerrainObjectHandler", scope: "terrain", file: "object/terrain.json", create: (appConfig) => new TerrainObjectHandler(appConfig, loadAppConfigFile(appConfig)) },
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
            for (const name of ["", `${scope}s`, scope.toUpperCase(), "transport", "action"]) expect(service.accept(name), name).toBe(false);
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
        ["capture", "object/capture.json", (appConfig: string) => new CaptureObjectHandler(appConfig, loadAppConfigFile(appConfig))],
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

    it("holds the terrain with an id in one map apart from the terrain with that id in another map", () => {
        const { service, items } = start((appConfig) => new TerrainObjectHandler(appConfig, loadAppConfigFile(appConfig)), "object/terrain.json");
        const inOtherMap = { ...items[0], identifier: { id: items[0].identifier.id, mapId: "another-map" }, note: "other" };

        service.save(inOtherMap);

        expect(values(service)).toHaveLength(items.length + 1);
        expect(service.load(items[0].identifier)).toEqual(items[0]);
        expect(service.load(inOtherMap.identifier)).toEqual(inOtherMap);
    });

    it("holds an offense of one unit apart from the offense with that id of another unit of the same game", () => {
        const { service, items } = start((appConfig) => new OffenseObjectHandler(appConfig, loadAppConfigFile(appConfig)), "object/offense.json");
        const ofOtherUnit = { ...items[0], identifier: { ...items[0].identifier, unitId: "another-unit" }, note: "other" };

        service.save(ofOtherUnit);

        expect(values(service)).toHaveLength(items.length + 1);
        expect(service.load(items[0].identifier)).toEqual(items[0]);
        expect(service.load(ofOtherUnit.identifier)).toEqual(ofOtherUnit);
    });

    it("holds a movement of one unit apart from the movement with that id of another unit of the same game", () => {
        const { service, items } = start((appConfig) => new MovementObjectHandler(appConfig, loadAppConfigFile(appConfig)), "object/movement.json");
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

describe("the static terrain and the captures of the repo's config", () => {
    /** The static terrain of map-1 and the captures of game-1, which is played on it, as a copy of the repo's config holds them, with the map definition of Spann Island and the names of the terrain the capture definitions allow. */
    const start = () => {
        const { appConfig } = copyConfig();
        const config = loadAppConfigFile(appConfig);
        return {
            appConfig,
            terrain: values(new TerrainObjectHandler(appConfig, config)) as TerrainObject[],
            captures: values(new CaptureObjectHandler(appConfig, config)) as CaptureObject[],
            map: new MapDefinitionHandler(appConfig, config).get({ scope: "map", name: "spann-island" })!,
            allowed: [...new CaptureDefinitionHandler(appConfig, config).loadAll().values()].flatMap(({ allowed }) => allowed.map(({ terrain }) => terrain.name)),
        };
    };

    it("holds the static terrain by the id of its map, and the captures by the id of their game", () => {
        const { terrain, captures } = start();
        for (const { identifier } of terrain) expect(identifier).toEqual({ id: identifier.id, mapId: "map-1" });
        for (const { identifier } of captures) expect(identifier).toEqual({ id: identifier.id, gameId: "game-1" });
    });

    it("makes up every square of Spann Island once, between the static terrain of its map and the captures of its game", () => {
        const { terrain, captures } = start();
        const squares = [...terrain, ...captures];
        expect([terrain.length, captures.length]).toEqual([129, 21]);
        expect(new Set(squares.map(({ position }) => `${position.x},${position.y}`)).size).toBe(150);
    });

    it("numbers each square from zero by its position, as the map does", () => {
        const { terrain, captures } = start();
        for (const { identifier, position } of [...terrain, ...captures]) expect(identifier.id).toBe(`terrain-${String(position.y * 15 + position.x).padStart(3, "0")}`);
    });

    it("holds each square as the map definition places it, or else as the default terrain of the map", () => {
        const { terrain, captures, map } = start();
        for (const { identifier, definition, position } of [...terrain, ...captures]) {
            const placed = map.terrain.find(({ positions }) => positions.some(({ x, y }) => x === position.x && y === position.y));
            expect(definition, identifier.id).toEqual(placed?.definition ?? map.defaultTerrain);
        }
    });

    it("holds a capture for every square whose terrain a capture definition allows, and static terrain for every other square", () => {
        const { terrain, captures, allowed } = start();
        for (const { identifier, definition } of captures) expect(allowed, identifier.id).toContain(definition.name);
        for (const { identifier, definition } of terrain) expect(allowed, identifier.id).not.toContain(definition.name);
    });

    it("holds the captures under the definitions of their terrain, and refuses one under a capture definition", () => {
        const { appConfig, captures } = start();
        const service = new CaptureObjectHandler(appConfig, loadAppConfigFile(appConfig));
        for (const { identifier, definition } of captures) expect(definition.scope, identifier.id).toBe("terrain");
        expect(() => service.save({ ...captures[0], definition: { scope: "capture", name: "infantry" } })).toThrow(
            `The capture objects cannot hold the object "${captures[0].identifier.id}", whose definition has the scope "capture"`,
        );
        expect(service.load(captures[0].identifier)).toEqual(captures[0]);
    });
});
