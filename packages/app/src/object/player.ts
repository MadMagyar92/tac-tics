import { type AppConfig, type GameReferenceId, type PlayerObject, Scope } from "@tac-tics/api";
import { MemoryObjectHandler } from "./app";

export class PlayerObjectHandler extends MemoryObjectHandler<GameReferenceId, PlayerObject> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Player, appConfigPath, appConfig);
    }
};
