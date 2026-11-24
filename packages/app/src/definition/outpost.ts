import { type AppConfig, type OutpostDefinition, Scope } from "@tac-tics/api";
import { MemoryDefinitionHandler } from "./app";

export class OutpostDefinitionHandler extends MemoryDefinitionHandler<OutpostDefinition> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Outpost, appConfigPath, appConfig);
    }
};
