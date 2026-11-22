import type { AppConfig, BaseObject, Id, ObjectHandler } from "@tac-tics/api";
import { loadScopeFile, saveObjectFile } from "../app";
import { isDefinitionKey, isId, isPlainObject } from "../common";

const keyOf = (identifier: Id): string => {
    const fields: Record<string, unknown> = identifier;
    return JSON.stringify(Object.keys(fields).sort().map((name) => [name, fields[name]]));
};

export abstract class MemoryObjectHandler<I extends Id, O extends BaseObject<I>> implements ObjectHandler<I, O> {
    private objects = new Map<string, O>();
    private readonly file: string;

    protected constructor(readonly scope: string, appConfigPath: string, appConfig: AppConfig, private readonly definitionScope: string = scope) {
        const { file, contents } = loadScopeFile<O>(appConfig, scope, "object", appConfigPath);
        this.file = file;
        if (!Array.isArray(contents)) {
            throw new Error(`${file} must hold a list of objects`);
        }
        try {
            const held = new Map<string, O>();
            contents.forEach((value, index) => {
                if (!isPlainObject(value) || !isId(value.identifier) || !isDefinitionKey(value.definition)) {
                    throw new Error(`item ${index} is not an object with an identifier and a definition`);
                }
                const object = this.validate(value as O);
                const key = keyOf(object.identifier);
                if (held.has(key)) {
                    throw new Error(`there is more than one object with the identifier ${key}`);
                }
                held.set(key, object);
            });
            this.objects = held;
        } catch (error) {
            throw new Error(`${file}: ${(error as Error).message}`);
        }
    }

    loadAll(): Map<I, O> {
        return new Map([...this.objects.values()].map((object): [I, O] => {
            const copy = structuredClone(object);
            return [copy.identifier, copy];
        }));
    }

    saveAll(): Map<I, O> {
        saveObjectFile(this.file, this.objects);
        return this.loadAll();
    }

    accept(scope: string): boolean {
        return scope === this.scope;
    }

    load(identifier: I): O | undefined {
        const object = this.objects.get(keyOf(identifier));
        return object && structuredClone(object);
    }

    save(object: O): I {
        this.validate(object);
        this.objects.set(keyOf(object.identifier), structuredClone(object));
        return object.identifier;
    }

    delete(identifier: I): O | undefined {
        const key = keyOf(identifier);
        const object = this.objects.get(key);
        this.objects.delete(key);
        return object;
    }

    private validate(object: O): O {
        if (object.definition.scope !== this.definitionScope) {
            throw new Error(`The ${this.scope} objects cannot hold the object "${object.identifier.id}", whose definition has the scope "${object.definition.scope}"`);
        }
        return object;
    }
};
