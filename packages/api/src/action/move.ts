import { Position, TerrainObject } from "../object";
import { ActionInstance, ActionOutput, UnitActionInput } from "./app";

export type MoveActionInput = UnitActionInput & {
  target: TerrainObject;
};

export type MoveActionOutput = ActionOutput & {
  cost: number;
  terrainId: string;
};

export type MoveInstance = ActionInstance<MoveActionInput> & {
  cost: number;
};

export type MultiMoveActionInput = UnitActionInput & {
  path: TerrainObject[];
};

export type MultiMoveActionOutput = MoveActionOutput;

export type MultiMoveInstance = ActionInstance<MultiMoveActionInput> & {
  start: TerrainObject;
  steps: MoveInstance[];
  enemyPositions: Position[];
};