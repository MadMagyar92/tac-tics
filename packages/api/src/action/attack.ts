import { OffenseObject, UnitObject } from "../object";
import { ActionOutput, ActionPlan, ActionResult, UnitActionInput } from "./app";

export type AttackActionInput = UnitActionInput & {
  target: UnitObject;
};

export type AttackActionPlan = ActionPlan & {
  unit: UnitObject;
  target: UnitObject;
  offense: OffenseObject;
  damage: number;
};

export type AttackActionResult = ActionResult & {
  unit: UnitObject;
  target: UnitObject;
  offense: OffenseObject;
};

export type AttackActionOutput = ActionOutput & AttackActionResult;
