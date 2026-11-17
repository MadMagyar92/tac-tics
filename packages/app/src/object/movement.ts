import { type AppConfig, type MovementObject, Scope, type UnitReferenceId } from "@tac-tics/api";
import { MemoryObjectHandler } from "./app";

export class MovementObjectHandler extends MemoryObjectHandler<UnitReferenceId, MovementObject> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Movement, appConfigPath, appConfig);
    }
};
