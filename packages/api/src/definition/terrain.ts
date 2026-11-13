import { Definition } from "./app";

export type TerrainDefinition = Definition & {
    defense: number;
    capturable: boolean;
};
