import type { AppConfig, Definition, DefinitionHandler, DefinitionKey } from "@tac-tics/api";
import { isDefinitionKey, isPlainObject, loadScopeFile } from "../app";

export const sameKey = (a: DefinitionKey, b: DefinitionKey): boolean => a.scope === b.scope && a.name === b.name;

const freeze = <T>(value: T, seen = new WeakSet<object>()): T => {
    if (typeof value === "object" && value !== null && !seen.has(value)) {
        seen.add(value);
        Object.values(value).forEach((inner) => freeze(inner, seen));
        Object.freeze(value);
    }
    return value;
};

export abstract class MemoryDefinitionHandler<D extends Definition> implements DefinitionHandler<D> {
    private definitions = new Map<string, D>();

    protected constructor(readonly scope: string, path: string, config: AppConfig) {
        const { file, contents } = loadScopeFile<D>(config, scope, "definition", path);
        if (!Array.isArray(contents)) {
            throw new Error(`${file} must hold a list of definitions`);
        }
        try {
            const loaded = new Map<string, D>();
            contents.forEach((value, index) => {
                if (!isPlainObject(value) || !isDefinitionKey(value.definition)) {
                    throw new Error(`item ${index} is not a definition with a scope and a name`);
                }

                const definition = value as D;
                const { scope, name } = definition.definition;
                if (scope !== this.scope) {
                    throw new Error(`Definition "${name}" has the scope "${scope}", not "${this.scope}"`);
                }

                if (loaded.has(name)) {
                    throw new Error(`There is more than one ${this.scope} definition named "${name}"`);
                }
                loaded.set(name, freeze(definition));
            });
            this.definitions = loaded;
        } catch (error) {
            throw new Error(`${file}: ${(error as Error).message}`);
        }
    }

    loadAll(): Map<DefinitionKey, D> {
        return new Map([...this.definitions.values()].map((definition): [DefinitionKey, D] => {
            const { scope, name } = definition.definition;
            return [{ scope, name }, definition];
        }));
    }

    accept(key: DefinitionKey): boolean {
        return key.scope === this.scope;
    }

    get(key: DefinitionKey): D | undefined {
        return this.accept(key) ? this.definitions.get(key.name) : undefined;
    }
};
