import { type AppConfig, Scope, type TransportDefinition } from "@tac-tics/api";
import { MemoryDefinitionHandler } from "./app";

export class TransportDefinitionHandler extends MemoryDefinitionHandler<TransportDefinition> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Transport, appConfigPath, appConfig);
    }
};
