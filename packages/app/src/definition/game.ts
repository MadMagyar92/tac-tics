import { type AppConfig, type GameDefinition, Scope } from "@tac-tics/api";
import { MemoryDefinitionHandler } from "./app";

export class GameDefinitionHandler extends MemoryDefinitionHandler<GameDefinition> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Game, appConfigPath, appConfig);
    }
};
