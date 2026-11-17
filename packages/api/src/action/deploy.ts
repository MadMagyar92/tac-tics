import { DefinitionKey } from "../definition";
import { MovementObject, OffenseObject, PlayerObject, UnitObject } from "../object";
import { ActionOutput, ActionPlan, ActionResult, TerrainActionInput } from "./app";

export type DeployActionInput = TerrainActionInput & {
  target: DefinitionKey;
};

export type DeployActionPlan = ActionPlan & {
  player: PlayerObject;
  unit: UnitObject;
  movement: MovementObject;
  offenses: OffenseObject[];
  cost: number;
};

export type DeployActionResult = ActionResult & {
  player: PlayerObject;
  unit: UnitObject;
  movement: MovementObject;
  offenses: OffenseObject[];
};

export type DeployActionOutput = ActionOutput & DeployActionResult;
