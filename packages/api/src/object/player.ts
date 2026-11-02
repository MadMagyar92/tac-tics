import { BaseObject } from "./app";
import { GameReferenceId } from "./game";

export type PlayerObject = BaseObject<GameReferenceId> & {
  order: number;
  funds: number;
};
