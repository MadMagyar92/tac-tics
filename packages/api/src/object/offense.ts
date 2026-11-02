import { BaseObject } from "./app";
import { UnitReferenceId } from "./unit";

export type OffenseObject = BaseObject<UnitReferenceId> & {
  ammo: number;
};
