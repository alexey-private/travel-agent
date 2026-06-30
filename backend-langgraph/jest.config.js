/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  globalSetup: './jest.globalSetup.js',
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
        // Type-checking is handled by `tsc --noEmit`; disabling it here avoids
        // TS2589 "type instantiation excessively deep" errors in @langchain/openai
        // that only surface during jest's coverage instrumentation pass.
        diagnostics: false,
      },
    ],
  },
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/db/migrate.ts', '!src/db/seed*.ts'],
  // Integration tests share a single test database — run sequentially.
  maxWorkers: 1,
  // Fastify registers a FinalizationRegistry (CustomGC) internally which Jest
  // incorrectly reports as an open handle. Force-exit after tests complete.
  forceExit: true,
};

module.exports = config;
