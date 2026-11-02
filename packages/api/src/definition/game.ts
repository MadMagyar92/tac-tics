import { Definition } from "./app";

export type GameDefinition = Definition & {
    turnsMax: number;
    playersMax: number;
};
