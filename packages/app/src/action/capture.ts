import {
  BaseActionService,
  type CaptureActionInput,
  type CaptureActionOutput,
  type CaptureActionPlan,
  type CaptureActionResult,
  type DefinitionService,
  type ObjectService,
  Scope,
  type TerrainDefinition,
  type TerrainObject,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { canCapture, hasAction } from "./validators";

export const CAPTURE_ACTION = { scope: "action", name: "capture" };

/**
 * Captures the terrain a unit stands on, for the unit's player. Only a unit whose definition lists the capture action
 * can capture, only terrain whose definition can be captured, and only once per turn: capturing counts as acting.
 *
 * Each capture takes a tenth of the unit's health, rounded up, off the terrain's health. Once that reaches zero, the
 * terrain becomes the player's and its health goes back to full.
 */
export class CaptureActionService extends BaseActionService<CaptureActionInput, CaptureActionPlan, CaptureActionResult, CaptureActionOutput> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {
    super();
  }

  plan(input: CaptureActionInput): CaptureActionPlan | undefined {
    const { definition, game, unit, target } = input;
    if (unit.identifier.gameId !== game.identifier.id || target.identifier.gameId !== game.identifier.id) {
      return undefined;
    }

    const unitDefinition = this.definitionService.get<UnitDefinition>(unit.definition);
    const terrainDefinition = this.definitionService.get<TerrainDefinition>(target.definition);
    if (!unitDefinition || !terrainDefinition) {
      return undefined;
    }

    if (!hasAction(unitDefinition.actions, CAPTURE_ACTION)) {
      return undefined;
    }
    if (!canCapture(unit, target, terrainDefinition.capturable)) {
      return undefined;
    }

    return { definition, unit, target, amount: Math.ceil(unit.health / 10) };
  }

  preview({ unit, target, amount }: CaptureActionPlan): CaptureActionResult {
    const health = target.health - amount;
    const terrain = health > 0 ? { ...target, health } : { ...target, health: 20, playerId: unit.playerId };
    return { unit: { ...unit, acted: true }, target: terrain };
  }

  commit({ unit, target }: CaptureActionResult): CaptureActionOutput {
    this.objectService.save<TerrainObject>(Scope.Terrain, target);
    this.objectService.save<UnitObject>(Scope.Unit, unit);
    return { definition: CAPTURE_ACTION, unit, target };
  }
};
