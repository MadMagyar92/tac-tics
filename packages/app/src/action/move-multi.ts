import {
  type ActionService,
  BaseActionService,
  type DefinitionService,
  type MoveActionInput,
  type MoveActionOutput,
  type MoveActionPlan,
  type MoveActionResult,
  type MovementObject,
  type MultiMoveActionInput,
  type MultiMoveActionOutput,
  type MultiMoveActionPlan,
  type MultiMoveActionResult,
  type ObjectService,
  type Position,
  Scope,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { getUnitAtPosition } from "./getters";
import { MOVE_ACTION } from "./move";

/**
 * Moves a unit along a path of terrain, one square at a time, by handing each square to the single-square move service.
 * The whole path must fit within the unit's move range and its fuel, no square of it may hold an enemy, its last square
 * may not hold any other unit, and a unit that has moved or acted cannot move again.
 *
 * An enemy on the next square of the path interrupts the move: the unit stops where it is, spends only the fuel of the
 * squares it moved through, and still counts as moved, even when it never left its square.
 */
export class MultiMoveActionService extends BaseActionService<MultiMoveActionInput, MultiMoveActionPlan, MultiMoveActionResult, MultiMoveActionOutput> {
  constructor(
    private moveService: ActionService<MoveActionInput, MoveActionPlan, MoveActionResult, MoveActionOutput>,
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {
    super();
  }

  plan(input: MultiMoveActionInput): MultiMoveActionPlan | undefined {
    const { definition, game, unit, targets } = input;
    if (targets.length === 0) {
      return undefined;
    }

    const unitDefinition = this.definitionService.get<UnitDefinition>(unit.definition);
    if (!unitDefinition) {
      return undefined;
    }

    const steps: MoveActionPlan[] = [];
    let walker = unit;
    for (const target of targets) {
      const step = this.moveService.plan({ definition: MOVE_ACTION, game, unit: walker, target });
      if (!step) {
        return undefined;
      }
      steps.push(step);
      walker = this.moveUnit(walker, target.position);
    }

    const costs = steps.map(({ cost }) => cost);
    const others = steps.flatMap(({ other }) => (other ? [other] : []));
    const { movement } = steps[0];
    const total = this.sumCosts(costs);
    if (total > unitDefinition.moveMax || total > movement.fuel) {
      return undefined;
    }
    if (steps.at(-1)?.other) {
      return undefined;
    }

    return { definition, unit, targets, movement, others, costs };
  }

  private moveUnit(unit: UnitObject, position: Position): UnitObject {
    return { ...unit, position: { ...position } };
  }

  private sumCosts(costs: number[]): number {
    return costs.reduce((total, cost) => total + cost, 0);
  }

  preview({ unit, targets, movement, others, costs }: MultiMoveActionPlan): MultiMoveActionResult {
    let step: MoveActionResult = { unit, movement, interrupted: false };
    for (const [index, target] of targets.entries()) {
      const other = getUnitAtPosition(others, target.position);
      step = this.moveService.preview({ definition: MOVE_ACTION, unit: step.unit, target, movement: step.movement, other, cost: costs[index] });
      if (step.interrupted) {
        break;
      }
    }
    return { unit: { ...step.unit, moved: true }, movement: step.movement, interrupted: step.interrupted };
  }

  commit({ unit, movement, interrupted }: MultiMoveActionResult): MultiMoveActionOutput {
    this.objectService.save<MovementObject>(Scope.Movement, movement);
    this.objectService.save<UnitObject>(Scope.Unit, unit);
    return { definition: MOVE_ACTION, unit, movement, interrupted };
  }
};
