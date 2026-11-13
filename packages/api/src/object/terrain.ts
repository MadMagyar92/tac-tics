import { UiBaseObject } from "./app";
import { GameReferenceId } from "./game";

export type TerrainReferenceId = GameReferenceId & {
  terrainId: string;
};

export type TerrainObject = UiBaseObject<GameReferenceId> & {
  health: number;
  playerId: string | undefined;
};
