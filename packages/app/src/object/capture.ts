import { type AppConfig, type CaptureObject, type GameReferenceId, Scope } from "@tac-tics/api";
import { MemoryObjectHandler } from "./app";

export class CaptureObjectHandler extends MemoryObjectHandler<GameReferenceId, CaptureObject> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Capture, appConfigPath, appConfig, Scope.Terrain);
    }
};
