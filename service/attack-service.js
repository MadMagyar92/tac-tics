import damageTarget from './attack-app-service';
import { canTarget } from './attack-config-service';

function attackTarget(unit, target) {
   return {
      ...target,
      health: damageTarget(unit, target),
   };
}

export default function attack(unit, target) {
   const { type: { attackType }, ammo } = unit;
   const { type: { unitType }} = target;
   if (ammo <= 0 || !canTarget(attackType, unitType)) return target;
   return attackTarget(unit, target);
}