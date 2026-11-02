import { describe, expect, it } from "vitest";
import { isDefinitionKey, isId, isNonEmptyString, isPlainObject } from "../validate";

describe("isPlainObject", () => {
    it.each([
        ["an empty object", {}],
        ["an object", { a: 1 }],
        ["a parsed JSON object", JSON.parse('{ "a": { "b": [1] } }')],
        ["an object with no prototype", Object.create(null)],
        ["an instance of a class", new (class Thing {})()],
    ])("is true for %s", (_name, value) => {
        expect(isPlainObject(value)).toBe(true);
    });

    it.each([
        ["null", null],
        ["undefined", undefined],
        ["an empty list", []],
        ["a list", [{ a: 1 }]],
        ["a string", "text"],
        ["a number", 3],
        ["zero", 0],
        ["a boolean", false],
        ["a function", () => ({})],
    ])("is false for %s", (_name, value) => {
        expect(isPlainObject(value)).toBe(false);
    });

    it("narrows the type so that its members can be read", () => {
        const value: unknown = { a: 1 };
        if (isPlainObject(value)) {
            expect(value.a).toBe(1);
        }
    });
});

describe("isNonEmptyString", () => {
    it.each(["a", " ", "0", "a longer text"])("is true for %j", (value) => {
        expect(isNonEmptyString(value)).toBe(true);
    });

    it.each([["the empty string", ""], ["null", null], ["undefined", undefined], ["a number", 3], ["zero", 0], ["a list of strings", ["a"]], ["an object", { length: 1 }]])(
        "is false for %s",
        (_name, value) => {
            expect(isNonEmptyString(value)).toBe(false);
        },
    );
});

describe("isId", () => {
    it.each([
        ["an identifier", { id: "a" }],
        ["an identifier with an empty id", { id: "" }],
        ["an identifier with more fields", { id: "a", gameId: "g", unitId: "u" }],
    ])("is true for %s", (_name, value) => {
        expect(isId(value)).toBe(true);
    });

    it.each([
        ["an object with no id", {}],
        ["an object whose id is a number", { id: 3 }],
        ["an object whose id is null", { id: null }],
        ["an object with only other fields", { gameId: "g" }],
        ["a list", ["a"]],
        ["null", null],
        ["a string", "a"],
    ])("is false for %s", (_name, value) => {
        expect(isId(value)).toBe(false);
    });
});

describe("isDefinitionKey", () => {
    it.each([
        ["a key", { scope: "unit", name: "tank" }],
        ["a key with empty strings", { scope: "", name: "" }],
        ["a key with more fields", { scope: "unit", name: "tank", extra: 1 }],
    ])("is true for %s", (_name, value) => {
        expect(isDefinitionKey(value)).toBe(true);
    });

    it.each([
        ["an object with no fields", {}],
        ["an object with only a scope", { scope: "unit" }],
        ["an object with only a name", { name: "tank" }],
        ["an object whose scope is a number", { scope: 1, name: "tank" }],
        ["an object whose name is a number", { scope: "unit", name: 1 }],
        ["a list of the two strings", ["unit", "tank"]],
        ["null", null],
        ["a string", "unit"],
    ])("is false for %s", (_name, value) => {
        expect(isDefinitionKey(value)).toBe(false);
    });
});
