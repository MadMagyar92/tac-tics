import { type AppConfig, type GameReferenceId, Scope, type UnitObject } from "@tac-tics/api";
import { MemoryObjectHandler } from "./app";

export class UnitObjectHandler extends MemoryObjectHandler<GameReferenceId, UnitObject> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Unit, appConfigPath, appConfig);
    }
};
