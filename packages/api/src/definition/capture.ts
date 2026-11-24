import { Definition, DefinitionKey } from "./app";

export type CaptureAllowedDefinition = {
  outpost: DefinitionKey;
};

export type CaptureDefinition = Definition & {
  allowed: CaptureAllowedDefinition[];
};
