module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  setupFilesAfterEach: undefined,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  maxWorkers: 1,
};