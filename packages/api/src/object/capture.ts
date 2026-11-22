import { UiBaseObject } from "./app";
import { GameReferenceId } from "./game";

export type CaptureObject = UiBaseObject<GameReferenceId> & {
  health: number;
  playerId: string | undefined;
};
