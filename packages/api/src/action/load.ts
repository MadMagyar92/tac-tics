import { UnitObject } from "../object";
import { ActionOutput, ActionPlan, ActionResult, UnitActionInput } from "./app";

export type LoadActionInput = UnitActionInput & {
    target: UnitObject;
};

export type LoadActionPlan = ActionPlan & {
  unit: UnitObject;
  target: UnitObject;
};

export type LoadActionResult = ActionResult & {
  unit: UnitObject;
  target: UnitObject;
};

export type LoadActionOutput = ActionOutput & LoadActionResult;
