import type { DefinitionKey, Id } from "@tac-tics/api";

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value !== "";

export const isId = (value: unknown): value is Id =>
    isPlainObject(value) && typeof value.id === "string";

export const isDefinitionKey = (value: unknown): value is DefinitionKey =>
    isPlainObject(value) && typeof value.scope === "string" && typeof value.name === "string";
