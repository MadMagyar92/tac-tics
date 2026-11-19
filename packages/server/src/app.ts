import express from "express";
import {
  AttackActionService,
  CaptureActionService,
  DefinitionServiceImpl,
  DeployActionService,
  EndTurnActionService,
  LoadActionService,
  MoveActionService,
  MultiMoveActionService,
  ObjectServiceImpl,
  UnloadActionService,
} from "@tac-tics/app";
import { attackRouter, captureRouter, deployRouter, endTurnRouter, gameRouter, moveRouter, playerRouter, terrainRouter, unitRouter, unloadRouter } from "./router";

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
  const moveService = new MultiMoveActionService(
    new MoveActionService(definitionService, objectService),
    new LoadActionService(definitionService, objectService),
    definitionService,
    objectService,
  );
  const unloadService = new UnloadActionService(definitionService, objectService);

  app.use("/game", gameRouter(objectService));
  app.use("/game/:gameId/deploy", deployRouter(deployService, objectService));
  app.use("/game/:gameId/end-turn", endTurnRouter(endTurnService));
  app.use("/game/:gameId/player", playerRouter(objectService));
  app.use("/game/:gameId/terrain", terrainRouter(objectService));
  app.use("/game/:gameId/unit", unitRouter(objectService));
  app.use("/game/:gameId/unit/:unitId/attack", attackRouter(attackService, objectService));
  app.use("/game/:gameId/unit/:unitId/capture", captureRouter(captureService, objectService));
  app.use("/game/:gameId/unit/:unitId/move", moveRouter(moveService, objectService));
  app.use("/game/:gameId/unit/:unitId/unload", unloadRouter(unloadService, objectService));

  return app;
}
