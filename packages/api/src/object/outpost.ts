import { UiBaseObject } from "./app";
import { GameReferenceId } from "./game";

export type OutpostObject = UiBaseObject<GameReferenceId> & {
  health: number;
  playerId: string | undefined;
};
