import {
  BaseActionService,
  type CaptureActionInput,
  type CaptureActionOutput,
  type CaptureActionPlan,
  type CaptureActionResult,
  type CaptureDefinition,
  type DefinitionService,
  type ObjectService,
  type OutpostObject,
  Scope,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { canCapture, filterUnitsFromGame, isLoaded } from "../common";

export const CAPTURE_ACTION = { scope: "action", name: "capture" };

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

    const units = filterUnitsFromGame([...this.objectService.loadAll<UnitObject>(Scope.Unit).values()], game.identifier.id);
    if (isLoaded(units, unit.identifier.id)) {
      return undefined;
    }

    if (!canCapture(unit, target, captureDefinition.allowed)) {
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
    this.objectService.save<OutpostObject>(Scope.Outpost, target);
    this.objectService.save<UnitObject>(Scope.Unit, unit);
    return { definition: CAPTURE_ACTION, unit, target };
  }
};
