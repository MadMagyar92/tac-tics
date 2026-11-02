import { AppConfigService } from "../config";

export type DefinitionKey = {
  scope: string;
  name: string;
};

export type Definition = {
    definition: DefinitionKey;
};

export interface DefinitionHandler<D extends Definition> extends AppConfigService<DefinitionKey, D> {
    accept(key: DefinitionKey): boolean;
    get(key: DefinitionKey): D | undefined;
};

export interface DefinitionService {
    get<D extends Definition>(key: DefinitionKey): D | undefined;
};
