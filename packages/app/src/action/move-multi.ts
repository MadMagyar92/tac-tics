import {
  type ActionService,
  BaseActionService,
  type DefinitionService,
  type LoadActionInput,
  type LoadActionOutput,
  type LoadActionPlan,
  type LoadActionResult,
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
import { getUnitAtPosition } from "../common";
import { LOAD_ACTION } from "./load";
import { MOVE_ACTION } from "./move";

/**
 * Moves a unit along a path of terrain, one square at a time, by handing each square to the single-square move service.
 * The whole path must fit within the unit's move range and its fuel, no square of it may hold an enemy, its last square
 * may hold no other unit but an ally carrier the load service can load the unit into, and a unit that has moved or acted cannot move again.
 *
 * An enemy on the next square of the path interrupts the move: the unit stops where it is, spends only the fuel of the
 * squares it moved through, and still counts as moved, even when it never left its square. A move that ends on a
 * carrier loads the unit into it, unless the move is interrupted, and the units the unit transports go with it.
 */
export class MultiMoveActionService extends BaseActionService<MultiMoveActionInput, MultiMoveActionPlan, MultiMoveActionResult, MultiMoveActionOutput> {
  constructor(
    private moveService: ActionService<MoveActionInput, MoveActionPlan, MoveActionResult, MoveActionOutput>,
    private loadService: ActionService<LoadActionInput, LoadActionPlan, LoadActionResult, LoadActionOutput>,
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

    const carrier = steps.at(-1)?.other;
    if (carrier && !this.loadService.plan({ definition: LOAD_ACTION, game, unit: walker, target: carrier })) {
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
    const moved = { ...step.unit, moved: true };
    const carrier = step.interrupted ? undefined : getUnitAtPosition(others, moved.position);
    return {
      unit: moved,
      movement: step.movement,
      interrupted: step.interrupted,
      transport: carrier && this.loadService.preview({ definition: LOAD_ACTION, unit: moved, target: carrier }).target,
    };
  }

  commit({ unit, movement, interrupted, transport }: MultiMoveActionResult): MultiMoveActionOutput {
    this.objectService.save<MovementObject>(Scope.Movement, movement);
    this.objectService.save<UnitObject>(Scope.Unit, unit);
    if (transport) {
      this.objectService.save<UnitObject>(Scope.Unit, transport);
    }
    return { definition: MOVE_ACTION, unit, movement, interrupted, transport };
  }
};
