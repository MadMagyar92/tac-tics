import { MovementObject, TerrainObject, UnitObject } from "../object";
import { ActionOutput, ActionPlan, ActionResult, UnitActionInput } from "./app";

export type MoveActionInput = UnitActionInput & {
  target: TerrainObject;
};

export type MoveActionPlan = ActionPlan & {
  unit: UnitObject;
  target: TerrainObject;
  movement: MovementObject;
  other: UnitObject | undefined;
  cost: number;
};

export type MoveActionResult = ActionResult & {
  unit: UnitObject;
  movement: MovementObject;
  interrupted: boolean;
};

export type MoveActionOutput = ActionOutput & MoveActionResult;
