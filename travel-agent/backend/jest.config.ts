import type { Config } from 'jest';

const config: Config = {
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
        tsconfig: {
          rootDir: '.',
          outDir: 'dist',
        },
      },
    ],
  },
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/db/migrate.ts'],
};

export default config;
