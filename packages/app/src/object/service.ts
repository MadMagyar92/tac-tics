import type { BaseObject, Id, ObjectHandler, ObjectService } from "@tac-tics/api";
import { loadAppConfigFile } from "../app";
import { MapDefinitionHandler } from "../definition";
import { GameObjectHandler } from "./game";
import { OffenseObjectHandler } from "./offense";
import { PlayerObjectHandler } from "./player";
import { TerrainObjectHandler } from "./terrain";
import { UnitObjectHandler } from "./unit";

export class ObjectServiceImpl implements ObjectService {
    private handlers: ObjectHandler<Id, BaseObject<Id>>[];

    constructor(appConfigPath: string) {
        const appConfig = loadAppConfigFile(appConfigPath);
        const games = new GameObjectHandler(appConfigPath, appConfig);
        this.handlers = [
            games,
            new OffenseObjectHandler(appConfigPath, appConfig),
            new PlayerObjectHandler(appConfigPath, appConfig),
            new TerrainObjectHandler(appConfigPath, appConfig, games, new MapDefinitionHandler(appConfigPath, appConfig)),
            new UnitObjectHandler(appConfigPath, appConfig),
        ];

        for (const { scope, object } of appConfig) {
            if (object !== undefined && !this.handlers.some((handler) => handler.accept(scope))) {
                throw new Error(`App config ${appConfigPath} maps objects for the unknown scope "${scope}"`);
            }
        }
    }

    loadAll<O extends BaseObject<Id>>(scope: string): Map<O["identifier"], O> {
        return (this.find(scope)?.loadAll() ?? new Map()) as Map<O["identifier"], O>;
    }

    save<O extends BaseObject<Id>>(scope: string, object: O): O["identifier"] {
        return this.handlerOf(scope).save(object) as O["identifier"];
    }

    load<O extends BaseObject<Id>>(scope: string, identifier: O["identifier"]): O | undefined {
        return this.find(scope)?.load(identifier) as O | undefined;
    }

    delete<O extends BaseObject<Id>>(scope: string, identifier: O["identifier"]): O | undefined {
        return this.find(scope)?.delete(identifier) as O | undefined;
    }

    private find(scope: string): ObjectHandler<Id, BaseObject<Id>> | undefined {
        return this.handlers.find((handler) => handler.accept(scope));
    }

    private handlerOf(scope: string): ObjectHandler<Id, BaseObject<Id>> {
        const handler = this.find(scope);
        if (!handler) {
            throw new Error(`No object handler accepts the scope "${scope}"`);
        }
        return handler;
    }
};
