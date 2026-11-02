import { Router, json } from "express";
import { type ObjectService, type PlayerObject, Scope } from "@tac-tics/api";

export function playerRouter(objectService: ObjectService): Router {
  const router = Router({ mergeParams: true });
  router.use(json());

  router.get<{ gameId: string }>("/", (req, res) => {
    const { gameId } = req.params;
    res.json([...objectService.loadAll<PlayerObject>(Scope.Player).values()].filter((player) => player.identifier.gameId === gameId));
  });

  router.get<{ gameId: string; id: string }>("/:id", (req, res) => {
    const { gameId, id } = req.params;
    const player = objectService.load<PlayerObject>(Scope.Player, { id, gameId });
    if (!player) {
      res.status(404).json({ error: `Player ${id} not found in game ${gameId}` });
      return;
    }
    res.json(player);
  });

  return router;
}
