import { TerrainObject } from "../object";
import { ActionInstance, ActionOutput, UnitActionInput } from "./app";

export type CaptureActionInput = UnitActionInput & {
  target: TerrainObject;
};

export type CaptureActionOutput = ActionOutput & {
  health: number;
  captured: boolean;
};

export type CaptureInstance = ActionInstance<CaptureActionInput> & {
  amount: number;
};
