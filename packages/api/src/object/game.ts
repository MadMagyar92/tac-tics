import { BaseObject, Id } from "./app";

export type GameReferenceId = Id & {
  gameId: string;
};

export type GameObject = BaseObject<Id> & {
  turn: number;
  playerTurn: number;
  mapId: string;
};
