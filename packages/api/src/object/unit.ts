import { UiBaseObject } from "./app";
import { GameReferenceId } from "./game";

export type UnitReferenceId = GameReferenceId & {
  unitId: string;
};

export type UnitObject = UiBaseObject<GameReferenceId> & {
  moved: boolean;
  acted: boolean;
  health: number;
  playerId: string;
  movementId: string;
  offenseIds: string[];
  transportIds: string[];
};
