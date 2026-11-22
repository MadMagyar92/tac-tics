import { Definition, DefinitionKey } from "./app";

export type MapTerrainDefinition = {
    definition: DefinitionKey;
    positions: { x: number, y: number }[];
    player: DefinitionKey | undefined;
};

export type MapUnitDefinition = {
    definition: DefinitionKey;
    positions: { x: number, y: number }[];
    player: DefinitionKey;
};

export type MapDefinition = Definition & {
    size: { x: number, y: number };
    defaultTerrain: DefinitionKey;
    terrain: MapTerrainDefinition[];
    units: MapUnitDefinition[];
};
