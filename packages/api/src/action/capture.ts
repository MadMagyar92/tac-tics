import { CaptureObject, UnitObject } from "../object";
import { ActionOutput, ActionPlan, ActionResult, UnitActionInput } from "./app";

export type CaptureActionInput = UnitActionInput & {
  target: CaptureObject;
};

export type CaptureActionPlan = ActionPlan & {
  unit: UnitObject;
  target: CaptureObject;
  amount: number;
};

export type CaptureActionResult = ActionResult & {
  unit: UnitObject;
  target: CaptureObject;
};

export type CaptureActionOutput = ActionOutput & CaptureActionResult;
