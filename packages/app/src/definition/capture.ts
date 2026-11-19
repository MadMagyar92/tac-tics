import { type AppConfig, type CaptureDefinition, Scope } from "@tac-tics/api";
import { MemoryDefinitionHandler } from "./app";

export class CaptureDefinitionHandler extends MemoryDefinitionHandler<CaptureDefinition> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Capture, appConfigPath, appConfig);
    }
};
