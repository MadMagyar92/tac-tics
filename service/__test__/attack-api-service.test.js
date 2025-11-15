    // attack-service.test.js
    import attack from '../attack-api-service';

    describe('attack function', () => {
      test('100 health soldier attacks 100 health soldier', () => {
        expect(attack('melee', {
         type: {
            attackType: 'melee',
            unitType: 'soldier',
         },
         health: 100,
         ammo: 1,
         position: { x: 0, y: 0 },
        }, {
         type: {
            unitType: 'soldier',
         },
         health: 100,
         position: { x: 0, y: 1 },
        })).toStrictEqual(
         {
            "unit": {
               type: {
                  attackType: 'melee',
                  unitType: 'soldier',
               },
               health: 100,
               ammo: 0,
               position: { x: 0, y: 0 },
            },
            "target": {
               type: {
                  unitType: 'soldier',
               },
               health: 50,
               position: { x: 0, y: 1 },
            },
        });
      });

      test('10 health soldier attacks 100 health soldier', () => {
        expect(attack('melee', {
         type: {
            attackType: 'melee',
            unitType: 'soldier',
         },
         health: 10,
         ammo: 1,
         position: { x: 1, y: 1 },
        }, {
         type: {
            unitType: 'soldier',
         },
         health: 100,
         position: { x: 2, y: 1 },
        })).toStrictEqual({
         "unit": {
            type: {
               attackType: 'melee',
               unitType: 'soldier',
            },
            health: 10,
            ammo: 0,
            position: { x: 1, y: 1 },
         },
         "target": {
            type: {
               unitType: 'soldier',
            },
            health: 95,
            position: { x: 2, y: 1 },
         },
     });
   });
      test('100 health soldier attacks 100 health soldier with no ammo', () => {
         expect(attack('melee',{
          type: {
             attackType: 'melee',
             unitType: 'soldier',
          },
          health: 100,
          ammo: 0,
          position: { x: 0, y: 0 },
         }, {
          type: {
             unitType: 'soldier',
          },
          health: 100,
          position: { x: 1, y: 0 },
         })).toStrictEqual({
            "unit": {
               type: {
                  attackType: 'melee',
                  unitType: 'soldier',
               },
               health: 100,
               ammo: 0,
               position: { x: 0, y: 0 },
            },
            "target": {
               type: {
                  unitType: 'soldier',
               },
               health: 100,
               position: { x: 1, y: 0 },
           }});
       }); 
       test('10 health soldier attacks 100 health soldier out of range', () => {
         expect(attack('melee', {
          type: {
             attackType: 'melee',
             unitType: 'soldier',
          },
          health: 10,
          ammo: 1,
          position: { x: 5, y: 5 },
         }, {
          type: {
             unitType: 'soldier',
          },
          health: 100,
          position: { x: 0, y: 3 },
         })).toStrictEqual({
          "unit": {
             type: {
                attackType: 'melee',
                unitType: 'soldier',
             },
             health: 10,
             ammo: 1,
             position: { x: 5, y: 5 },
          },
          "target": {
             type: {
                unitType: 'soldier',
             },
             health: 100,
             position: { x: 0, y: 3 },
          },
      }); 
    });
  });