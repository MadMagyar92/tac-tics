import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  type ActionService,
  type CaptureActionInput,
  type CaptureActionOutput,
  type CaptureActionPlan,
  type CaptureActionResult,
  type GameObject,
  type OutpostObject,
  Scope,
  type UnitObject,
} from "@tac-tics/api";
import { CAPTURE_ACTION, ObjectServiceImpl } from "@tac-tics/app";
import { createStubActionService, realAppConfig } from "../../../test/config";
import { captureRouter } from "../unit";

const game = (): GameObject => ({
  identifier: { id: "game-1" },
  definition: { scope: "game", name: "2-player" },
  turn: 0,
  playerTurn: 0,
  mapId: "map-1",
});

/** The unit on the city outpost-039 at (9, 2) of the repo's config. */
const unitAt = (x: number, y: number): UnitObject => ({
  identifier: { id: "capturer", gameId: "game-1" },
  definition: { scope: "unit", name: "infantry" },
  position: { x, y },
  moved: false,
  acted: false,
  health: 100,
  playerId: "player-1",
  movementId: "movement-1",
  offenseIds: [],
  transportIds: [],
});

/** Stands in for the routers mounted before the capture router: it loads `res.locals.game` and gives `unit` as `res.locals.unit`. */
function createApp(captureService: ActionService<CaptureActionInput, CaptureActionPlan, CaptureActionResult, CaptureActionOutput>, unit: UnitObject) {
  const objectService = new ObjectServiceImpl(realAppConfig);
  return {
    objectService,
    app: express().use(
      "/game/:gameId/unit/:unitId/capture",
      (_req, res, next) => {
        res.locals.game = game();
        res.locals.unit = unit;
        next();
      },
      captureRouter(captureService, objectService),
    ),
  };
}

/** A capture service that accepts what `accepts` says and always gives 10 health, not captured. It remembers every call. */
function createStubCaptureService(accepts: (actionInput: CaptureActionInput) => boolean = () => true) {
  const asked: CaptureActionInput[] = [];
  const previewed: CaptureActionInput[] = [];
  const executed: CaptureActionInput[] = [];
  const resultOf = ({ unit, target }: CaptureActionInput): CaptureActionResult => ({ unit, target });
  const outputOf = ({ definition, unit, target }: CaptureActionInput): CaptureActionOutput => ({ definition, unit, target: { ...target, health: 10 } });
  const service = createStubActionService<CaptureActionInput, CaptureActionPlan, CaptureActionResult, CaptureActionOutput>({
    canPlan(actionInput) {
      asked.push(actionInput);
      return accepts(actionInput);
    },
    preview(actionInput) {
      previewed.push(actionInput);
      return resultOf(actionInput);
    },
    execute(actionInput) {
      executed.push(actionInput);
      return outputOf(actionInput);
    },
  });
  return { service, asked, previewed, executed };
}

const path = "/game/game-1/unit/capturer/capture";

describe("captureRouter", () => {
  describe("GET /game/:gameId/unit/:unitId/capture", () => {
    it("previews the capture of the terrain under the unit, built from the request's game and unit, and gives its result", async () => {
      const unit = unitAt(9, 2);
      const { service, asked, previewed, executed } = createStubCaptureService();
      const { app, objectService } = createApp(service, unit);

      const res = await request(app).get(path);

      const target = objectService.load<OutpostObject>(Scope.Outpost, { id: "outpost-039", gameId: "game-1" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ unit, target });
      expect(asked).toEqual([{ definition: CAPTURE_ACTION, game: game(), unit, target }]);
      expect(previewed).toEqual(asked);
      expect(executed).toEqual([]);
    });

    it("returns 404 and previews nothing when plan does not accept the capture", async () => {
      const { service, previewed } = createStubCaptureService(() => false);
      const { app } = createApp(service, unitAt(9, 2));

      const res = await request(app).get(path);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Unit capturer cannot capture the terrain it is on" });
      expect(previewed).toEqual([]);
    });

    it("returns 404 without asking plan when the unit is on no terrain of the game", async () => {
      const { service, asked } = createStubCaptureService();
      const { app } = createApp(service, unitAt(99, 99));

      const res = await request(app).get(path);

      expect(res.status).toBe(404);
      expect(asked).toEqual([]);
    });
  });

  describe("POST /game/:gameId/unit/:unitId/capture", () => {
    it("executes the capture of the terrain under the unit, and gives its output", async () => {
      const unit = unitAt(9, 2);
      const { service, previewed, executed } = createStubCaptureService();
      const { app, objectService } = createApp(service, unit);

      const res = await request(app).post(path);

      const target = objectService.load<OutpostObject>(Scope.Outpost, { id: "outpost-039", gameId: "game-1" })!;
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ definition: CAPTURE_ACTION, unit, target: { ...target, health: 10 } });
      expect(executed).toEqual([{ definition: CAPTURE_ACTION, game: game(), unit, target }]);
      expect(previewed).toEqual([]);
    });

    it("returns 409 and executes nothing when plan does not accept the capture", async () => {
      const { service, executed } = createStubCaptureService(() => false);
      const { app } = createApp(service, unitAt(9, 2));

      const res = await request(app).post(path);

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Unit capturer cannot capture the terrain it is on" });
      expect(executed).toEqual([]);
    });
  });
});
