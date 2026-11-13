import {
  type ActionService,
  type EndTurnActionInput,
  type EndTurnActionOutput,
  type EndTurnInstance,
  type GameObject,
  type ObjectService,
  type PlayerObject,
  Scope,
  type UnitObject,
} from "@tac-tics/api";

export const END_TURN_ACTION = { scope: "action", name: "end-turn" };

/**
 * Ends the turn of the player whose turn it is, and hands it to the player of the game with the next order. After the
 * player with the last order, the game moves on to its next turn and starts again from the player with the first order.
 *
 * The units of the player who has the turn next are made ready again: none of them has moved or acted. The units of
 * every other player are left as they are.
 */
export class EndTurnActionService implements ActionService<EndTurnActionInput, EndTurnActionOutput> {
  constructor(private objectService: ObjectService) {}

  canExecute(input: EndTurnActionInput): boolean {
    return this._plan(input) !== undefined;
  }

  preview(input: EndTurnActionInput): EndTurnActionOutput | undefined {
    return this._act(input, false);
  }

  execute(input: EndTurnActionInput): EndTurnActionOutput | undefined {
    return this._act(input, true);
  }

  private _act(input: EndTurnActionInput, commit: boolean): EndTurnActionOutput | undefined {
    const endTurn = this._plan(input);
    if (!endTurn) {
      return undefined;
    }

    const result = this._preview(endTurn);
    if (commit) {
      this._commit(result);
    }
    const { turn, playerTurn } = result.input.game;
    return { definition: input.definition, turn, playerTurn };
  }

  private _plan(input: EndTurnActionInput): EndTurnInstance | undefined {
    const { game } = input;
    const player = this.getNextPlayer(game.identifier.id, game.playerTurn);
    if (!player) {
      return undefined;
    }

    return { input, player, units: this.getUnitsFromPlayer(game.identifier.id, player.identifier.id) };
  }

  private getNextPlayer(gameId: string, playerTurn: number): PlayerObject | undefined {
    const players = [...this.objectService.loadAll<PlayerObject>(Scope.Player).values()]
      .filter((player) => player.identifier.gameId === gameId)
      .sort((a, b) => a.order - b.order);
    return players.find((player) => player.order > playerTurn) ?? players[0];
  }

  private getUnitsFromPlayer(gameId: string, playerId: string): UnitObject[] {
    return [...this.objectService.loadAll<UnitObject>(Scope.Unit).values()].filter(
      (unit) => unit.identifier.gameId === gameId && unit.playerId === playerId,
    );
  }

  private _preview(endTurn: EndTurnInstance): EndTurnInstance {
    const { input, player, units } = endTurn;
    const { game } = input;
    const turn = player.order > game.playerTurn ? game.turn : game.turn + 1;
    return {
      ...endTurn,
      input: { ...input, game: { ...game, turn, playerTurn: player.order } },
      units: units.map((unit) => ({ ...unit, moved: false, acted: false })),
    };
  }

  private _commit({ input: { game }, units }: EndTurnInstance): void {
    this.objectService.save<GameObject>(Scope.Game, game);
    for (const unit of units) {
      this.objectService.save<UnitObject>(Scope.Unit, unit);
    }
  }
};
