import { type AppConfig, Scope, type UnitDefinition } from "@tac-tics/api";
import { MemoryDefinitionHandler } from "./app";

export class UnitDefinitionHandler extends MemoryDefinitionHandler<UnitDefinition> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Unit, appConfigPath, appConfig);
    }
};
