import { Router, type Response } from "express";
import {
  type ActionService,
  type AttackActionInput,
  type AttackActionOutput,
  type AttackActionPlan,
  type AttackActionResult,
  type CaptureActionInput,
  type CaptureActionOutput,
  type CaptureActionPlan,
  type CaptureActionResult,
  type MultiMoveActionInput,
  type MultiMoveActionOutput,
  type MultiMoveActionPlan,
  type MultiMoveActionResult,
  type ObjectService,
  type OutpostObject,
  Scope,
  type UnitObject,
  type UnloadActionInput,
  type UnloadActionOutput,
  type UnloadActionPlan,
  type UnloadActionResult,
} from "@tac-tics/api";
import { ATTACK_ACTION, CAPTURE_ACTION, MOVE_ACTION, UNLOAD_ACTION } from "@tac-tics/app";
import { loadAllTerrainFromGame, loadTerrainFromGame } from "./terrain";

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
 * - `GET /` lists the attacks the unit can carry out: one for each other unit in the game that the service can plan.
 * - `GET /:targetId` returns the attack on that target, if it can be carried out. It changes nothing.
 * - `POST /:targetId` carries the attack out and returns its output. The attack service saves, or deletes, what it changes.
 */
export function attackRouter(
  attackService: ActionService<AttackActionInput, AttackActionPlan, AttackActionResult, AttackActionOutput>,
  objectService: ObjectService,
): Router {
  const router = Router({ mergeParams: true });

  const getAttackFromRequest = (res: Response): AttackActionInput => {
    const { game, unit, target } = res.locals;
    return { definition: ATTACK_ACTION, game, unit, target };
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
      .filter((input) => attackService.plan(input) !== undefined);
    res.json(actions);
  });

  router.get<{ gameId: string; unitId: string; targetId: string }>("/:targetId", (req, res) => {
    const attack = getAttackFromRequest(res);
    if (attackService.plan(attack) === undefined) {
      res.status(404).json({ error: `Unit ${req.params.targetId} cannot be attacked by unit ${req.params.unitId}` });
      return;
    }
    res.json(attack);
  });

  router.post<{ gameId: string; unitId: string; targetId: string }>("/:targetId", (req, res) => {
    const attack = attackService.plan(getAttackFromRequest(res));
    if (!attack) {
      res.status(409).json({ error: `Unit ${req.params.targetId} cannot be attacked by unit ${req.params.unitId}` });
      return;
    }
    res.json(attackService.execute(attack));
  });

  return router;
}

/**
 * Mount this router under `/game/:gameId/unit/:unitId/move`, after the routers that load `res.locals.game` and
 * `res.locals.unit`. It loads the terrain of `/:terrainId` into `res.locals.terrain`. A move onto an ally carrier loads the unit into it.
 *
 * - `GET /` lists the moves the unit can make: one for each terrain in the game that the service can plan.
 * - `GET /:terrainId` previews the move onto that terrain, if it can be made, and returns the objects it would change. It changes nothing.
 * - `POST /:terrainId` makes the move and returns its output. The move service saves what it changes.
 */
export function moveRouter(
  moveService: ActionService<MultiMoveActionInput, MultiMoveActionPlan, MultiMoveActionResult, MultiMoveActionOutput>,
  objectService: ObjectService,
): Router {
  const router = Router({ mergeParams: true });

  function getMoveFromRequest(res: Response) {
    const { game, unit, terrain } = res.locals;
    return moveService.plan({ definition: MOVE_ACTION, game, unit, targets: [terrain] });
  }

  router.param("terrainId", (req, res, next, terrainId: string) => {
    const { gameId } = req.params as unknown as { gameId: string };
    const terrain = loadTerrainFromGame(objectService, gameId, terrainId);
    if (!terrain) {
      res.status(404).json({ error: `Terrain ${terrainId} not found in game ${gameId}` });
      return;
    }
    res.locals.terrain = terrain;
    next();
  });

  router.get("/", (_req, res) => {
    const { game, unit } = res.locals;
    const moves = loadAllTerrainFromGame(objectService, game.identifier.id)
      .map((terrain): MultiMoveActionInput => ({ definition: MOVE_ACTION, game, unit, targets: [terrain] }))
      .filter((move) => moveService.plan(move) !== undefined);
    res.json(moves);
  });

  router.get<{ gameId: string; unitId: string; terrainId: string }>("/:terrainId", (req, res) => {
    const move = getMoveFromRequest(res);
    if (!move) {
      res.status(404).json({ error: `Unit ${req.params.unitId} cannot move onto terrain ${req.params.terrainId}` });
      return;
    }
    res.json(moveService.preview(move));
  });

  router.post<{ gameId: string; unitId: string; terrainId: string }>("/:terrainId", (req, res) => {
    const move = getMoveFromRequest(res);
    if (!move) {
      res.status(409).json({ error: `Unit ${req.params.unitId} cannot move onto terrain ${req.params.terrainId}` });
      return;
    }
    res.json(moveService.execute(move));
  });

  return router;
}

