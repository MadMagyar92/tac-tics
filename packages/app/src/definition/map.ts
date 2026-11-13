import { type AppConfig, type MapDefinition, Scope } from "@tac-tics/api";
import { MemoryDefinitionHandler } from "./app";

export class MapDefinitionHandler extends MemoryDefinitionHandler<MapDefinition> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Map, appConfigPath, appConfig);
    }
};
