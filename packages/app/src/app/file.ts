import type { AppConfig, AppScopeConfig, BaseObject, Id } from "@tac-tics/api";
import { readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname, resolve } from "node:path";
import { isNonEmptyString, isPlainObject } from "./validate";

function writeJsonFile<O extends BaseObject<Id>>(path: string, values: O[]): void {
    const temporary = `${path}.${process.pid}.tmp`;
    try {
        writeFileSync(temporary, `${JSON.stringify(values)}\n`);
        renameSync(temporary, path);
    } catch (error) {
        rmSync(temporary, { force: true });
        throw error;
    }
};

export function saveObjectFile<O extends BaseObject<Id>>(file: string, values: Map<string, O>): void {
    writeJsonFile<O>(file, [...values.values()]);
};

function readJsonFile<T>(path: string): T {
    try {
        return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch (error) {
        throw new Error(`${path} cannot be parsed: ${(error as Error).message}`);
    }
};

function invalid(path: string, problem: string): never {
    throw new Error(`Invalid app config ${path}: ${problem}`);
};

export function loadAppConfigFile(path: string): AppConfig {
    const config = readJsonFile<AppConfig>(path);
    if (!Array.isArray(config)) {
        return invalid(path, 'expected a list of scopes, each with a "scope" name and the files of its definitions and objects');
    }

    config.forEach((item: AppScopeConfig, index) => {
        if (!isPlainObject(item)) {
            return invalid(path, `item ${index} must be an object`);
        }

        if (!isNonEmptyString(item.scope)) {
            return invalid(path, `item ${index} must have a "scope" name`);
        }

        if (item.definition === undefined && item.object === undefined) {
            return invalid(path, `scope "${item.scope}" must have a definition file or an object file`);
        }

        if (item.definition !== undefined && !isNonEmptyString(item.definition)) {
            return invalid(path, `the definition of scope "${item.scope}" must be a file path`);
        }

        if (item.object !== undefined && !isNonEmptyString(item.object)) {
            return invalid(path, `the object of scope "${item.scope}" must be a file path`);
        }
    });
    return config;
};

export function loadScopeFile<T>(config: AppConfig, scope: string, type: "definition" | "object", path: string): { file: string; contents: T[] } {
    const name = config.find((item) => item.scope === scope)?.[type];
    if (name === undefined) {
        return invalid(path, `scope "${scope}" needs a ${type} file`);
    }
    const file = resolve(dirname(path), name);
    return { file, contents: readJsonFile<T[]>(file) };
};
