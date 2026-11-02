import {
  type ActionService,
  type AttackAction,
  type DefinitionService,
  type ObjectService,
  type OffenseDefinition,
  type OffenseObject,
  Scope,
  type UnitObject,
} from "@tac-tics/api";
import { canAttack, getAttackDamage } from "./validate";

export const ATTACK_ACTION = { scope: "action", name: "attack" };

type Attack = {
  definition: OffenseDefinition;
  offense: OffenseObject;
  damage: number;
};

export class AttackActionService implements ActionService<AttackAction> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {}

  canExecute(action: AttackAction): boolean {
    return this._plan(action) !== undefined;
  }

  preview(action: AttackAction): AttackAction {
    return this._act(action, true);
  }

  execute(action: AttackAction): AttackAction {
    return this._act(action, false);
  }

  private _act(action: AttackAction, preview: boolean): AttackAction {
    const attack = this._plan(action);
    if (!attack) {
      return action;
    }

    return preview ? this._preview(action, attack) : this._commit(action, attack);
  }

  private _plan({ game, unit, target }: AttackAction): Attack | undefined {
    if (unit.identifier.gameId !== game.identifier.id || target.identifier.gameId !== game.identifier.id) {
      return undefined;
    }

    if (unit.playerId === target.playerId) {
      return undefined;
    }

    for (const id of unit.offenseIds) {
      const offense = this.objectService.load<OffenseObject>(Scope.Offense, { id, gameId: game.identifier.id, unitId: unit.identifier.id });
      if (!offense) {
        return undefined;
      }
      const definition = this.definitionService.get<OffenseDefinition>(offense.definition);
      if (!definition) {
        return undefined;
      }

      if (canAttack(unit, target, offense, definition)) {
        return { definition, offense, damage: getAttackDamage(definition, target) };
      }
    }
    return undefined;
  }

  private _commit(action: AttackAction, attack: Attack): AttackAction {
    const result = this._preview(action, attack);
    if (attack.definition.ammoMax >= 0) {
      this.objectService.save<OffenseObject>(Scope.Offense, { ...attack.offense, ammo: attack.offense.ammo - 1 });
    }

    if (result.target.health <= 0) {
      this._deleteUnit(result.target);
    } else {
      this.objectService.save<UnitObject>(Scope.Unit, result.target);
    }
    return result;
  }

  private _deleteUnit(unit: UnitObject): void {
    this.objectService.delete<UnitObject>(Scope.Unit, unit.identifier);
    for (const id of unit.offenseIds) {
      this.objectService.delete<OffenseObject>(Scope.Offense, { id, gameId: unit.identifier.gameId, unitId: unit.identifier.id });
    }
  }

  private _preview(action: AttackAction, attack: Attack): AttackAction {
    const { target } = action;
    return { ...action, target: { ...target, health: Math.max(0, target.health - attack.damage) } };
  }
};
