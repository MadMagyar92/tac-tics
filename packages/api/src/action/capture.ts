import { OutpostObject, UnitObject } from "../object";
import { ActionOutput, ActionPlan, ActionResult, UnitActionInput } from "./app";

export type CaptureActionInput = UnitActionInput & {
  target: OutpostObject;
};

export type CaptureActionPlan = ActionPlan & {
  unit: UnitObject;
  target: OutpostObject;
  amount: number;
};

export type CaptureActionResult = ActionResult & {
  unit: UnitObject;
  target: OutpostObject;
};

export type CaptureActionOutput = ActionOutput & CaptureActionResult;
