import { Definition, DefinitionKey } from "./app";

export type OffenseDamageDefinition = {
    unit: DefinitionKey;
    damage: number;
};

export type OffenseDefinition = Definition & {
    ammoMax: number;
    rangeMin: number;
    rangeMax: number;
    damage: OffenseDamageDefinition[];
};
