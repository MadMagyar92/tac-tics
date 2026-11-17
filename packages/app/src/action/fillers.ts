import { type DefinitionKey, type MovementObject, type OffenseObject, type Position, type UnitObject } from "@tac-tics/api";

/**
 * Fill a new movement for a unit.
 *
 * @param gameId game the unit is in
 * @param unitId unit the movement belongs to
 * @param id identifier of the new movement
 * @param key movement definition of the unit
 * @param fuel fuel the movement starts with
 * @returns the new movement
 */
export function fillNewMovement(gameId: string, unitId: string, id: string, key: DefinitionKey, fuel: number): MovementObject {
  return {
    identifier: { id, gameId, unitId },
    definition: { ...key },
    fuel,
  };
};

/**
 * Fill a new offense for a unit, with the ammo it starts with.
 * The key is copied, so the offense does not share it with its definition.
 *
 * @param gameId game the unit is in
 * @param unitId unit the offense belongs to
 * @param id identifier of the new offense
 * @param key offense definition of the unit
 * @param ammo ammo the offense starts with
 * @returns the new offense
 */
export function fillNewOffense(gameId: string, unitId: string, id: string, key: DefinitionKey, ammo: number): OffenseObject {
  return {
    identifier: { id, gameId, unitId },
    definition: { ...key },
    ammo,
  };
};

/**
 * Fill a new unit for a player, at full health, that has neither moved nor acted.
 * The key and position are copied, so the unit does not share them with what it was made from.
 *
 * @param gameId game the unit is in
 * @param playerId player the unit belongs to
 * @param id identifier of the new unit
 * @param key unit definition of the unit
 * @param movementId identifier of the unit's movement
 * @param offenseIds identifiers of the unit's offenses
 * @param position square the unit stands on
 * @returns the new unit
 */
export function fillNewUnit(gameId: string, playerId: string, id: string, key: DefinitionKey, movementId: string, offenseIds: string[], position: Position): UnitObject {
  return {
    identifier: { id, gameId },
    definition: { ...key },
    position: { ...position },
    moved: false,
    acted: false,
    health: 100,
    playerId,
    movementId,
    offenseIds,
  };
};
