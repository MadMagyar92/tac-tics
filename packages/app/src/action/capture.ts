import {
  BaseActionService,
  type CaptureActionInput,
  type CaptureActionOutput,
  type CaptureActionPlan,
  type CaptureActionResult,
  type CaptureDefinition,
  type DefinitionService,
  type ObjectService,
  Scope,
  type TerrainObject,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { canCapture, isLoaded } from "../common";

export const CAPTURE_ACTION = { scope: "action", name: "capture" };

/**
 * Captures the terrain a unit stands on, for the unit's player. Only a unit whose definition names a capture definition
 * can capture, only the terrain that definition allows, and only once per turn: capturing counts as acting.
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
    if (!unitDefinition?.capture) {
      return undefined;
    }

    const captureDefinition = this.definitionService.get<CaptureDefinition>(unitDefinition.capture);
    if (!captureDefinition) {
      return undefined;
    }

    if (isLoaded(this.getUnitsFromGame(game.identifier.id), unit.identifier.id)) {
      return undefined;
    }

    if (!canCapture(unit, target, captureDefinition.allowed)) {
      return undefined;
    }

    return { definition, unit, target, amount: Math.ceil(unit.health / 10) };
  }

  private getUnitsFromGame(gameId: string): UnitObject[] {
    return [...this.objectService.loadAll<UnitObject>(Scope.Unit).values()].filter(({ identifier }) => identifier.gameId === gameId);
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
