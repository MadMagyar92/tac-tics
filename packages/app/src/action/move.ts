import {
  type ActionService,
  type DefinitionService,
  type MoveActionInput,
  type MoveActionOutput,
  type MoveInstance,
  type MovementDefinition,
  type ObjectService,
  Scope,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { canMove, getMoveCost } from "./validate";

export const MOVE_ACTION = { scope: "action", name: "move" };

export class MoveActionService implements ActionService<MoveActionInput, MoveActionOutput> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {}

  canExecute(input: MoveActionInput): boolean {
    return this._plan(input) !== undefined;
  }

  preview(input: MoveActionInput): MoveActionOutput | undefined {
    return this._act(input, false);
  }

  execute(input: MoveActionInput): MoveActionOutput | undefined {
    return this._act(input, true);
  }

  private _act(input: MoveActionInput, commit: boolean): MoveActionOutput | undefined {
    const move = this._plan(input);
    if (!move) {
      return undefined;
    }

    const result = this._preview(move);
    if (commit) {
      this._commit(result);
    }
    return { definition: input.definition, cost: result.cost, terrainId: result.input.target.identifier.id };
  }

  private _plan(input: MoveActionInput): MoveInstance | undefined {
    const { game, unit, target } = input;
    if (unit.identifier.gameId !== game.identifier.id || target.identifier.gameId !== game.identifier.id) {
      return undefined;
    }

    const definition = this.definitionService.get<UnitDefinition>(unit.definition);
    if (!definition) {
      return undefined;
    }
    const movement = this.definitionService.get<MovementDefinition>(definition.movement);
    if (!movement) {
      return undefined;
    }

    if (!canMove(unit, target, definition, movement)) {
      return undefined;
    }

    return { input, cost: getMoveCost(movement, target) };
  }

  private _preview(move: MoveInstance): MoveInstance {
    const { input, cost } = move;
    const { unit, target } = input;
    return { ...move, input: { ...input, unit: { ...unit, position: { ...target.position }, fuel: unit.fuel - cost } } };
  }

  private _commit({ input: { unit } }: MoveInstance): void {
    this.objectService.save<UnitObject>(Scope.Unit, unit);
  }
};
