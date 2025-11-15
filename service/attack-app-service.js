import { baseDamage } from './attack-config-service';

export default function damageTarget(unit, target) {
   const { type: { unitType }, health } = unit;
   const { type: { unitType: targetType }, health: targetHealth } = target;
   return targetHealth - (health / 100) * baseDamage(unitType, targetType);
};