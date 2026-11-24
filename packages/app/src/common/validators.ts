import {
  type CaptureAllowedDefinition,
  type DefinitionKey,
  type GameObject,
  type GameReferenceId,
  type Id,
  type MapReferenceId,
  type MovementDefinition,
  type MovementObject,
  type OffenseDefinition,
  type OffenseObject,
  type OutpostObject,
  type PlayerObject,
  type TerrainObject,
  type TransportAllowedDefinition,
  type UnitDefinition,
  type UnitObject,
} from "@tac-tics/api";
import { getAttackDamage, getMoveCost } from "./getters";

/**
 * Check if a value is a plain object, whose members can be read by name.
 * Lists and `null` are left out, though both are objects too.
 *
 * @param value anything at all
 * @returns `true` if the value is an object that is neither `null` nor a list, `false` otherwise
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * Check if a value is a string that holds at least one character.
 * Only the length is compared, so a string of spaces counts.
 *
 * @param value anything at all
 * @returns `true` if the value is a string that is not empty, `false` otherwise
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
};

/**
 * Check if a value is the identifier of an object, with an id that is a string.
 * Only the id is compared, so any other member the identifier holds, such as a game id, is left out.
 *
 * @param value anything at all
 * @returns `true` if the value is a plain object whose id is a string, `false` otherwise
 */
export function isId(value: unknown): value is Id {
  return isPlainObject(value) && typeof value.id === "string";
};

/**
 * Check if a value is a definition key, with a scope and a name that are strings.
 * Only the scope and the name are compared, so any other member the key holds is left out.
 *
 * @param value anything at all
 * @returns `true` if the value is a plain object whose scope and name are strings, `false` otherwise
 */
export function isDefinitionKey(value: unknown): value is DefinitionKey {
  return isPlainObject(value) && typeof value.scope === "string" && typeof value.name === "string";
};

/**
 * Check if two definition keys name the same definition.
 * Only the scope and the name are compared, so anything else either key holds is left out.
 *
 * @param a first key with its scope and name
 * @param b second key with its scope and name
 * @returns `true` if both keys have the same scope and the same name, `false` otherwise
 */
export function sameKey(a: DefinitionKey, b: DefinitionKey): boolean {
  return a.scope === b.scope && a.name === b.name;
};

export function isInGame(gameId: string, mapId: string, identifier: GameReferenceId | MapReferenceId): boolean {
  return "gameId" in identifier ? identifier.gameId === gameId : identifier.mapId === mapId;
};

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
export function inMoveRange(unit: UnitObject, target: TerrainObject | OutpostObject): boolean {
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
export function canMove(unit: UnitObject, target: TerrainObject | OutpostObject, movement: MovementObject, definition: MovementDefinition, other: UnitObject | undefined): boolean {
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

export function canDeploy(game: GameObject, player: PlayerObject, terrain: TerrainObject | OutpostObject, definition: UnitDefinition): boolean {
  if (player.order !== game.playerTurn) {
    return false;
  }
  if (!("playerId" in terrain) || terrain.playerId !== player.identifier.id) {
    return false;
  }
  if (player.funds < definition.fundsCost) {
    return false;
  }
  return true;
};

/**
 * Check if a unit can capture a target outpost with the allowed outposts of the unit's capture definition.
 *
 * A capture is valid if:
 * - The capturing unit has not already acted this turn
 * - The capture definition allows the target outpost's definition
 * - The capturing unit stands on the target outpost
 * - The target outpost does not already belong to the capturing unit's player
 *
 * @param unit capturer with its position
 * @param target outpost with its position and the player that holds it
 * @param allowed outposts the capture definition allows
 * @returns `true` if the capture is valid, `false` otherwise
 */
export function canCapture(unit: UnitObject, target: OutpostObject, allowed: CaptureAllowedDefinition[]): boolean {
  if (unit.acted) {
    return false;
  }
  if (!allowed.some(({ outpost }) => sameKey(outpost, target.definition))) {
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

/**
 * Check if a unit is loaded in any carrier from a list of units.
 * Only the ids are compared, so the list should hold the units of a single game.
 *
 * @param units units to look through for the carrier
 * @param unitId id of the unit that may be loaded
 * @returns `true` if a unit in the list transports the unit, `false` otherwise
 */
export function isLoaded(units: UnitObject[], unitId: string): boolean {
  return units.some(({ transportIds }) => transportIds.includes(unitId));
};

/**
 * Check if a unit can load into a target carrier with the allowed units and max units of the carrier's transport definition.
 *
 * A load is valid if:
 * - The loading unit has not already acted this turn
 * - The loading unit is not the carrier itself
 * - The carrier is an ally: both units belong to the same player
 * - The loading unit stands on the carrier's square
 * - The transport definition allows the loading unit's definition
 * - The carrier transports fewer units than the transport definition's max
 *
 * @param unit loader with its position
 * @param target carrier with its position and the units it transports
 * @param allowed units the transport definition allows
 * @param maxUnits most units the transport definition holds at once
 * @returns `true` if the load is valid, `false` otherwise
 */
export function canLoad(unit: UnitObject, target: UnitObject, allowed: TransportAllowedDefinition[], maxUnits: number): boolean {
  if (unit.acted) {
    return false;
  }
  if (unit.identifier.id === target.identifier.id) {
    return false;
  }
  if (unit.playerId !== target.playerId) {
    return false;
  }
  if (unit.position.x !== target.position.x || unit.position.y !== target.position.y) {
    return false;
  }
  if (!allowed.some(({ unit: key }) => sameKey(key, unit.definition))) {
    return false;
  }
  if (target.transportIds.length >= maxUnits) {
    return false;
  }
  return true;
};

/**
 * Check if a carrier can unload a unit onto a target terrain with the unloaded unit's movement definition.
 *
 * An unload is valid if:
 * - The carrier has not already acted this turn
 * - The target terrain is adjacent to the carrier
 * - The target terrain can be moved to by the unloaded unit (cost is defined)
 * - The target terrain does not contain another unit
 *
 * @param unit carrier with its position
 * @param target terrain with its position
 * @param definition movement of the unloaded unit that contains the fuel cost mappings
 * @param occupied `true` if another unit is on the target terrain, `false` if it is empty
 * @returns `true` if the unload is valid, `false` otherwise
 */
export function canUnload(unit: UnitObject, target: TerrainObject | OutpostObject, definition: MovementDefinition, occupied: boolean): boolean {
  if (unit.acted) {
    return false;
  }
  if (!inMoveRange(unit, target)) {
    return false;
  }
  if (getMoveCost(definition, target) === undefined) {
    return false;
  }
  if (occupied) {
    return false;
  }
  return true;
};
