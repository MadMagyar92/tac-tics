import { type AppConfig, type Id, type MapObject, Scope } from "@tac-tics/api";
import { MemoryObjectHandler } from "./app";

export class MapObjectHandler extends MemoryObjectHandler<Id, MapObject> {
    constructor(appConfigPath: string, appConfig: AppConfig) {
        super(Scope.Map, appConfigPath, appConfig);
    }
};
