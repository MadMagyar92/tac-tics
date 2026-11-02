import { type AppConfig, type GameReferenceId, Scope, type TerrainObject } from "@tac-tics/api";
import { MemoryObjectHandler } from "./app";

export class TerrainObjectHandler extends MemoryObjectHandler<GameReferenceId, TerrainObject> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Terrain, appConfigPath, appConfig);
    }
};
