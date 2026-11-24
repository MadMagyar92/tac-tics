import { type AppConfig, type GameReferenceId, type OutpostObject, Scope } from "@tac-tics/api";
import { MemoryObjectHandler } from "./app";

export class OutpostObjectHandler extends MemoryObjectHandler<GameReferenceId, OutpostObject> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Outpost, appConfigPath, appConfig);
    }
};
