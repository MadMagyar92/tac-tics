import { type AppConfig, type MovementDefinition, Scope } from "@tac-tics/api";
import { MemoryDefinitionHandler } from "./app";

export class MovementDefinitionHandler extends MemoryDefinitionHandler<MovementDefinition> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Movement, appConfigPath, appConfig);
    }
};
