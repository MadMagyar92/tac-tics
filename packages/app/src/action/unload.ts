import {
  BaseActionService,
  type DefinitionService,
  type MovementDefinition,
  type MovementObject,
  type ObjectService,
  Scope,
  type UnitDefinition,
  type UnitObject,
  type UnloadActionInput,
  type UnloadActionOutput,
  type UnloadActionPlan,
  type UnloadActionResult,
} from "@tac-tics/api";
import { canUnload, filterUnitsFromGame, getUnitAtPosition, isInGame, isLoaded } from "../common";

export const UNLOAD_ACTION = { scope: "action", name: "unload" };

export class UnloadActionService extends BaseActionService<UnloadActionInput, UnloadActionPlan, UnloadActionResult, UnloadActionOutput> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {
    super();
  }

  plan(input: UnloadActionInput): UnloadActionPlan | undefined {
    const { definition, game, unit, target, terrain } = input;
    if (unit.identifier.gameId !== game.identifier.id || target.identifier.gameId !== game.identifier.id || !isInGame(game.identifier.id, game.mapId, terrain.identifier)) {
      return undefined;
    }

    const unitDefinition = this.definitionService.get<UnitDefinition>(unit.definition);
    if (!unitDefinition?.transport) {
      return undefined;
    }

    if (!unit.transportIds.includes(target.identifier.id)) {
      return undefined;
    }

    const movement = this.objectService.load<MovementObject>(Scope.Movement, { id: target.movementId, gameId: game.identifier.id, unitId: target.identifier.id });
    if (!movement) {
      return undefined;
    }

    const movementDefinition = this.definitionService.get<MovementDefinition>(movement.definition);
    if (!movementDefinition) {
      return undefined;
    }

    const units = filterUnitsFromGame([...this.objectService.loadAll<UnitObject>(Scope.Unit).values()], game.identifier.id);
    if (isLoaded(units, unit.identifier.id)) {
      return undefined;
    }

    const other = getUnitAtPosition(units, terrain.position);
    if (!canUnload(unit, terrain, movementDefinition, other !== undefined)) {
      return undefined;
    }

    return { definition, unit, target, terrain };
  }

  preview({ unit, target, terrain }: UnloadActionPlan): UnloadActionResult {
    return {
      unit: { ...unit, acted: true, transportIds: unit.transportIds.filter((id) => id !== target.identifier.id) },
      target: { ...target, position: { ...terrain.position }, moved: true, acted: true },
    };
  }

  commit({ unit, target }: UnloadActionResult): UnloadActionOutput {
    this.objectService.save<UnitObject>(Scope.Unit, unit);
    this.objectService.save<UnitObject>(Scope.Unit, target);
    return { definition: UNLOAD_ACTION, unit, target };
  }
};
