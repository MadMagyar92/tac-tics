import { UiBaseObject } from "./app";
import { GameReferenceId } from "./game";

export type UnitReferenceId = GameReferenceId & {
  unitId: string;
};

export type UnitObject = UiBaseObject<GameReferenceId> & {
  moved: boolean;
  acted: boolean;
  health: number;
  fuel: number;
  playerId: string;
  offenseIds: string[];
};
