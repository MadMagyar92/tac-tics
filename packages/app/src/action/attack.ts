import {
  type ActionService,
  type AttackActionInput,
  type AttackActionOutput,
  type AttackInstance,
  type DefinitionService,
  type ObjectService,
  type OffenseDefinition,
  type OffenseObject,
  Scope,
  type UnitObject,
} from "@tac-tics/api";
import { canAttack, getAttackDamage } from "./validate";

export const ATTACK_ACTION = { scope: "action", name: "attack" };

export class AttackActionService implements ActionService<AttackActionInput, AttackActionOutput> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {}

  canExecute(input: AttackActionInput): boolean {
    return this._plan(input) !== undefined;
  }

  preview(input: AttackActionInput): AttackActionOutput | undefined {
    return this._act(input, false);
  }

  execute(input: AttackActionInput): AttackActionOutput | undefined {
    return this._act(input, true);
  }

  private _act(input: AttackActionInput, commit: boolean): AttackActionOutput | undefined {
    const attack = this._plan(input);
    if (!attack) {
      return undefined;
    }

    const result = this._preview(attack);
    if (commit) {
      this._commit(result);
    }
    return { definition: input.definition, damage: result.damage, offenseId: result.offense.identifier.id };
  }

  private _plan(input: AttackActionInput): AttackInstance | undefined {
    const { game, unit, target } = input;
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
      const offenseDefinition = this.definitionService.get<OffenseDefinition>(offense.definition);
      if (!offenseDefinition) {
        return undefined;
      }

      if (canAttack(unit, target, offense, offenseDefinition)) {
        return { input, offense, offenseDefinition, damage: getAttackDamage(offenseDefinition, target) };
      }
    }
    return undefined;
  }

  private _preview(attack: AttackInstance): AttackInstance {
    const { input, offense, offenseDefinition, damage } = attack;
    const { unit, target } = input;
    return {
      ...attack,
      input: { ...input, unit: { ...unit, acted: true }, target: { ...target, health: Math.max(0, target.health - damage) } },
      offense: offenseDefinition.ammoMax >= 0 ? { ...offense, ammo: offense.ammo - 1 } : offense,
    };
  }

  private _commit({ input: { unit, target }, offense, offenseDefinition }: AttackInstance): void {
    if (offenseDefinition.ammoMax >= 0) {
      this.objectService.save<OffenseObject>(Scope.Offense, offense);
    }
    this.objectService.save<UnitObject>(Scope.Unit, unit);
    if (target.health <= 0) {
      this._deleteUnit(target);
    } else {
      this.objectService.save<UnitObject>(Scope.Unit, target);
    }
  }

  private _deleteUnit(unit: UnitObject): void {
    this.objectService.delete<UnitObject>(Scope.Unit, unit.identifier);
    for (const id of unit.offenseIds) {
      this.objectService.delete<OffenseObject>(Scope.Offense, { id, gameId: unit.identifier.gameId, unitId: unit.identifier.id });
    }
  }
};
