/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.test.json',
      },
    ],
  },
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/db/migrate.ts', '!src/db/seed*.ts'],
  // Integration tests share a single test database — run sequentially.
  maxWorkers: 1,
};

module.exports = config;
