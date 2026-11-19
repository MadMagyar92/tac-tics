import { TerrainObject, UnitObject } from "../object";
import { ActionOutput, ActionPlan, ActionResult, UnitActionInput } from "./app";

export type UnloadActionInput = UnitActionInput & {
  target: UnitObject;
  terrain: TerrainObject;
};

export type UnloadActionPlan = ActionPlan & {
  unit: UnitObject;
  target: UnitObject;
  terrain: TerrainObject;
};

export type UnloadActionResult = ActionResult & {
  unit: UnitObject;
  target: UnitObject;
};

export type UnloadActionOutput = ActionOutput & UnloadActionResult;
