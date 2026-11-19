import { Definition, DefinitionKey } from "./app";

export type TransportAllowedDefinition = {
  unit: DefinitionKey;
};

export type TransportDefinition = Definition & {
  maxUnits: number;
  allowed: TransportAllowedDefinition[];
};
