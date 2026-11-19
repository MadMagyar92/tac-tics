import {
  type MovementDefinition,
  type OffenseDefinition,
  type PlayerObject,
  type Position,
  type TerrainObject,
  type UnitObject,
} from "@tac-tics/api";
import { sameKey } from "./validators";

/**
 * Get the damage value for a given offense definition against a target unit.
 * 
 * @param definition offense that contains all target damage mappings
 * @param target unit to apply the offense damage against
 * @returns the base attack damage, or `undefined` if the offense cannot damage the target
 */
export function getAttackDamage(definition: OffenseDefinition, target: UnitObject): number | undefined {
    return definition.damage.find(({ unit: victim }) => sameKey(victim, target.definition))?.damage;
};

/**
 * Get the move fuel cost for a given movement definition against a target terrain.
 * 
 * @param definition movement that contains all target fuel mappings
 * @param target terrain to apply the movement cost against
 * @returns the base move fuel cost, or `undefined` if the unit cannot move to the given terrain
 */
export function getMoveCost(definition: MovementDefinition, target: TerrainObject): number | undefined {
  return definition.cost.find(({ terrain }: { terrain: typeof target.definition }) => sameKey(terrain, target.definition))?.cost;
};

/**
 * Get the unit standing at a position from a list of units.
 * Only the position is compared, so the list should hold the units of a single game, and the units a carrier in the list holds are left out, since they are off the map.
 * 
 * @param units units to look through
 * @param position square to look at
 * @returns the first unit at the position, or `undefined` if the square is empty
 */
export function getUnitAtPosition(units: UnitObject[], position: Position): UnitObject | undefined {
  const loaded = units.flatMap(({ transportIds }) => transportIds);
  return units.find(({ identifier, position: { x, y } }) => !loaded.includes(identifier.id) && x === position.x && y === position.y);
};

/**
 * Get the units a carrier transports from a list of units, along with the units each of those transports in turn.
 * Only the ids are compared, so the list should hold the units of a single game.
 *
 * @param units units to look through
 * @param transportIds ids of the units the carrier holds
 * @returns every unit the carrier holds, directly or through another carrier, or none if it transports no units
 */
export function getUnitsFromTransport(units: UnitObject[], transportIds: string[]): UnitObject[] {
  return units.filter(({ identifier }) => transportIds.includes(identifier.id)).flatMap((unit) => [unit, ...getUnitsFromTransport(units, unit.transportIds)]);
};

/**
 * Get the player whose order matches a turn from a list of players.
 * Only the order is compared, so the list should hold the players of a single game.
 *
 * @param players players to look through
 * @param turn order of the player taking the turn
 * @returns the first player with the order, or `undefined` if no player has it
 */
export function getPlayerFromTurn(players: PlayerObject[], turn: number): PlayerObject | undefined {
  return players.find(({ order }) => order === turn);
};
