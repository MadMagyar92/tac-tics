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
import { canUnload, getUnitAtPosition, isLoaded } from "../common";

export const UNLOAD_ACTION = { scope: "action", name: "unload" };

/**
 * Unloads a unit a carrier transports onto an empty terrain next to the carrier, that the unloaded unit's movement can
 * enter. Unloading counts as the carrier acting: it may move before it unloads, never after, and unloads once per turn.
 *
 * The unloaded unit is back on the map, without spending fuel, but counts as moved and acted, so it can do nothing else
 * until its player's next turn. Only a carrier whose definition names a transport definition can unload, and only
 * while it is not itself loaded.
 */
export class UnloadActionService extends BaseActionService<UnloadActionInput, UnloadActionPlan, UnloadActionResult, UnloadActionOutput> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {
    super();
  }

  plan(input: UnloadActionInput): UnloadActionPlan | undefined {
    const { definition, game, unit, target, terrain } = input;
    if (unit.identifier.gameId !== game.identifier.id || target.identifier.gameId !== game.identifier.id || terrain.identifier.gameId !== game.identifier.id) {
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

    const units = this.getUnitsFromGame(game.identifier.id);
    if (isLoaded(units, unit.identifier.id)) {
      return undefined;
    }

    const other = getUnitAtPosition(units, terrain.position);
    if (!canUnload(unit, terrain, movementDefinition, other !== undefined)) {
      return undefined;
    }

    return { definition, unit, target, terrain };
  }

  private getUnitsFromGame(gameId: string): UnitObject[] {
    return [...this.objectService.loadAll<UnitObject>(Scope.Unit).values()].filter(({ identifier }) => identifier.gameId === gameId);
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
