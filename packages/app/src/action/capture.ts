import {
  type ActionService,
  type CaptureActionInput,
  type CaptureActionOutput,
  type CaptureInstance,
  type DefinitionService,
  type ObjectService,
  Scope,
  type TerrainDefinition,
  type TerrainObject,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { canCapture, getCaptureAmount, hasAction } from "./validate";

export const CAPTURE_ACTION = { scope: "action", name: "capture" };

/**
 * Captures the terrain a unit stands on, for the unit's player. Only a unit whose definition lists the capture action
 * can capture, only terrain whose definition can be captured, and only once per turn: capturing counts as acting.
 *
 * Each capture takes a tenth of the unit's health, rounded up, off the terrain's health. Once that reaches zero, the
 * terrain becomes the player's and its health goes back to full.
 */
export class CaptureActionService implements ActionService<CaptureActionInput, CaptureActionOutput> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {}

  canExecute(input: CaptureActionInput): boolean {
    return this._plan(input) !== undefined;
  }

  preview(input: CaptureActionInput): CaptureActionOutput | undefined {
    return this._act(input, false);
  }

  execute(input: CaptureActionInput): CaptureActionOutput | undefined {
    return this._act(input, true);
  }

  private _act(input: CaptureActionInput, commit: boolean): CaptureActionOutput | undefined {
    const capture = this._plan(input);
    if (!capture) {
      return undefined;
    }

    const result = this._preview(capture);
    if (commit) {
      this._commit(result);
    }
    const { unit, target } = result.input;
    return { definition: input.definition, health: target.health, captured: target.playerId === unit.playerId };
  }

  private _plan(input: CaptureActionInput): CaptureInstance | undefined {
    const { game, unit, target } = input;
    if (unit.identifier.gameId !== game.identifier.id || target.identifier.gameId !== game.identifier.id) {
      return undefined;
    }

    const definition = this.definitionService.get<UnitDefinition>(unit.definition);
    const terrainDefinition = this.definitionService.get<TerrainDefinition>(target.definition);
    if (!definition || !terrainDefinition) {
      return undefined;
    }

    if (!hasAction(definition.actions, CAPTURE_ACTION)) {
      return undefined;
    }
    if (!canCapture(unit, target, terrainDefinition.capturable)) {
      return undefined;
    }

    return { input, amount: getCaptureAmount(unit.health) };
  }

  private _preview(capture: CaptureInstance): CaptureInstance {
    const { input, amount } = capture;
    const { unit, target } = input;
    const health = target.health - amount;
    const terrain = health > 0 ? { ...target, health } : { ...target, health: 20, playerId: unit.playerId };
    return { ...capture, input: { ...input, unit: { ...unit, acted: true }, target: terrain } };
  }

  private _commit({ input: { unit, target } }: CaptureInstance): void {
    this.objectService.save<TerrainObject>(Scope.Terrain, target);
    this.objectService.save<UnitObject>(Scope.Unit, unit);
  }
};
