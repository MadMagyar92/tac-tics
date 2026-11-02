import { UnitObject } from "../object";
import { UnitAction } from "./app";

export type AttackAction = UnitAction & {
  target: UnitObject;
};