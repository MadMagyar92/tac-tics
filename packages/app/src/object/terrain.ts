import { type AppConfig, type MapReferenceId, Scope, type TerrainObject } from "@tac-tics/api";
import { MemoryObjectHandler } from "./app";

export class TerrainObjectHandler extends MemoryObjectHandler<MapReferenceId, TerrainObject> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Terrain, appConfigPath, appConfig);
    }
};
