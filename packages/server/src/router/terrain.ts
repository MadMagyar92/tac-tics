import { Router, json } from "express";
import { type CaptureObject, type GameObject, type ObjectService, Scope, type TerrainObject } from "@tac-tics/api";

/**
 * Loads every square of the game of `gameId`: the static terrain of the map of the game, then the captures of the game.
 * It gives nothing for a game that does not exist, and only the captures of a game whose map has no static terrain.
 */
export function loadAllTerrainFromGame(objectService: ObjectService, gameId: string): (TerrainObject | CaptureObject)[] {
  const game = objectService.load<GameObject>(Scope.Game, { id: gameId });
  if (!game) {
    return [];
  }
  return [
    ...[...objectService.loadAll<TerrainObject>(Scope.Terrain).values()].filter(({ identifier }) => identifier.mapId === game.mapId),
    ...[...objectService.loadAll<CaptureObject>(Scope.Capture).values()].filter(({ identifier }) => identifier.gameId === gameId),
  ];
}

/**
 * Loads the square of `id` of the game of `gameId`, from the static terrain of the map of the game, or else from the captures of the game.
 * It gives nothing for a game that does not exist, or an id that neither holds.
 */
export function loadTerrainFromGame(objectService: ObjectService, gameId: string, id: string): TerrainObject | CaptureObject | undefined {
  const game = objectService.load<GameObject>(Scope.Game, { id: gameId });
  return game && (objectService.load<TerrainObject>(Scope.Terrain, { id, mapId: game.mapId }) ?? objectService.load<CaptureObject>(Scope.Capture, { id, gameId }));
}

export function terrainRouter(objectService: ObjectService): Router {
  const router = Router({ mergeParams: true });
  router.use(json());

  router.get<{ gameId: string }>("/", (req, res) => {
    res.json(loadAllTerrainFromGame(objectService, req.params.gameId));
  });

  router.get<{ gameId: string; id: string }>("/:id", (req, res) => {
    const { gameId, id } = req.params;
    const terrain = loadTerrainFromGame(objectService, gameId, id);
    if (!terrain) {
      res.status(404).json({ error: `Terrain ${id} not found in game ${gameId}` });
      return;
    }
    res.json(terrain);
  });

  return router;
}
