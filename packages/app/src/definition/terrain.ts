import { type AppConfig, Scope, type TerrainDefinition } from "@tac-tics/api";
import { MemoryDefinitionHandler } from "./app";

export class TerrainDefinitionHandler extends MemoryDefinitionHandler<TerrainDefinition> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Terrain, appConfigPath, appConfig);
    }
};
