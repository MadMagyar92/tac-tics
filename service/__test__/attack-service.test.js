    // attack-service.test.js
    const attack = require('../attack-service'); // Import the function to be tested

    describe('attack function', () => { // Optional: Group related tests with describe
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
    });
