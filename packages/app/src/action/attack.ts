import {
  type AttackActionInput,
  type AttackActionOutput,
  type AttackActionPlan,
  type AttackActionResult,
  BaseActionService,
  type DefinitionService,
  type MovementObject,
  type ObjectService,
  type OffenseDefinition,
  type OffenseObject,
  Scope,
  type UnitObject,
} from "@tac-tics/api";
import { canAttack, filterUnitsFromGame, getAttackDamage, isLoaded } from "../common";

export const ATTACK_ACTION = { scope: "action", name: "attack" };

export class AttackActionService extends BaseActionService<AttackActionInput, AttackActionPlan, AttackActionResult, AttackActionOutput> {
  constructor(
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {
    super();
  }

  plan(input: AttackActionInput): AttackActionPlan | undefined {
    const { definition, game, unit, target } = input;
    if (unit.identifier.gameId !== game.identifier.id || target.identifier.gameId !== game.identifier.id) {
      return undefined;
    }

    if (unit.playerId === target.playerId) {
      return undefined;
    }

    const units = filterUnitsFromGame([...this.objectService.loadAll<UnitObject>(Scope.Unit).values()], game.identifier.id);
    if (isLoaded(units, unit.identifier.id) || isLoaded(units, target.identifier.id)) {
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
        return { definition, unit, target, offense, damage: getAttackDamage(offenseDefinition, target) ?? 0 };
      }
    }
    return undefined;
  }

  preview({ unit, target, offense, damage }: AttackActionPlan): AttackActionResult {
    return {
      unit: { ...unit, acted: true },
      target: { ...target, health: target.health - damage },
      offense: { ...offense, ammo: offense.ammo - 1 },
    };
  }

  commit({ unit, target, offense }: AttackActionResult): AttackActionOutput {
    this.objectService.save<OffenseObject>(Scope.Offense, offense);
    this.objectService.save<UnitObject>(Scope.Unit, unit);
    if (target.health <= 0) {
      this._delete(target);
    } else {
      this.objectService.save<UnitObject>(Scope.Unit, target);
    }
    return { definition: ATTACK_ACTION, unit, target, offense };
  }

  private _delete(unit: UnitObject): void {
    this.objectService.delete<UnitObject>(Scope.Unit, unit.identifier);
    this.objectService.delete<MovementObject>(Scope.Movement, { id: unit.movementId, gameId: unit.identifier.gameId, unitId: unit.identifier.id });
    for (const id of unit.offenseIds) {
      this.objectService.delete<OffenseObject>(Scope.Offense, { id, gameId: unit.identifier.gameId, unitId: unit.identifier.id });
    }
    for (const id of unit.transportIds) {
      const held = this.objectService.load<UnitObject>(Scope.Unit, { id, gameId: unit.identifier.gameId });
      if (held) {
        this._delete(held);
      }
    }
  }
};
