import {
  type DefinitionKey,
  type GameObject,
  type MovementDefinition,
  type MovementObject,
  type OffenseDefinition,
  type OffenseObject,
  type PlayerObject,
  Scope,
  type TerrainObject,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { sameKey } from "../definition";
import { getAttackDamage, getMoveCost } from "./getters";

/**
 * Check if a target unit is within the attack range of an offense.
 * 
 * @param unit attacker with its position
 * @param target defender with its position
 * @param definition offense that contains the min and max range
 * @returns `true` if the target is within the offense definition range, `false` otherwise
 */
export function inAttackRange(unit: UnitObject, target: UnitObject, definition: OffenseDefinition): boolean {
  const distance = Math.abs(unit.position.x - target.position.x) + Math.abs(unit.position.y - target.position.y);
  return distance >= definition.rangeMin && distance <= definition.rangeMax;
}

/**
 * Check if a unit can successfully attack a target unit with a given offense and its definition.
 * 
 * An attack is valid if:
 * - The attacking unit has not already acted this turn
 * - The offense can damage the target unit (damage > 0)
 * - The target unit is within the offense definition min and max ranges
 * - The offense has at least 1 ammo remaining
 * 
 * @param unit attacker with its position 
 * @param target defender with its position
 * @param offense chosen offense with its ammo count
 * @param definition offense that contains the min and max range
 * @returns `true` if the attack is valid, `false` otherwise
 */
export function canAttack(unit: UnitObject, target: UnitObject, offense: OffenseObject, definition: OffenseDefinition): boolean {
  const damage = getAttackDamage(definition, target);
  if (unit.acted) {
    return false;
  }
  if (damage === undefined || damage <= 0) {
    return false;
  }
  if (!inAttackRange(unit, target, definition)) {
    return false;
  }
  if (offense.ammo < 1) {
    return false;
  }
  return true;
};

/**
 * Check if a target terrain is within a single tile move range of a unit.
 * 
 * @param unit mover with its position
 * @param target terrain with its position
 * @returns `true` if the target is within the move range, `false` otherwise
 */
export function inMoveRange(unit: UnitObject, target: TerrainObject): boolean {
  const distance = Math.abs(unit.position.x - target.position.x) + Math.abs(unit.position.y - target.position.y);
  return distance === 1;
}

/**
 * Check if a unit can successfully move to a target terrain with a given movement and its definition.
 * 
 * A move is valid if:
 * - The moving unit has not already moved this turn
 * - The moving unit has not already acted this turn: a unit moves before it acts, never after
 * - The terrain can be moved to by the unit (cost is defined)
 * - The moving unit has enough fuel to make the move
 * - The target terrain is adjacent to the moving unit
 * - The target terrain does not contain an enemy unit
 *
 * @param unit mover with its position
 * @param target terrain with its position
 * @param movement unit movement with its fuel count
 * @param definition movement that contains the fuel cost mappings
 * @param other unit on the target terrain, or `undefined` if the terrain is empty
 * @returns `true` if the move is valid, `false` otherwise
 */
export function canMove(unit: UnitObject, target: TerrainObject, movement: MovementObject, definition: MovementDefinition, other: UnitObject | undefined): boolean {
  const cost = getMoveCost(definition, target);
  if (unit.moved || unit.acted) {
    return false;
  }
  if (cost === undefined || cost > movement.fuel) {
    return false;
  }
  if (!inMoveRange(unit, target)) {
    return false;
  }
  if (other && other.playerId !== unit.playerId) {
    return false;
  }
  return true;
};

export function canDeploy(game: GameObject, player: PlayerObject, terrain: TerrainObject, definition: UnitDefinition): boolean {
  if (player.order !== game.playerTurn) {
    return false;
  }
  if (terrain.playerId !== player.identifier.id) {
    return false;
  }
  if (player.funds < definition.fundsCost) {
    return false;
  }
  return true;
};

export function canCapture(unit: UnitObject, target: TerrainObject, capturable: boolean): boolean {
  if (unit.acted) {
    return false;
  }
  if (!capturable) {
    return false;
  }
  if (unit.position.x !== target.position.x || unit.position.y !== target.position.y) {
    return false;
  }
  if (unit.playerId === target.playerId) {
    return false;
  }
  return true;
};

export function hasAction(actions: DefinitionKey[], action: DefinitionKey): boolean {
  return actions.some((key) => sameKey(key, action));
};

export function nextId(scope : Scope, ids: string[]): string {
  const pattern = new RegExp(`^${scope}-(\\d+)$`);
  const numbers = ids.map((id) => pattern.exec(id)).flatMap((match) => (match ? [Number(match[1])] : []));
  return `${scope}-${Math.max(0, ...numbers) + 1}`;
};

export function nextUnitId(ids: string[]): string {
  return nextId(Scope.Unit, ids);
};

export function nextMovementId(ids: string[]): string {
  return nextId(Scope.Movement, ids);
};

export function nextOffenseId(ids: string[]): string {
  return nextId(Scope.Offense, ids);
};
