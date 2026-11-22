import {
  BaseActionService,
  type DefinitionService,
  type MoveActionInput,
  type MoveActionOutput,
  type MoveActionPlan,
  type MoveActionResult,
  type MovementDefinition,
  type MovementObject,
  type ObjectService,
  Scope,
  type UnitObject,
} from "@tac-tics/api";
import { canMove, filterUnitsFromGame, getMoveCost, getUnitAtPosition, getUnitsFromTransport, isInGame, isLoaded } from "../common";

export const MOVE_ACTION = { scope: "action", name: "move" };

export class MoveActionService extends BaseActionService<MoveActionInput, MoveActionPlan, MoveActionResult, MoveActionOutput> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {
    super();
  }

  plan(input: MoveActionInput): MoveActionPlan | undefined {
    const { definition, game, unit, target } = input;
    if (unit.identifier.gameId !== game.identifier.id || !isInGame(game.identifier.id, game.mapId, target.identifier)) {
      return undefined;
    }

    const movement = this.objectService.load<MovementObject>(Scope.Movement, { id: unit.movementId, gameId: game.identifier.id, unitId: unit.identifier.id });
    if (!movement) {
      return undefined;
    }
    
    const movementDefinition = this.definitionService.get<MovementDefinition>(movement.definition);
    if (!movementDefinition) {
      return undefined;
    }

    const others = this.getOthersFromGame(game.identifier.id, unit.identifier.id, unit.transportIds);
    if (isLoaded(others, unit.identifier.id)) {
      return undefined;
    }

    const other = getUnitAtPosition(others, target.position);
    if (!canMove(unit, target, movement, movementDefinition, other)) {
      return undefined;
    }

    return { definition, unit, target, movement, other, cost: getMoveCost(movementDefinition, target) ?? 1 };
  }

  private getOthersFromGame(gameId: string, unitId: string, transportIds: string[]): UnitObject[] {
    const units = filterUnitsFromGame([...this.objectService.loadAll<UnitObject>(Scope.Unit).values()], gameId);
    const transport = getUnitsFromTransport(units, transportIds).map(({ identifier }) => identifier.id);
    return units.filter(({ identifier }) => identifier.id !== unitId && !transport.includes(identifier.id));
  }

  preview({ unit, target, movement, other, cost }: MoveActionPlan): MoveActionResult {
    if (other && other.playerId !== unit.playerId) {
      return { unit, movement, interrupted: true };
    }
    return { unit: { ...unit, position: { ...target.position } }, movement: { ...movement, fuel: movement.fuel - cost }, interrupted: false };
  }

  commit({ unit, movement, interrupted }: MoveActionResult): MoveActionOutput {
    this.objectService.save<MovementObject>(Scope.Movement, movement);
    this.objectService.save<UnitObject>(Scope.Unit, unit);
    return { definition: MOVE_ACTION, unit, movement, interrupted };
  }
};
