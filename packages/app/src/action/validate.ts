import type {
  GameObject,
  MovementDefinition,
  OffenseDefinition,
  OffenseObject,
  PlayerObject,
  TerrainObject,
  UnitDefinition,
  UnitObject,
} from "@tac-tics/api";
import { sameKey } from "../definition";

export function getAttackDamage(definition: OffenseDefinition, target: UnitObject): number {
    return definition.damage.find(({ unit: victim }) => sameKey(victim, target.definition))?.damage || -1;
};

export function canAttack(unit: UnitObject, target: UnitObject, offense: OffenseObject, definition: OffenseDefinition): boolean {
  const distance = Math.abs(unit.position.x - target.position.x) + Math.abs(unit.position.y - target.position.y);
  if (unit.acted) {
    return false;
  }
  if (getAttackDamage(definition, target) < 0) {
    return false;
  }
  if (distance < definition.rangeMin || distance > definition.rangeMax) {
    return false;
  }
  if (definition.ammoMax >= 0 && offense.ammo < 1) {
    return false;
  }
  return true;
};

export function getMoveCost(definition: MovementDefinition, target: TerrainObject): number {
  return definition.cost.find(({ terrain }: { terrain: typeof target.definition }) => sameKey(terrain, target.definition))?.cost ?? -1;
};

export function canMove(unit: UnitObject, target: TerrainObject, definition: UnitDefinition, movement: MovementDefinition): boolean {
  const distance = Math.abs(unit.position.x - target.position.x) + Math.abs(unit.position.y - target.position.y);
  const cost = getMoveCost(movement, target);
  if (distance !== 1) {
    return false;
  }
  if (cost < 0) {
    return false;
  }
  if (cost > definition.moveMax || cost > unit.fuel) {
    return false;
  }
  return true;
};

export function hasUnit(terrain: TerrainObject, units: UnitObject[]): boolean {
  return units.some(
    (unit) => unit.identifier.gameId === terrain.identifier.gameId && unit.position.x === terrain.position.x && unit.position.y === terrain.position.y,
  );
};

export function canDeploy(game: GameObject, player: PlayerObject, terrain: TerrainObject, definition: UnitDefinition, units: UnitObject[]): boolean {
  if (player.order !== game.playerTurn) {
    return false;
  }
  if (terrain.playerId !== player.identifier.id) {
    return false;
  }
  if (player.funds < definition.fundsCost) {
    return false;
  }
  if (hasUnit(terrain, units)) {
    return false;
  }
  return true;
};
