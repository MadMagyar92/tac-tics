import { DefinitionKey } from "../definition";
import { GameObject, TerrainObject, UnitObject } from "../object";

export type Action = {
  definition: DefinitionKey;
};

export type ActionInstance = Action & {

};

export interface ActionService<A extends Action> {
  canExecute(action: A): boolean;
  preview(action: A): A;
  execute(action: A): A;
};

export type GameAction = Action & {
  game: GameObject;
};

export type TerrainAction = GameAction & {
  terrain: TerrainObject;
};

export type UnitAction = GameAction & {
  unit: UnitObject;
};