/*
 * Get the base value for calculating damage.
 */
export function baseDamage(attackType, unit, target) {
   return 50; // TODO: determine metadata for damage
}

// TODO: determine metadata for damage calculation
export function getDamageCalculation(attackType) {
   return (health / 100) * baseDamage(attackType, unit, target);
}

// TODO: determine metadata for target validation
export function canTarget(attackType, unit, target) {
   const { type: { unitType }} = unit;
   const { type: { unitType: targetUnitType }} = target;
   return attackType === attackType && unitType === unitType && targetUnitType === targetUnitType;
}