import { TerrainObject, UnitObject } from "../object";
import { ActionOutput, ActionPlan, ActionResult, UnitActionInput } from "./app";

export type CaptureActionInput = UnitActionInput & {
  target: TerrainObject;
};

export type CaptureActionPlan = ActionPlan & {
  unit: UnitObject;
  target: TerrainObject;
  amount: number;
};

export type CaptureActionResult = ActionResult & {
  unit: UnitObject;
  target: TerrainObject;
};

export type CaptureActionOutput = ActionOutput & CaptureActionResult;
