import {
  type ActionService,
  type DefinitionService,
  type MoveActionInput,
  type MoveActionOutput,
  type MoveInstance,
  type MultiMoveActionInput,
  type MultiMoveActionOutput,
  type MultiMoveInstance,
  type ObjectService,
  type Position,
  Scope,
  type TerrainObject,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { MOVE_ACTION } from "./move";

/**
 * Moves a unit along a path of terrain, one square at a time, by handing each square to the single-square move service.
 * The whole path must fit within the unit's move range, and a unit that has moved cannot move again.
 *
 * An enemy on the next square of the path interrupts the move: the unit stops where it is, spends only the fuel of the
 * squares it moved through, and still counts as moved, even when it never left its square.
 */
export class MultiMoveActionService implements ActionService<MultiMoveActionInput, MultiMoveActionOutput> {
  constructor(
    private moveService: ActionService<MoveActionInput, MoveActionOutput>,
    private definitionService: DefinitionService,
    private objectService: ObjectService,
  ) {}

  canExecute(input: MultiMoveActionInput): boolean {
    return this._plan(input) !== undefined;
  }

  preview(input: MultiMoveActionInput): MultiMoveActionOutput | undefined {
    return this._act(input, false);
  }

  execute(input: MultiMoveActionInput): MultiMoveActionOutput | undefined {
    return this._act(input, true);
  }

  private _act(input: MultiMoveActionInput, commit: boolean): MultiMoveActionOutput | undefined {
    const multiMove = this._plan(input);
    if (!multiMove) {
      return undefined;
    }

    const result = this._preview(multiMove);
    if (commit) {
      this._commit(result);
    }
    const stop = result.steps.at(-1)?.input.target ?? result.start;
    return { definition: input.definition, cost: this.sumCost(result.steps), terrainId: stop.identifier.id };
  }

  private _plan(input: MultiMoveActionInput): MultiMoveInstance | undefined {
    const { game, unit, path } = input;
    if (unit.moved || path.length === 0) {
      return undefined;
    }

    const definition = this.definitionService.get<UnitDefinition>(unit.definition);
    const start = this.getTerrain(game.identifier.id, unit.position);
    if (!definition || !start) {
      return undefined;
    }

    const steps: MoveInstance[] = [];
    let walker = unit;
    for (const target of path) {
      const step: MoveActionInput = { definition: MOVE_ACTION, game, unit: walker, target };
      const output = this.moveService.preview(step);
      if (!output) {
        return undefined;
      }
      steps.push({ input: step, cost: output.cost });
      walker = this.moveUnit(walker, target.position, output.cost);
    }
    if (this.sumCost(steps) > definition.moveMax) {
      return undefined;
    }

    return { input, start, steps, enemyPositions: this.getEnemyPositionsFromGame(game.identifier.id, unit.playerId) };
  }

  private getTerrain(gameId: string, { x, y }: Position): TerrainObject | undefined {
    return [...this.objectService.loadAll<TerrainObject>(Scope.Terrain).values()].find(
      ({ identifier, position }) => identifier.gameId === gameId && position.x === x && position.y === y,
    );
  }

  private moveUnit(unit: UnitObject, position: Position, cost: number): UnitObject {
    return { ...unit, position: { ...position }, fuel: unit.fuel - cost };
  }

  private sumCost(steps: MoveInstance[]): number {
    return steps.reduce((total, { cost }) => total + cost, 0);
  }

  private getEnemyPositionsFromGame(gameId: string, playerId: string): Position[] {
    return [...this.objectService.loadAll<UnitObject>(Scope.Unit).values()]
      .filter((unit) => unit.identifier.gameId === gameId && unit.playerId !== playerId)
      .map(({ position }) => ({ ...position }));
  }

  private _preview(multiMove: MultiMoveInstance): MultiMoveInstance {
    const { input, steps, enemyPositions } = multiMove;
    const taken: MoveInstance[] = [];
    for (const step of steps) {
      if (this.hasEnemy(step.input.target.position, enemyPositions)) {
        break;
      }
      taken.push(step);
    }
    const unit = taken.reduce((walker, { input: { target }, cost }) => this.moveUnit(walker, target.position, cost), input.unit);
    return { ...multiMove, steps: taken, input: { ...input, unit: { ...unit, moved: true } } };
  }

  private hasEnemy({ x, y }: Position, enemyPositions: Position[]): boolean {
    return enemyPositions.some((position) => position.x === x && position.y === y);
  }

  private _commit({ input: { unit }, steps }: MultiMoveInstance): void {
    for (const { input } of steps) {
      this.moveService.execute(input);
    }
    this.objectService.save<UnitObject>(Scope.Unit, unit);
  }
};
