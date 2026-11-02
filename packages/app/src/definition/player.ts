import { type AppConfig, type PlayerDefinition, Scope } from "@tac-tics/api";
import { MemoryDefinitionHandler } from "./app";

export class PlayerDefinitionHandler extends MemoryDefinitionHandler<PlayerDefinition> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Player, appConfigPath, appConfig);
    }
};
