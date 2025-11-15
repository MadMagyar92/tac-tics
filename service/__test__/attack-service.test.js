    // attack-service.test.js
    import attack from '../attack-service';

    describe('attack function', () => {
      test('100 health soldier attacks 100 health soldier', () => {
        expect(attack({
         type: {
            attackType: 'melee',
            unitType: 'soldier',
         },
         health: 100,
         ammo: 1,
        }, {
         type: {
            unitType: 'soldier',
         },
         health: 100,
        })).toStrictEqual({
         type: {
            unitType: 'soldier',
         },
         health: 50,
        });
      });

      test('10 health soldier attacks 100 health soldier', () => {
        expect(attack({
         type: {
            attackType: 'melee',
            unitType: 'soldier',
         },
         health: 10,
         ammo: 1,
        }, {
         type: {
            unitType: 'soldier',
         },
         health: 100,
        })).toStrictEqual({
         type: {
            unitType: 'soldier',
         },
         health: 95,
        });
      });
      test('100 health soldier attacks 100 health soldier with no ammo', () => {
         expect(attack({
          type: {
             attackType: 'melee',
             unitType: 'soldier',
          },
          health: 100,
          ammo: 0,
         }, {
          type: {
             unitType: 'soldier',
          },
          health: 100,
         })).toStrictEqual({
          type: {
             unitType: 'soldier',
          },
          health: 100,
         });
       }); 
    });
