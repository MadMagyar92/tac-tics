import { type AppConfig, type GameObject, type Id, Scope } from "@tac-tics/api";
import { MemoryObjectHandler } from "./app";

export class GameObjectHandler extends MemoryObjectHandler<Id, GameObject> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Game, appConfigPath, appConfig);
    }
};
