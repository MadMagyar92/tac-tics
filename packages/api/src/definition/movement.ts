import { Definition, DefinitionKey } from "./app";

export type MovementCostDefinition = {
  terrain: DefinitionKey;
  cost: number;
};

export type MovementDefinition = Definition & {
  cost: MovementCostDefinition[];
};
