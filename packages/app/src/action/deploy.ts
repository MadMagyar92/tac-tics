import {
  BaseActionService,
  type DefinitionService,
  type DeployActionInput,
  type DeployActionOutput,
  type DeployActionPlan,
  type DeployActionResult,
  type MovementObject,
  type ObjectService,
  type OffenseDefinition,
  type OffenseObject,
  type PlayerObject,
  Scope,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { fillNewMovement, fillNewOffense, fillNewUnit } from "./fillers";
import { getPlayerFromTurn, getUnitAtPosition } from "./getters";
import { canDeploy, nextMovementId, nextOffenseId, nextUnitId } from "./validators";

export const DEPLOY_ACTION = { scope: "action", name: "deploy" };

export class DeployActionService extends BaseActionService<DeployActionInput, DeployActionPlan, DeployActionResult, DeployActionOutput> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {
    super();
  }

  plan(input: DeployActionInput): DeployActionPlan | undefined {
    const { definition, game, terrain, target } = input;
    if (terrain.identifier.gameId !== game.identifier.id) {
      return undefined;
    }
    if (target.scope !== Scope.Unit) {
      return undefined;
    }

    const players = [...this.objectService.loadAll<PlayerObject>(Scope.Player).values()].filter((player) => player.identifier.gameId === game.identifier.id);
    const player = getPlayerFromTurn(players, game.playerTurn);
    if (!player) {
      return undefined;
    }

    const unitDefinition = this.definitionService.get<UnitDefinition>(target);
    if (!unitDefinition) {
      return undefined;
    }

    const units = [...this.objectService.loadAll<UnitObject>(Scope.Unit).values()].filter((unit) => unit.identifier.gameId === game.identifier.id);
    if (!canDeploy(game, player, terrain, unitDefinition)) {
      return undefined;
    }
    if (getUnitAtPosition(units, terrain.position)) {
      return undefined;
    }

    const id = nextUnitId(units.map((unit) => unit.identifier.id));
    const movement = fillNewMovement(game.identifier.id, id, nextMovementId([]), unitDefinition.movement, unitDefinition.fuelMax);
    const offenses: OffenseObject[] = [];
    for (const key of unitDefinition.offenses) {
      const offense = this.definitionService.get<OffenseDefinition>(key);
      if (!offense) {
        return undefined;
      }
      offenses.push(fillNewOffense(game.identifier.id, id, nextOffenseId(offenses.map(({ identifier }) => identifier.id)), key, offense.ammoMax));
    }

    return {
      definition,
      player,
      unit: fillNewUnit(game.identifier.id, player.identifier.id, id, unitDefinition.definition, movement.identifier.id, offenses.map(({ identifier }) => identifier.id), terrain.position),
      movement,
      offenses,
      cost: unitDefinition.fundsCost,
    };
  }

  preview({ player, unit, movement, offenses, cost }: DeployActionPlan): DeployActionResult {
    return { player: { ...player, funds: player.funds - cost }, unit, movement, offenses };
  }

  commit({ player, unit, movement, offenses }: DeployActionResult): DeployActionOutput {
    this.objectService.save<UnitObject>(Scope.Unit, unit);
    this.objectService.save<MovementObject>(Scope.Movement, movement);
    for (const offense of offenses) {
      this.objectService.save<OffenseObject>(Scope.Offense, offense);
    }
    this.objectService.save<PlayerObject>(Scope.Player, player);
    return { definition: DEPLOY_ACTION, player, unit, movement, offenses };
  }
};
