import type { AppConfig, BaseObject, Id } from "@tac-tics/api";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanUp, realAppConfig, tempDirectory } from "../../../test/config";
import { loadAppConfigFile, loadScopeFile, saveObjectFile } from "../file";

// Lets the real file system do the work, but remembers what was written, to see where the temporary file goes.
const written: string[] = [];
vi.mock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    return {
        ...actual,
        writeFileSync: (path: string, ...rest: unknown[]) => {
            written.push(String(path));
            return (actual.writeFileSync as (...args: unknown[]) => void)(path, ...rest);
        },
    };
});

afterEach(() => {
    cleanUp();
    written.length = 0;
});

const object = (id: string, extra: Record<string, unknown> = {}): BaseObject<Id> & Record<string, unknown> => ({
    identifier: { id },
    definition: { scope: "thing", name: "plain" },
    ...extra,
});

/** The objects of `file`, read back the way the handlers read them. */
const contentsOf = (file: string) =>
    loadScopeFile([{ scope: "thing", object: file }], "thing", "object", join(dirname(file), "app.config.json")).contents;

describe("saveObjectFile", () => {
    it("writes the values of the map as JSON on one line, with a newline at the end", () => {
        const file = join(tempDirectory(), "x.json");
        saveObjectFile(file, new Map([["a", object("a", { list: [1, "two", null] })], ["b", object("b")]]));
        expect(readFileSync(file, "utf8")).toBe(
            '[{"identifier":{"id":"a"},"definition":{"scope":"thing","name":"plain"},"list":[1,"two",null]},{"identifier":{"id":"b"},"definition":{"scope":"thing","name":"plain"}}]\n',
        );
    });

    it("writes the values in the order of the map, whatever its keys are", () => {
        const file = join(tempDirectory(), "x.json");
        saveObjectFile(file, new Map([["z", object("first")], ["a", object("second")]]));
        expect(contentsOf(file)).toEqual([object("first"), object("second")]);
    });

    it("writes an empty list for an empty map", () => {
        const file = join(tempDirectory(), "x.json");
        saveObjectFile(file, new Map());
        expect(readFileSync(file, "utf8")).toBe("[]\n");
    });

    it("writes what loadScopeFile reads back", () => {
        const file = join(tempDirectory(), "x.json");
        const values = [object("a", { s: 'quote " backslash \\ newline \n tab \t unicode é €', n: -1.5, yes: true, nothing: null, deep: { a: [{ b: [] }] } })];
        saveObjectFile(file, new Map(values.map((value) => [value.identifier.id, value])));
        expect(contentsOf(file)).toEqual(values);
    });

    it("replaces what the file held", () => {
        const file = join(tempDirectory(), "x.json");
        writeFileSync(file, "old contents");
        saveObjectFile(file, new Map([["a", object("a")]]));
        expect(contentsOf(file)).toEqual([object("a")]);
    });

    it("writes to a temporary file in the directory of the target, then moves it over the target", () => {
        const file = join(tempDirectory(), "x.json");
        saveObjectFile(file, new Map([["a", object("a")]]));
        expect(written).toHaveLength(1);
        expect(written[0]).not.toBe(file);
        expect(dirname(written[0])).toBe(dirname(file));
        expect(written[0].startsWith(file)).toBe(true);
    });

    it("leaves no temporary file behind", () => {
        const directory = tempDirectory();
        saveObjectFile(join(directory, "x.json"), new Map([["a", object("a")]]));
        expect(readdirSync(directory)).toEqual(["x.json"]);
    });

    it("throws, and creates nothing, when the directory does not exist", () => {
        const directory = tempDirectory();
        expect(() => saveObjectFile(join(directory, "missing", "x.json"), new Map([["a", object("a")]]))).toThrow();
        expect(readdirSync(directory)).toEqual([]);
    });

    it("keeps the file as it was, and leaves nothing behind, when a value cannot be written as JSON", () => {
        const directory = tempDirectory();
        const file = join(directory, "x.json");
        writeFileSync(file, "keep me");
        expect(() => saveObjectFile(file, new Map([["a", object("a", { n: 1n })]]))).toThrow();
        expect(readFileSync(file, "utf8")).toBe("keep me");
        expect(readdirSync(directory)).toEqual(["x.json"]);
    });
});

/** Writes `text` as an app config in a new temporary directory and returns its path. */
const writeConfig = (text: string): string => {
    const file = join(tempDirectory(), "app.config.json");
    writeFileSync(file, text);
    return file;
};

