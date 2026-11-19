import { Definition, DefinitionKey } from "./app";

export type CaptureAllowedDefinition = {
  terrain: DefinitionKey;
};

export type CaptureDefinition = Definition & {
  allowed: CaptureAllowedDefinition[];
};