/**
 * Mount this router under `/game/:gameId/unit/:unitId/capture`, after the routers that load `res.locals.game` and
 * `res.locals.unit`. The target of the capture is the outpost of the game under the unit.
 *
 * - `GET /` previews the capture, if it can be made, and returns the objects it would change. It changes nothing.
 * - `POST /` makes the capture and returns its output. The capture service saves what it changes.
 */
export function captureRouter(
  captureService: ActionService<CaptureActionInput, CaptureActionPlan, CaptureActionResult, CaptureActionOutput>,
  objectService: ObjectService,
): Router {
  const router = Router({ mergeParams: true });

  function getCaptureFromRequest(res: Response) {
    const { game, unit } = res.locals;
    const target = [...objectService.loadAll<OutpostObject>(Scope.Outpost).values()].find(
      (outpost) =>
        outpost.identifier.gameId === game.identifier.id &&
        outpost.position.x === unit.position.x &&
        outpost.position.y === unit.position.y,
    );
    return target && captureService.plan({ definition: CAPTURE_ACTION, game, unit, target });
  }

  router.get<{ gameId: string; unitId: string }>("/", (req, res) => {
    const capture = getCaptureFromRequest(res);
    if (!capture) {
      res.status(404).json({ error: `Unit ${req.params.unitId} cannot capture the terrain it is on` });
      return;
    }
    res.json(captureService.preview(capture));
  });

  router.post<{ gameId: string; unitId: string }>("/", (req, res) => {
    const capture = getCaptureFromRequest(res);
    if (!capture) {
      res.status(409).json({ error: `Unit ${req.params.unitId} cannot capture the terrain it is on` });
      return;
    }
    res.json(captureService.execute(capture));
  });

  return router;
}

/**
 * Mount this router under `/game/:gameId/unit/:unitId/unload`, after the routers that load `res.locals.game` and
 * `res.locals.unit`, the carrier. It loads the unit of `/:targetId` into `res.locals.target`, and the terrain of `/:terrainId` into `res.locals.terrain`.
 *
 * - `GET /` lists the unloads the carrier can make: one for each unit it transports and each terrain in the game that the service can plan.
 * - `GET /:targetId/:terrainId` previews unloading that unit onto that terrain, if it can be done, and returns the objects it would change. It changes nothing.
 * - `POST /:targetId/:terrainId` unloads the unit and returns its output. The unload service saves what it changes.
 */
export function unloadRouter(
  unloadService: ActionService<UnloadActionInput, UnloadActionPlan, UnloadActionResult, UnloadActionOutput>,
  objectService: ObjectService,
): Router {
  const router = Router({ mergeParams: true });

  function getUnloadFromRequest(res: Response) {
    const { game, unit, target, terrain } = res.locals;
    return unloadService.plan({ definition: UNLOAD_ACTION, game, unit, target, terrain });
  }

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

  router.param("terrainId", (req, res, next, terrainId: string) => {
    const { gameId } = req.params as unknown as { gameId: string };
    const terrain = loadTerrainFromGame(objectService, gameId, terrainId);
    if (!terrain) {
      res.status(404).json({ error: `Terrain ${terrainId} not found in game ${gameId}` });
      return;
    }
    res.locals.terrain = terrain;
    next();
  });

  router.get("/", (_req, res) => {
    const { game, unit } = res.locals;
    const targets = [...objectService.loadAll<UnitObject>(Scope.Unit).values()].filter(
      (target) => target.identifier.gameId === game.identifier.id && unit.transportIds.includes(target.identifier.id),
    );
    const terrains = loadAllTerrainFromGame(objectService, game.identifier.id);
    const unloads = targets
      .flatMap((target) => terrains.map((terrain): UnloadActionInput => ({ definition: UNLOAD_ACTION, game, unit, target, terrain })))
      .filter((unload) => unloadService.plan(unload) !== undefined);
    res.json(unloads);
  });

  router.get<{ gameId: string; unitId: string; targetId: string; terrainId: string }>("/:targetId/:terrainId", (req, res) => {
    const unload = getUnloadFromRequest(res);
    if (!unload) {
      res.status(404).json({ error: `Unit ${req.params.targetId} cannot be unloaded by unit ${req.params.unitId} onto terrain ${req.params.terrainId}` });
      return;
    }
    res.json(unloadService.preview(unload));
  });

  router.post<{ gameId: string; unitId: string; targetId: string; terrainId: string }>("/:targetId/:terrainId", (req, res) => {
    const unload = getUnloadFromRequest(res);
    if (!unload) {
      res.status(409).json({ error: `Unit ${req.params.targetId} cannot be unloaded by unit ${req.params.unitId} onto terrain ${req.params.terrainId}` });
      return;
    }
    res.json(unloadService.execute(unload));
  });

  return router;
}
