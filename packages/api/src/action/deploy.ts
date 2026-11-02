import { DefinitionKey } from "../definition";
import { PlayerObject, UnitObject } from "../object";
import { TerrainAction } from "./app";

export type DeployAction = TerrainAction & {
  player: PlayerObject;
  unitDefinition: DefinitionKey;
  unit?: UnitObject;
};
