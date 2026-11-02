import { type AppConfig, type OffenseObject, Scope, type UnitReferenceId } from "@tac-tics/api";
import { MemoryObjectHandler } from "./app";

export class OffenseObjectHandler extends MemoryObjectHandler<UnitReferenceId, OffenseObject> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Offense, appConfigPath, appConfig);
    }
};
