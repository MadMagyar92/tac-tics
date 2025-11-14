module.exports = {
   testEnvironment: 'node',
   // setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
   moduleFileExtensions: ['js', 'ts'],
   // transform: {
   //  '^.+\\.(ts)$': 'ts-jest',
   //},
   testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(js|ts)$',
   collectCoverageFrom: [
     'src/**/*.{js,ts}',
     '!src/**/*.d.ts', // exclude declaration files
   ],
   cacheDirectory: '<rootDir>/.cache/jest',
   maxWorkers: '50%'
 };
 