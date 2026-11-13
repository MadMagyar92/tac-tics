import { Router, type Response } from "express";
import {
  type ActionService,
  type AttackActionInput,
  type AttackActionOutput,
  type MultiMoveActionInput,
  type MultiMoveActionOutput,
  type ObjectService,
  Scope,
  type TerrainObject,
  type UnitObject,
} from "@tac-tics/api";
import { ATTACK_ACTION, MOVE_ACTION } from "@tac-tics/app";

/**
 * Mount this router before any router under `/game/:gameId/unit/:unitId/...`: it loads the unit into
 * `res.locals.unit` (or responds 404) and then passes the request on.
 */
export function unitRouter(objectService: ObjectService): Router {
  const router = Router({ mergeParams: true });

  router.param("unitId", (req, res, next, unitId: string) => {
    const { gameId } = req.params as unknown as { gameId: string };
    const unit = objectService.load<UnitObject>(Scope.Unit, { id: unitId, gameId });
    if (!unit) {
      res.status(404).json({ error: `Unit ${unitId} not found in game ${gameId}` });
      return;
    }
    res.locals.unit = unit;
    next();
  });

  router.get<{ gameId: string }>("/", (req, res) => {
    const { gameId } = req.params;
    res.json([...objectService.loadAll<UnitObject>(Scope.Unit).values()].filter((unit) => unit.identifier.gameId === gameId));
  });

  router.use("/:unitId", (_req, _res, next) => next());

  router.get("/:unitId", (_req, res) => {
    res.json(res.locals.unit);
  });

  return router;
}

/**
 * Mount this router under `/game/:gameId/unit/:unitId/attack`, after the routers that load `res.locals.game` and
 * `res.locals.unit`. It loads the target of `/:targetId` into `res.locals.target`.
 *
 * - `GET /` lists the attacks the unit can carry out: one for each other unit in the game that `canExecute` accepts.
 * - `GET /:targetId` returns the attack on that target, if it can be carried out. It changes nothing.
 * - `POST /:targetId` carries the attack out and returns its output. The attack service saves, or deletes, what it changes.
 */
export function attackRouter(
  attackService: ActionService<AttackActionInput, AttackActionOutput>,
  objectService: ObjectService,
): Router {
  const router = Router({ mergeParams: true });

  const attackOf = (res: Response): AttackActionInput | undefined => {
    const { game, unit, target } = res.locals;
    const input: AttackActionInput = { definition: ATTACK_ACTION, game, unit, target };
    return attackService.canExecute(input) ? input : undefined;
  };

  router.param("targetId", (req, res, next, targetId: string) => {
    const { gameId } = req.params as unknown as { gameId: string };
    const target = objectService.load<UnitObject>(Scope.Unit, { id: targetId, gameId });
    if (!target) {
      res.status(404).json({ error: `Unit ${targetId} not found in game ${gameId}` });
      return;
    }
    res.locals.target = target;
    next();
  });

  router.get("/", (_req, res) => {
    const { game, unit } = res.locals;
    const actions = [...objectService.loadAll<UnitObject>(Scope.Unit).values()]
      .filter((other) => other.identifier.gameId === game.identifier.id && other.identifier.id !== unit.identifier.id)
      .map((target): AttackActionInput => ({ definition: ATTACK_ACTION, game, unit, target }))
      .filter((input) => attackService.canExecute(input));
    res.json(actions);
  });

  router.get<{ gameId: string; unitId: string; targetId: string }>("/:targetId", (req, res) => {
    const input = attackOf(res);
    if (!input) {
      res.status(404).json({ error: `Unit ${req.params.targetId} cannot be attacked by unit ${req.params.unitId}` });
      return;
    }
    res.json(input);
  });

  router.post<{ gameId: string; unitId: string; targetId: string }>("/:targetId", (req, res) => {
    const input = attackOf(res);
    if (!input) {
      res.status(409).json({ error: `Unit ${req.params.targetId} cannot be attacked by unit ${req.params.unitId}` });
      return;
    }
    res.json(attackService.execute(input));
  });

  return router;
}

/**
 * Mount this router under `/game/:gameId/unit/:unitId/move`, after the routers that load `res.locals.game` and
 * `res.locals.unit`. It loads the terrain of `/:terrainId` into `res.locals.terrain`.
 *
 * - `GET /` lists the moves the unit can make: one for each terrain in the game that `canExecute` accepts.
 * - `GET /:terrainId` previews the move onto that terrain, if it can be made. It changes nothing.
 * - `POST /:terrainId` makes the move and returns its output. The move service saves what it changes.
 */
export function moveRouter(
  moveService: ActionService<MultiMoveActionInput, MultiMoveActionOutput>,
  objectService: ObjectService,
): Router {
  const router = Router({ mergeParams: true });

  function getMoveFromRequest(res: Response): MultiMoveActionInput {
    const { game, unit, terrain } = res.locals;
    return { definition: MOVE_ACTION, game, unit, path: [terrain] };
  }

  router.param("terrainId", (req, res, next, terrainId: string) => {
    const { gameId } = req.params as unknown as { gameId: string };
    const terrain = objectService.load<TerrainObject>(Scope.Terrain, { id: terrainId, gameId });
    if (!terrain) {
      res.status(404).json({ error: `Terrain ${terrainId} not found in game ${gameId}` });
      return;
    }
    res.locals.terrain = terrain;
    next();
  });

  router.get("/", (_req, res) => {
    const { game, unit } = res.locals;
    const moves = [...objectService.loadAll<TerrainObject>(Scope.Terrain).values()]
      .filter((terrain) => terrain.identifier.gameId === game.identifier.id)
      .map((terrain): MultiMoveActionInput => ({ definition: MOVE_ACTION, game, unit, path: [terrain] }))
      .filter((move) => moveService.canExecute(move));
    res.json(moves);
  });

  router.get<{ gameId: string; unitId: string; terrainId: string }>("/:terrainId", (req, res) => {
    const move = getMoveFromRequest(res);
    if (!moveService.canExecute(move)) {
      res.status(404).json({ error: `Unit ${req.params.unitId} cannot move onto terrain ${req.params.terrainId}` });
      return;
    }
    res.json(moveService.preview(move));
  });

  router.post<{ gameId: string; unitId: string; terrainId: string }>("/:terrainId", (req, res) => {
    const move = getMoveFromRequest(res);
    if (!moveService.canExecute(move)) {
      res.status(409).json({ error: `Unit ${req.params.unitId} cannot move onto terrain ${req.params.terrainId}` });
      return;
    }
    res.json(moveService.execute(move));
  });

  return router;
}
