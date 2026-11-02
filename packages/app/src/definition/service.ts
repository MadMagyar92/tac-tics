import type { Definition, DefinitionKey, DefinitionService } from "@tac-tics/api";
import { loadAppConfigFile } from "../app";
import { MemoryDefinitionHandler } from "./app";
import { GameDefinitionHandler } from "./game";
import { MovementDefinitionHandler } from "./movement";
import { OffenseDefinitionHandler } from "./offense";
import { PlayerDefinitionHandler } from "./player";
import { TerrainDefinitionHandler } from "./terrain";
import { UnitDefinitionHandler } from "./unit";

/**
 * Serves the definitions of every scope. At start-up it reads the app config at `appConfigPath` and loads the
 * definition file it maps for each scope into memory; after that no file is read again.
 */
export class DefinitionServiceImpl implements DefinitionService {
    private handlers: MemoryDefinitionHandler<Definition>[];

    constructor(appConfigPath: string) {
        const appConfig = loadAppConfigFile(appConfigPath);
        this.handlers = [
            new GameDefinitionHandler(appConfigPath, appConfig),
            new MovementDefinitionHandler(appConfigPath, appConfig),
            new OffenseDefinitionHandler(appConfigPath, appConfig),
            new PlayerDefinitionHandler(appConfigPath, appConfig),
            new TerrainDefinitionHandler(appConfigPath, appConfig),
            new UnitDefinitionHandler(appConfigPath, appConfig),
        ];

        const scopes = this.handlers.map((handler) => handler.scope);
        for (const { scope, definition } of appConfig) {
            if (definition !== undefined && !scopes.includes(scope)) {
                throw new Error(`App config ${appConfigPath} maps definitions for the unknown scope "${scope}"`);
            }
        }
    }

    get<D extends Definition>(key: DefinitionKey): D | undefined {
        return this.handlers.find((handler) => handler.accept(key))?.get(key) as D | undefined;
    }
};
