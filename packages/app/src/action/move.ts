import {
  type ActionService,
  type DefinitionService,
  type MoveAction,
  type MovementDefinition,
  type ObjectService,
  Scope,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { canMove, getMoveCost } from "./validate";

export const MOVE_ACTION = { scope: "action", name: "move" };

type Move = {
  cost: number;
};

export class MoveActionService implements ActionService<MoveAction> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {}

  canExecute(action: MoveAction): boolean {
    return this._plan(action) !== undefined;
  }

  preview(action: MoveAction): MoveAction {
    return this._act(action, true);
  }

  execute(action: MoveAction): MoveAction {
    return this._act(action, false);
  }

  private _act(action: MoveAction, preview: boolean): MoveAction {
    const move = this._plan(action);
    if (!move) {
      return action;
    }

    return preview ? this._preview(action, move) : this._commit(action, move);
  }

  private _plan({ game, unit, target }: MoveAction): Move | undefined {
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

    return { cost: getMoveCost(movement, target) };
  }

  private _commit(action: MoveAction, move: Move): MoveAction {
    const result = this._preview(action, move);
    this.objectService.save<UnitObject>(Scope.Unit, result.unit);
    return result;
  }

  private _preview(action: MoveAction, move: Move): MoveAction {
    const { unit, target } = action;
    return { ...action, unit: { ...unit, position: { ...target.position }, fuel: unit.fuel - move.cost } };
  }
};
