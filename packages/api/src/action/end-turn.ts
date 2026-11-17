import { GameObject, PlayerObject, UnitObject } from "../object";
import { ActionOutput, ActionPlan, ActionResult, GameActionInput } from "./app";

export type EndTurnActionInput = GameActionInput;

export type EndTurnActionPlan = ActionPlan & {
  game: GameObject;
  players: PlayerObject[];
  units: UnitObject[];
};

export type EndTurnActionResult = ActionResult & {
  game: GameObject;
  units: UnitObject[];
};

export type EndTurnActionOutput = ActionOutput & EndTurnActionResult;