describe("loadAppConfigFile", () => {
    it("returns the config in the file", () => {
        const config = [{ scope: "game", definition: "d/game.json", object: "o/game.json" }, { scope: "movement", definition: "d/movement.json" }];
        expect(loadAppConfigFile(writeConfig(JSON.stringify(config)))).toEqual(config);
    });

    it("accepts a scope with only a definition file or only an object file, and a config with no scopes", () => {
        expect(loadAppConfigFile(writeConfig('[{ "scope": "weather", "definition": "d.json" }]'))).toEqual([{ scope: "weather", definition: "d.json" }]);
        expect(loadAppConfigFile(writeConfig('[{ "scope": "weather", "object": "o.json" }]'))).toEqual([{ scope: "weather", object: "o.json" }]);
        expect(loadAppConfigFile(writeConfig("[]"))).toEqual([]);
    });

    it("does not look at the keys it does not know", () => {
        const config = [{ scope: "game", definition: "d.json", note: "anything", extra: 3 }];
        expect(loadAppConfigFile(writeConfig(JSON.stringify(config)))).toEqual(config);
    });

    it("loads the repo's app config, which lists the scopes of every definition and object file", () => {
        const config = loadAppConfigFile(realAppConfig);
        expect(config.map((item) => item.scope)).toEqual(["game", "movement", "offense", "player", "terrain", "unit"]);
        expect(config.filter((item) => item.object).map((item) => item.scope)).toEqual(["game", "offense", "player", "terrain", "unit"]);
    });

    it("lists files in the repo's app config that all exist and hold a list", () => {
        const config = loadAppConfigFile(realAppConfig);
        for (const { scope, ...files } of config) {
            for (const kind of ["definition", "object"] as const) {
                if (files[kind] !== undefined) {
                    expect(Array.isArray(loadScopeFile(config, scope, kind, realAppConfig).contents), `${scope} ${kind}`).toBe(true);
                }
            }
        }
    });

    it("names the file when it cannot be read", () => {
        const file = join(tempDirectory(), "missing.json");
        expect(() => loadAppConfigFile(file)).toThrow(`${file} cannot be parsed`);
    });

    it.each([
        ["", "cannot be parsed"],
        ["[", "cannot be parsed"],
        ["null", "expected a list of scopes"],
        ["{}", "expected a list of scopes"],
        ['"game"', "expected a list of scopes"],
        ['{ "scope": [] }', "expected a list of scopes"],
        ['{ "scope": { "game": { "definition": "game.json" } } }', "expected a list of scopes"],
        ["[null]", "item 0 must be an object"],
        ["[[]]", "item 0 must be an object"],
        ['["game"]', "item 0 must be an object"],
        ["[{}]", 'item 0 must have a "scope" name'],
        ['[{ "scope": 3 }]', 'item 0 must have a "scope" name'],
        ['[{ "scope": null }]', 'item 0 must have a "scope" name'],
        ['[{ "scope": "" }]', 'item 0 must have a "scope" name'],
        ['[{ "scope": "game" }]', 'scope "game" must have a definition file or an object file'],
        ['[{ "scope": "game", "defintion": "x.json" }]', 'scope "game" must have a definition file or an object file'],
        ['[{ "scope": "game", "definition": null }]', 'the definition of scope "game" must be a file path'],
        ['[{ "scope": "game", "definition": "x.json", "object": 3 }]', 'the object of scope "game" must be a file path'],
        ['[{ "scope": "game", "definition": "", "object": "o.json" }]', 'the definition of scope "game" must be a file path'],
        ['[{ "scope": "game", "definition": 3 }]', 'the definition of scope "game" must be a file path'],
        ['[{ "scope": "game", "definition": "" }]', 'the definition of scope "game" must be a file path'],
        ['[{ "scope": "game", "object": null }]', 'the object of scope "game" must be a file path'],
        ['[{ "scope": "game", "object": ["x.json"] }]', 'the object of scope "game" must be a file path'],
    ])("rejects %j: %s", (text, problem) => {
        const file = writeConfig(text);
        expect(() => loadAppConfigFile(file)).toThrow(problem);
    });

    it("reports the first problem in the file when there are several", () => {
        const items = writeConfig('[{ "scope": "first" }, { "scope": "second", "definition": 3 }]');
        expect(() => loadAppConfigFile(items)).toThrow('scope "first" must have a definition file or an object file');
        const shapes = writeConfig('[null, { "scope": 3 }]');
        expect(() => loadAppConfigFile(shapes)).toThrow("item 0 must be an object");
        const later = writeConfig('[{ "scope": "game", "definition": "d.json" }, 3]');
        expect(() => loadAppConfigFile(later)).toThrow("item 1 must be an object");
        const keys = writeConfig('[{ "scope": "game", "definition": 3, "object": 4 }]');
        expect(() => loadAppConfigFile(keys)).toThrow('the definition of scope "game" must be a file path');
        const name = writeConfig('[{ "scope": 3, "definition": 4 }]');
        expect(() => loadAppConfigFile(name)).toThrow('item 0 must have a "scope" name');
        const files = writeConfig('[{ "scope": "game", "object": 4 }]');
        expect(() => loadAppConfigFile(files)).toThrow('the object of scope "game" must be a file path');
    });

    it("names the file in the errors about its contents", () => {
        const file = writeConfig("{}");
        expect(() => loadAppConfigFile(file)).toThrow(`Invalid app config ${file}:`);
    });
});

