import {
  BaseActionService,
  type EndTurnActionInput,
  type EndTurnActionOutput,
  type EndTurnActionPlan,
  type EndTurnActionResult,
  type GameObject,
  type ObjectService,
  type PlayerObject,
  Scope,
  type UnitObject,
} from "@tac-tics/api";
import { filterUnitsFromGame } from "../common";

export const END_TURN_ACTION = { scope: "action", name: "end-turn" };

/**
 * Ends the turn of the player whose turn it is, and hands it to the player of the game with the next order. After the
 * player with the last order, the game moves on to its next turn and starts again from the player with the first order.
 *
 * The units of the player who has the turn next are made ready again: none of them has moved or acted. The units of
 * every other player are left as they are.
 */
export class EndTurnActionService extends BaseActionService<EndTurnActionInput, EndTurnActionPlan, EndTurnActionResult, EndTurnActionOutput> {
  constructor(private objectService: ObjectService) {
    super();
  }

  plan(input: EndTurnActionInput): EndTurnActionPlan | undefined {
    const { definition, game } = input;
    const players = this.getPlayersFromGame(game.identifier.id);
    if (players.length === 0) {
      return undefined;
    }

    return { definition, game, players, units: filterUnitsFromGame([...this.objectService.loadAll<UnitObject>(Scope.Unit).values()], game.identifier.id) };
  }

  private getPlayersFromGame(gameId: string): PlayerObject[] {
    return [...this.objectService.loadAll<PlayerObject>(Scope.Player).values()].filter((player) => player.identifier.gameId === gameId);
  }

  preview({ game, players, units }: EndTurnActionPlan): EndTurnActionResult {
    const player = this.getNextPlayer(players, game.playerTurn);
    const turn = player.order > game.playerTurn ? game.turn : game.turn + 1;
    return {
      game: { ...game, turn, playerTurn: player.order },
      units: units.filter((unit) => unit.playerId === player.identifier.id).map((unit) => ({ ...unit, moved: false, acted: false })),
    };
  }

  private getNextPlayer(players: PlayerObject[], playerTurn: number): PlayerObject {
    const ordered = [...players].sort((a, b) => a.order - b.order);
    return ordered.find((player) => player.order > playerTurn) ?? ordered[0];
  }

  commit({ game, units }: EndTurnActionResult): EndTurnActionOutput {
    this.objectService.save<GameObject>(Scope.Game, game);
    for (const unit of units) {
      this.objectService.save<UnitObject>(Scope.Unit, unit);
    }
    return { definition: END_TURN_ACTION, game, units };
  }
};
