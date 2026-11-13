import { OffenseDefinition } from "../definition";
import { OffenseObject, UnitObject } from "../object";
import { ActionInstance, ActionOutput, UnitActionInput } from "./app";

export type AttackActionInput = UnitActionInput & {
  target: UnitObject;
};

export type AttackActionOutput = ActionOutput & {
  damage: number;
  offenseId: string;
};

export type AttackInstance = ActionInstance<AttackActionInput> & {
  offense: OffenseObject;
  offenseDefinition: OffenseDefinition;
  damage: number;
};