describe("loadScopeFile", () => {
    /** A directory with the app config's files in it, the path the app config would have there, and a config that lists them. */
    const world = () => {
        const root = tempDirectory();
        const put = (name: string, contents: unknown) => {
            const file = join(root, name);
            mkdirSync(join(file, ".."), { recursive: true });
            writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents));
            return file;
        };
        put("app/definition/game.config.json", [{ name: "game definition" }]);
        put("app/object/game.json", [{ id: "game object" }]);
        put("shared/movement.json", [{ name: "movement" }]);
        const absolute = put("elsewhere/objects.json", [{ id: "absolute" }]);
        const config: AppConfig = [
            { scope: "game", definition: "definition/game.config.json", object: "object/game.json" },
            { scope: "movement", definition: "../shared/movement.json" },
            { scope: "absolute", object: absolute },
            { scope: "missing", definition: "definition/nowhere.json" },
            { scope: "broken", object: "object/broken.json" },
        ];
        put("app/object/broken.json", "[ not json");
        return { root, config, path: join(root, "app", "app.config.json"), put, absolute };
    };

    it("gives the file, relative to the directory of the app config, and what it holds", () => {
        const { root, config, path } = world();
        expect(loadScopeFile(config, "game", "definition", path)).toEqual({
            file: join(root, "app", "definition", "game.config.json"),
            contents: [{ name: "game definition" }],
        });
        expect(loadScopeFile(config, "game", "object", path)).toEqual({
            file: join(root, "app", "object", "game.json"),
            contents: [{ id: "game object" }],
        });
    });

    it("gives an absolute path even for a relative app config path", () => {
        const { root, config, path } = world();
        const { file, contents } = loadScopeFile(config, "game", "object", relative(process.cwd(), path));
        expect(isAbsolute(file)).toBe(true);
        expect(file).toBe(join(root, "app", "object", "game.json"));
        expect(contents).toEqual([{ id: "game object" }]);
    });

    it("follows .. out of the config directory", () => {
        const { root, config, path } = world();
        expect(loadScopeFile(config, "movement", "definition", path)).toEqual({
            file: join(root, "shared", "movement.json"),
            contents: [{ name: "movement" }],
        });
    });

    it("keeps an absolute path as it is", () => {
        const { config, path, absolute } = world();
        expect(loadScopeFile(config, "absolute", "object", path)).toEqual({ file: absolute, contents: [{ id: "absolute" }] });
    });

    it("gives what the file holds whatever it is, without checking it", () => {
        const { config, path, put } = world();
        put("app/definition/game.config.json", { not: "a list" });
        expect(loadScopeFile(config, "game", "definition", path).contents).toEqual({ not: "a list" });
    });

    it("reads the file every time it is asked for", () => {
        const { config, path, put } = world();
        expect(loadScopeFile(config, "game", "object", path).contents).toEqual([{ id: "game object" }]);
        put("app/object/game.json", []);
        expect(loadScopeFile(config, "game", "object", path).contents).toEqual([]);
    });

    it("names the file when it cannot be read", () => {
        const { root, config, path } = world();
        expect(() => loadScopeFile(config, "missing", "definition", path)).toThrow(`${join(root, "app", "definition", "nowhere.json")} cannot be parsed: ENOENT`);
    });

    it("names the file when it is not valid JSON", () => {
        const { root, config, path } = world();
        expect(() => loadScopeFile(config, "broken", "object", path)).toThrow(`${join(root, "app", "object", "broken.json")} cannot be parsed: `);
    });

    it("says what is missing when the scope has no such file", () => {
        const { config, path } = world();
        expect(() => loadScopeFile(config, "movement", "object", path)).toThrow(`Invalid app config ${path}: scope "movement" needs a object file`);
        expect(() => loadScopeFile(config, "game", "definition", path)).not.toThrow();
    });

    it("says what is missing when the scope is not in the config", () => {
        const { config, path } = world();
        expect(() => loadScopeFile(config, "weather", "definition", path)).toThrow(`Invalid app config ${path}: scope "weather" needs a definition file`);
    });

    it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "length", "0"])("does not mistake %s for a scope", (name) => {
        const { config, path } = world();
        expect(() => loadScopeFile(config, name, "definition", path)).toThrow(`scope "${name}" needs a definition file`);
    });
});
