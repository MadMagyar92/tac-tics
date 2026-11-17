import { Router, json, type Request, type Response } from "express";
import {
  type ActionService,
  type DeployActionInput,
  type DeployActionOutput,
  type DeployActionPlan,
  type DeployActionResult,
  type EndTurnActionInput,
  type EndTurnActionOutput,
  type EndTurnActionPlan,
  type EndTurnActionResult,
  type GameObject,
  type ObjectService,
  Scope,
  type TerrainObject,
  type UnitObject,
} from "@tac-tics/api";
import { DEPLOY_ACTION, END_TURN_ACTION, isNonEmptyString } from "@tac-tics/app";

/**
 * Mount this router before any router under `/game/:gameId/...`: it loads the game into
 * `res.locals.game` (or responds 404) and then passes the request on.
 */
export function gameRouter(objectService: ObjectService): Router {
  const router = Router();

  router.param("gameId", (_req, res, next, gameId: string) => {
    const game = objectService.load<GameObject>(Scope.Game, { id: gameId });
    if (!game) {
      res.status(404).json({ error: `Game ${gameId} not found` });
      return;
    }
    res.locals.game = game;
    next();
  });

  router.get("/", (_req, res) => {
    res.json([...objectService.loadAll<GameObject>(Scope.Game).values()]);
  });

  router.use("/:gameId", (_req, _res, next) => next());

  router.get("/:gameId", (_req, res) => {
    res.json(res.locals.game);
  });

  return router;
}

/**
 * Mount this router under `/game/:gameId/deploy`, after `gameRouter`. It loads the terrain of `/:terrainId` into
 * `res.locals.terrain`. The kind of unit is the `unit` of the JSON body, or of the query string for a `GET`; the deploy
 * service deploys it for the player whose turn it is.
 *
 * - `GET /:terrainId` previews the deploy of the unit on that terrain, if it can be done, and returns the objects it would change. It changes nothing.
 * - `POST /:terrainId` deploys the unit and returns the new unit, loaded by the id the deploy service gives. The deploy service saves what it changes.
 */
export function deployRouter(
  deployService: ActionService<DeployActionInput, DeployActionPlan, DeployActionResult, DeployActionOutput>,
  objectService: ObjectService,
): Router {
  const router = Router({ mergeParams: true });
  router.use(json());

  function getDeployFromRequest(req: Request, res: Response): DeployActionInput | undefined {
    const name = req.method === "GET" ? req.query.unit : req.body?.unit;
    if (!isNonEmptyString(name)) {
      res.status(400).json({ error: 'Expected the name of the unit to deploy as "unit"' });
      return undefined;
    }

    const { game, terrain } = res.locals;
    return { definition: DEPLOY_ACTION, game, terrain, target: { scope: Scope.Unit, name } };
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

  router.get<{ gameId: string; terrainId: string }>("/:terrainId", (req, res) => {
    const input = getDeployFromRequest(req, res);
    if (!input) {
      return;
    }
    const deploy = deployService.plan(input);
    if (!deploy) {
      res.status(404).json({ error: `Unit ${input.target.name} cannot be deployed on terrain ${req.params.terrainId}` });
      return;
    }
    res.json(deployService.preview(deploy));
  });

  router.post<{ gameId: string; terrainId: string }>("/:terrainId", (req, res) => {
    const input = getDeployFromRequest(req, res);
    if (!input) {
      return;
    }
    const deploy = deployService.plan(input);
    if (!deploy) {
      res.status(409).json({ error: `Unit ${input.target.name} cannot be deployed on terrain ${req.params.terrainId}` });
      return;
    }
    const output = deployService.execute(deploy);
    res.json(objectService.load<UnitObject>(Scope.Unit, { id: output.unit.identifier.id, gameId: input.game.identifier.id }));
  });

  return router;
}

/**
 * Mount this router under `/game/:gameId/end-turn`, after `gameRouter`. The end-turn service hands the turn to the
 * next player of the game.
 *
 * - `GET /` previews the end of the turn, if it can be done, and returns the objects it would change. It changes nothing.
 * - `POST /` ends the turn and returns its output. The end-turn service saves what it changes.
 */
export function endTurnRouter(endTurnService: ActionService<EndTurnActionInput, EndTurnActionPlan, EndTurnActionResult, EndTurnActionOutput>): Router {
  const router = Router({ mergeParams: true });

  const getEndTurnFromRequest = (res: Response) => endTurnService.plan({ definition: END_TURN_ACTION, game: res.locals.game });

  router.get<{ gameId: string }>("/", (req, res) => {
    const endTurn = getEndTurnFromRequest(res);
    if (!endTurn) {
      res.status(404).json({ error: `The turn of game ${req.params.gameId} cannot be ended` });
      return;
    }
    res.json(endTurnService.preview(endTurn));
  });

  router.post<{ gameId: string }>("/", (req, res) => {
    const endTurn = getEndTurnFromRequest(res);
    if (!endTurn) {
      res.status(409).json({ error: `The turn of game ${req.params.gameId} cannot be ended` });
      return;
    }
    res.json(endTurnService.execute(endTurn));
  });

  return router;
}
