import { TerrainObject } from "../object";
import { UnitAction } from "./app";

export type MoveAction = UnitAction & {
  target: TerrainObject;
};