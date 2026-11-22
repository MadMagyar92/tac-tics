import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ActionService, EndTurnActionInput, EndTurnActionOutput, EndTurnActionPlan, EndTurnActionResult, GameObject } from "@tac-tics/api";
import { END_TURN_ACTION } from "@tac-tics/app";
import { createStubActionService } from "../../../test/config";
import { endTurnRouter } from "../game";

const game = (id = "g1"): GameObject => ({
  identifier: { id },
  definition: { scope: "game", name: "2-player" },
  turn: 0,
  playerTurn: 0,
  mapId: "m1",
});

/** Stands in for `gameRouter`: it loads `res.locals.game` from the path, then hands over to the end-turn router. */
function createApp(endTurnService: ActionService<EndTurnActionInput, EndTurnActionPlan, EndTurnActionResult, EndTurnActionOutput>) {
  return express().use(
    "/game/:gameId/end-turn",
    (req, res, next) => {
      res.locals.game = game((req.params as Record<string, string>).gameId);
      next();
    },
    endTurnRouter(endTurnService),
  );
}

/** An end-turn service that accepts what `accepts` says, previews the game as it was, and always executes to turn 1 and player turn 1. It remembers every call. */
function createStubEndTurnService(accepts: () => boolean = () => true) {
  const previewed: EndTurnActionInput[] = [];
  const executed: EndTurnActionInput[] = [];
  const resultOf = ({ game }: EndTurnActionInput): EndTurnActionResult => ({ game, units: [] });
  const outputOf = ({ definition, game }: EndTurnActionInput): EndTurnActionOutput => ({ definition, game: { ...game, turn: 1, playerTurn: 1 }, units: [] });
  const service = createStubActionService<EndTurnActionInput, EndTurnActionPlan, EndTurnActionResult, EndTurnActionOutput>({
    canPlan: accepts,
    preview(actionInput) {
      previewed.push(actionInput);
      return resultOf(actionInput);
    },
    execute(actionInput) {
      executed.push(actionInput);
      return outputOf(actionInput);
    },
  });
  return { service, previewed, executed };
}

const path = "/game/g1/end-turn";

describe("endTurnRouter", () => {
  describe("GET /game/:gameId/end-turn", () => {
    it("previews the end of the turn of the request's game, gives its result, and executes nothing", async () => {
      const { service, previewed, executed } = createStubEndTurnService();

      const res = await request(createApp(service)).get(path);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ game: game(), units: [] });
      expect(previewed).toEqual([{ definition: END_TURN_ACTION, game: game() }]);
      expect(executed).toEqual([]);
    });

    it("returns 404 and previews nothing when plan does not accept the end of the turn", async () => {
      const { service, previewed } = createStubEndTurnService(() => false);

      const res = await request(createApp(service)).get(path);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "The turn of game g1 cannot be ended" });
      expect(previewed).toEqual([]);
    });
  });

  describe("POST /game/:gameId/end-turn", () => {
    it("executes the end of the turn of the request's game, and gives its output", async () => {
      const { service, previewed, executed } = createStubEndTurnService();

      const res = await request(createApp(service)).post(path);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ definition: END_TURN_ACTION, game: { ...game(), turn: 1, playerTurn: 1 }, units: [] });
      expect(executed).toEqual([{ definition: END_TURN_ACTION, game: game() }]);
      expect(previewed).toEqual([]);
    });

    it("returns 409 and executes nothing when plan does not accept the end of the turn", async () => {
      const { service, executed } = createStubEndTurnService(() => false);

      const res = await request(createApp(service)).post(path);

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "The turn of game g1 cannot be ended" });
      expect(executed).toEqual([]);
    });
  });
});
