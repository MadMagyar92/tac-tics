import express from "express";
import { AttackActionService, DefinitionServiceImpl, DeployActionService, MoveActionService, ObjectServiceImpl } from "@tac-tics/app";
import { attackRouter, deployRouter, gameRouter, moveRouter, playerRouter, terrainRouter, unitRouter } from "./router";

export type AppOptions = {
  appConfigPath: string;
};

export function createApp({ appConfigPath }: AppOptions) {
  const app = express();
  const definitionService = new DefinitionServiceImpl(appConfigPath);
  const objectService = new ObjectServiceImpl(appConfigPath);
  const attackService = new AttackActionService(definitionService, objectService);
  const deployService = new DeployActionService(definitionService, objectService);
  const moveService = new MoveActionService(definitionService, objectService);

  app.use("/game", gameRouter(objectService));
  app.use("/game/:gameId/deploy", deployRouter(deployService, objectService));
  app.use("/game/:gameId/player", playerRouter(objectService));
  app.use("/game/:gameId/unit", unitRouter(objectService));
  app.use("/game/:gameId/unit/:unitId/attack", attackRouter(attackService, objectService));
  app.use("/game/:gameId/unit/:unitId/move", moveRouter(moveService, objectService));
  app.use("/game/:gameId/terrain", terrainRouter(objectService));

  return app;
}
