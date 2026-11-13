import { DefinitionKey, UnitDefinition } from "../definition";
import { OffenseObject, PlayerObject, UnitObject } from "../object";
import { ActionInstance, ActionOutput, TerrainActionInput } from "./app";

export type DeployActionInput = TerrainActionInput & {
  unitDefinition: DefinitionKey;
};

export type DeployActionOutput = ActionOutput & {
  unitId: string;
};

export type DeployInstance = ActionInstance<DeployActionInput> & {
  player: PlayerObject;
  unit: UnitObject;
  unitDefinition: UnitDefinition;
  offenses: OffenseObject[];
};
