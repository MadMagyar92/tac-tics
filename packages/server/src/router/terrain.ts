import { Router, json } from "express";
import { type ObjectService, Scope, type TerrainObject } from "@tac-tics/api";

export function terrainRouter(objectService: ObjectService): Router {
  const router = Router({ mergeParams: true });
  router.use(json());

  router.get<{ gameId: string }>("/", (req, res) => {
    const { gameId } = req.params;
    res.json([...objectService.loadAll<TerrainObject>(Scope.Terrain).values()].filter((terrain) => terrain.identifier.gameId === gameId));
  });

  router.get<{ gameId: string; id: string }>("/:id", (req, res) => {
    const { gameId, id } = req.params;
    const terrain = objectService.load<TerrainObject>(Scope.Terrain, { id, gameId });
    if (!terrain) {
      res.status(404).json({ error: `Terrain ${id} not found in game ${gameId}` });
      return;
    }
    res.json(terrain);
  });

  return router;
}
