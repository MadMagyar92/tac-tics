import { BaseObject } from "./app";
import { UnitReferenceId } from "./unit";

export type MovementObject = BaseObject<UnitReferenceId> & {
  fuel: number;
};
