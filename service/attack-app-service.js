import { baseDamage } from './attack-config-service';

/*
 * Does the attacking unit have enough mana to execute the attack?
 * EX:
 * - Advanced Wars (AW): Infantry needs 1 ammo to fire Rifle.
 * - Final Fantasy Tactics (FFT): Black Mage needs 12 MP to cast Fira.
 */
export function hasAmmo(attackType, unit) {
   const { ammo } = unit; // TODO: use attack type
   return ammo > 0;
};

/*
 * Is the attacking unit close enough to damage the target?
 * EX:
 * - AW: Artillery can fire Shells from 2 to 3 spaces.
 * - FFT: Black Mage can cast Fira from 1 to 4 horizontal spaces, and 1 to 2 vertical spaces.
 */
export function inRange(attackType, unit, target) {
   const { position: { x, y }} = unit; // TODO: use attack type and ranges
   const { position: { x: targetX, y: targetY }} = target;
   const xDiff = Math.abs(x - targetX);
   const yDiff = Math.abs(y - targetY);
   return (xDiff == 1 && yDiff == 0) || (xDiff == 0 && yDiff == 1);
};

/*
 * Calculate the damage done to the target.
 */
export function calculateDamage(attackType, unit, target) {
   const { type: { unitType }, health } = unit;
   const { type: { unitType: targetType }} = target;
   return (health / 100) * baseDamage(attackType, unit, target); // TODO: use attack type
}