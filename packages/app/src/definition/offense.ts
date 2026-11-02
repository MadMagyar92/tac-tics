import { type AppConfig, type OffenseDefinition, Scope } from "@tac-tics/api";
import { MemoryDefinitionHandler } from "./app";

export class OffenseDefinitionHandler extends MemoryDefinitionHandler<OffenseDefinition> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Offense, appConfigPath, appConfig);
    }
};
