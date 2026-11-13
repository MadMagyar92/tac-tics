import express from "express";
import {
  AttackActionService,
  CaptureActionService,
  DefinitionServiceImpl,
  DeployActionService,
  EndTurnActionService,
  MoveActionService,
  MultiMoveActionService,
  ObjectServiceImpl,
} from "@tac-tics/app";
import { attackRouter, captureRouter, deployRouter, endTurnRouter, gameRouter, moveRouter, playerRouter, terrainRouter, unitRouter } from "./router";

export type AppOptions = {
  appConfigPath: string;
};

export function createApp({ appConfigPath }: AppOptions) {
  const app = express();
  const definitionService = new DefinitionServiceImpl(appConfigPath);
  const objectService = new ObjectServiceImpl(appConfigPath);
  const attackService = new AttackActionService(definitionService, objectService);
  const captureService = new CaptureActionService(definitionService, objectService);
  const deployService = new DeployActionService(definitionService, objectService);
  const endTurnService = new EndTurnActionService(objectService);
  const moveService = new MultiMoveActionService(new MoveActionService(definitionService, objectService), definitionService, objectService);

  app.use("/game", gameRouter(objectService));
  app.use("/game/:gameId/deploy", deployRouter(deployService, objectService));
  app.use("/game/:gameId/end-turn", endTurnRouter(endTurnService));
  app.use("/game/:gameId/player", playerRouter(objectService));
  app.use("/game/:gameId/terrain", terrainRouter(objectService));
  app.use("/game/:gameId/unit", unitRouter(objectService));
  app.use("/game/:gameId/unit/:unitId/attack", attackRouter(attackService, objectService));
  app.use("/game/:gameId/unit/:unitId/capture", captureRouter(captureService, objectService));
  app.use("/game/:gameId/unit/:unitId/move", moveRouter(moveService, objectService));

  return app;
}
