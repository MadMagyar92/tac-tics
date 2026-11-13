import { PlayerObject, UnitObject } from "../object";
import { ActionInstance, ActionOutput, GameActionInput } from "./app";

export type EndTurnActionInput = GameActionInput;

export type EndTurnActionOutput = ActionOutput & {
  turn: number;
  playerTurn: number;
};

export type EndTurnInstance = ActionInstance<EndTurnActionInput> & {
  player: PlayerObject;
  units: UnitObject[];
};
