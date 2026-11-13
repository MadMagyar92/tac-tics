import { Definition, DefinitionKey } from "./app";

export type MapDefinition = Definition & {
    size: { x: number, y: number };
    defaultTerrain: DefinitionKey;
};
