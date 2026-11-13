import { DefinitionKey } from "../definition";
import { GameObject, TerrainObject, UnitObject } from "../object";

export type ActionInput = {
  definition: DefinitionKey;
};

export type ActionInstance<A extends ActionInput> = {
  input: A;
};

export type ActionOutput = {
  definition: DefinitionKey;
};

export interface ActionService<I extends ActionInput, O extends ActionOutput> {
  canExecute(input: I): boolean;
  preview(input: I): O | undefined;
  execute(input: I): O | undefined;
};

export type GameActionInput = ActionInput & {
  game: GameObject;
};

export type TerrainActionInput = GameActionInput & {
  terrain: TerrainObject;
};

export type UnitActionInput = GameActionInput & {
  unit: UnitObject;
};