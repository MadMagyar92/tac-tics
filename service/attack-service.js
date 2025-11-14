// TODO: config service
function canTarget(attackType, unitType) {
   return attackType === attackType && unitType === unitType;
}

// TODO: config service
function baseDamage(unitType, targetType) {
   return 50;
}

// TODO: app impl service
function damageTarget(unit, target) {
   const { type: { unitType }, health } = unit;
   const { type: { unitType: targetType }, health: targetHealth } = target;
   return targetHealth - (health / 100) * baseDamage(unitType, targetType);
}

// TODO: advanced damage calculation
function attackTarget(unit, target) {
   return {
      ...target,
      health: damageTarget(unit, target),
   };
}

module.exports = function attack(unit, target) {
   const { ammo } = unit;
   if (ammo > 0) {
      const { type: { attackType } } = unit;
      const { type: { unitType }} = target;
      if (canTarget(attackType, unitType)) {
         return attackTarget(unit, target);  
      }
   }
   return target;
}