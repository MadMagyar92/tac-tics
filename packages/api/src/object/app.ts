import { AppConfigService } from "../config";
import { DefinitionKey } from "../definition";

export type Id = {
  id: string;
};

export type BaseObject<I extends Id> = {
  identifier: I;
  definition: DefinitionKey;
};

export type Position = {
  x: number;
  y: number;
}

export type UiBaseObject<I extends Id>  = BaseObject<I> & {
  position: Position;
};

export interface ObjectHandler<I extends Id, O extends BaseObject<I>> extends AppConfigService<I, O> {
  accept(scope: string): boolean;
  saveAll(): Map<I, O>;
  save(object: O): I;
  load(identifier: I): O | undefined;
  delete(identifier: I): O | undefined;
};

export interface ObjectService {
  loadAll<O extends BaseObject<Id>>(scope: string): Map<O["identifier"], O>;
  save<O extends BaseObject<Id>>(scope: string, object: O): O["identifier"];
  load<O extends BaseObject<Id>>(scope: string, identifier: O["identifier"]): O | undefined;
  delete<O extends BaseObject<Id>>(scope: string, identifier: O["identifier"]): O | undefined;
};
