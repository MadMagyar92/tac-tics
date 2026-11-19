import { MovementObject, TerrainObject, UnitObject } from "../object";
import { ActionPlan, ActionResult, UnitActionInput } from "./app";
import { MoveActionOutput } from "./move";

export type MultiMoveActionInput = UnitActionInput & {
  targets: TerrainObject[];
};

export type MultiMoveActionPlan = ActionPlan & {
  unit: UnitObject;
  targets: TerrainObject[];
  movement: MovementObject;
  others: UnitObject[];
  costs: number[];
};

export type MultiMoveActionResult = ActionResult & {
  unit: UnitObject;
  movement: MovementObject;
  interrupted: boolean;
  transport: UnitObject | undefined;
};

export type MultiMoveActionOutput = MoveActionOutput & MultiMoveActionResult;
