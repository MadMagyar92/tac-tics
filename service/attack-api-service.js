import { calculateDamage, hasAmmo, inRange } from './attack-app-service';
import { canTarget } from './attack-config-service';

function _reduceAmmo(attackType, unit) {
   const { ammo } = unit; // TODO: use attack type
   return {
      ...unit,
      ammo: ammo - 1,
   };
}

function _reduceHealth(attackType, unit, target) {
   const { health } = target;
   return {
      ...target,
      health: health - calculateDamage(attackType, unit, target),
   };
}

// TODO: determine attack type algorithmically
function _attack(unit, target) {
   const { type: { attackType }} = unit;
   return attack(attackType, unit, target);
}

/**
 * There are three core validations that must be met for an attack to be executed:
 * 1. (hasAmmo) The unit must have enough ammo to execute the attack.
 * 2. (inRange) The unit must be within range of the target for the attack to hit.
 * 3. (canTarget) The target must be valid for the type of attack and unit.
 * 
 * All three validations can be implemented and overridden by the app. The third
 * validation (canTarget) is the most flexible and can be used to implement custom
 * target validation logic.
 * 
 * @param {*} attackType type of attack to be executed
 * @param {*} unit the attacking unit
 * @param {*} target the defending unit
 * @returns {*} { unit, target } the updated unit and target
 */
export default function attack(attackType, unit, target) {
   if (hasAmmo(attackType, unit) && inRange(attackType, unit, target) && canTarget(attackType, unit, target)) {
      return {
         "unit": _reduceAmmo(attackType, unit),
         "target": _reduceHealth(attackType, unit, target),
      };
   }

   // pass through if the attack cannot be executed
   return {
      "unit": unit,
      "target": target,
   };
}