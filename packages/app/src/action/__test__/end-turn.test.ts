import type { BaseObject, EndTurnActionInput, GameObject, Id, ObjectService, PlayerObject, UnitObject } from "@tac-tics/api";
import { describe, expect, it } from "vitest";
import { END_TURN_ACTION, EndTurnActionService } from "../end-turn";

/** An end-turn service on an object service that holds `players` and `units`, and remembers every save, in order. */
function createWorld(players: PlayerObject[], units: UnitObject[] = []) {
  const saves: string[] = [];
  const savedGames: GameObject[] = [];
  const savedUnits: UnitObject[] = [];
  const unexpected = (what: string): never => {
    throw new Error(`unexpected ${what}`);
  };
  const objectService: ObjectService = {
    loadAll<O extends BaseObject<Id>>(scope: string) {
      const objects: BaseObject<Id>[] = scope === "player" ? players : scope === "unit" ? units : unexpected(`loadAll in the scope "${scope}"`);
      return new Map(objects.map((object) => [object.identifier, object])) as unknown as Map<O["identifier"], O>;
    },
    load: () => unexpected("load"),
    delete: () => unexpected("delete"),
    save<O extends BaseObject<Id>>(scope: string, object: O) {
      saves.push(scope);
      if (scope === "game") {
        savedGames.push(object as unknown as GameObject);
      } else if (scope === "unit") {
        savedUnits.push(object as unknown as UnitObject);
      } else {
        unexpected(`save in the scope "${scope}"`);
      }
      return object.identifier;
    },
  };

  return { service: new EndTurnActionService(objectService), saves, savedGames, savedUnits };
}

const game = (turn: number, playerTurn: number, id = "g1"): GameObject => ({
  identifier: { id },
  definition: { scope: "game", name: "2-player" },
  turn,
  playerTurn,
  mapDefinition: { scope: "map", name: "m1" },
});

const player = (id: string, order: number, gameId = "g1"): PlayerObject => ({
  identifier: { id, gameId },
  definition: { scope: "player", name: "orange-star" },
  order,
  funds: 0,
});

const unit = (id: string, playerId: string, gameId = "g1"): UnitObject => ({
  identifier: { id, gameId },
  definition: { scope: "unit", name: "infantry" },
  position: { x: 0, y: 0 },
  moved: true,
  acted: true,
  health: 100,
  fuel: 99,
  playerId,
  offenseIds: [],
});

const twoPlayers = [player("p1", 0), player("p2", 1)];

const endTurn = (turn: number, playerTurn: number): EndTurnActionInput => ({ definition: END_TURN_ACTION, game: game(turn, playerTurn) });

describe("EndTurnActionService", () => {
  it("hands the turn to the player with the next order", () => {
    const { service, savedGames } = createWorld(twoPlayers);

    const output = service.execute(endTurn(3, 0));

    expect(output).toEqual({ definition: END_TURN_ACTION, turn: 3, playerTurn: 1 });
    expect(savedGames).toEqual([game(3, 1)]);
  });

  it("moves on to the next turn after the player with the last order, and starts again from the first", () => {
    const { service, savedGames } = createWorld(twoPlayers);

    const output = service.execute(endTurn(3, 1));

    expect(output).toEqual({ definition: END_TURN_ACTION, turn: 4, playerTurn: 0 });
    expect(savedGames).toEqual([game(4, 0)]);
  });

  it("goes by the orders of the players, not the order they are held in, skipping orders no player has", () => {
    const { service } = createWorld([player("p3", 5), player("p1", 0), player("p2", 2)]);

    expect(service.preview(endTurn(0, 0))).toMatchObject({ turn: 0, playerTurn: 2 });
    expect(service.preview(endTurn(0, 2))).toMatchObject({ turn: 0, playerTurn: 5 });
    expect(service.preview(endTurn(0, 5))).toMatchObject({ turn: 1, playerTurn: 0 });
  });

  it("hands the turn to the player with the next order when no player has the order of the turn", () => {
    const { service } = createWorld(twoPlayers);

    expect(service.preview(endTurn(0, -1))).toMatchObject({ turn: 0, playerTurn: 0 });
    expect(service.preview(endTurn(0, 7))).toMatchObject({ turn: 1, playerTurn: 0 });
  });

  it("moves on to the next turn every time with one player", () => {
    const { service } = createWorld([player("p1", 0)]);
    expect(service.preview(endTurn(0, 0))).toMatchObject({ turn: 1, playerTurn: 0 });
  });

  it("only looks at the players of the game", () => {
    const { service } = createWorld([...twoPlayers, player("elsewhere", 2, "g2")]);
    expect(service.preview(endTurn(0, 1))).toMatchObject({ turn: 1, playerTurn: 0 });
  });

  it("makes the units of the next player ready again: none of them has moved or acted", () => {
    const { service, savedUnits } = createWorld(twoPlayers, [unit("u1", "p2"), unit("u2", "p2")]);

    service.execute(endTurn(0, 0));

    expect(savedUnits).toEqual([
      { ...unit("u1", "p2"), moved: false, acted: false },
      { ...unit("u2", "p2"), moved: false, acted: false },
    ]);
  });

  it("leaves alone the units of the player whose turn ends, and the units of other games", () => {
    const { service, savedUnits } = createWorld(twoPlayers, [unit("mine", "p1"), unit("next", "p2"), unit("elsewhere", "p2", "g2")]);

    service.execute(endTurn(0, 0));

    expect(savedUnits.map((saved) => saved.identifier.id)).toEqual(["next"]);
  });

  it("saves the game, then the units", () => {
    const { service, saves } = createWorld(twoPlayers, [unit("u1", "p2"), unit("u2", "p2")]);
    service.execute(endTurn(0, 0));
    expect(saves).toEqual(["game", "unit", "unit"]);
  });

  it("previews what executing gives, and saves nothing", () => {
    const { service, saves } = createWorld(twoPlayers, [unit("u1", "p2")]);

    expect(service.preview(endTurn(0, 1))).toEqual({ definition: END_TURN_ACTION, turn: 1, playerTurn: 0 });
    expect(saves).toEqual([]);
  });

  it("refuses a game with no players, and saves nothing", () => {
    const { service, saves } = createWorld([player("elsewhere", 0, "g2")]);

    expect(service.canExecute(endTurn(0, 0))).toBe(false);
    expect(service.preview(endTurn(0, 0))).toBeUndefined();
    expect(service.execute(endTurn(0, 0))).toBeUndefined();
    expect(saves).toEqual([]);
  });

  it("changes nothing it was given", () => {
    const units = [unit("u1", "p2")];
    const { service } = createWorld(twoPlayers, units);
    const actionInput = endTurn(0, 0);
    const before = JSON.stringify([actionInput, units]);

    service.execute(actionInput);

    expect(JSON.stringify([actionInput, units])).toBe(before);
  });
});
