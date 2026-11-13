import { Definition, DefinitionKey } from "./app";

export type UnitDefinition = Definition & {
    fundsCost: number;
    visionMax: number;
    fuelMax: number;
    moveMax: number;
    movement: DefinitionKey;
    offenses: DefinitionKey[];
    actions: DefinitionKey[];
};
