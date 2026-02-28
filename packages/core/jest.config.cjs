/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: 'tsconfig.json',
    }],
  },
  moduleNameMapper: {
    '^@proc-geo/core$': '<rootDir>/src/index.ts',
    '^@proc-geo/core/(.*)$': '<rootDir>/src/$1',
    '^@proc-geo/test-fixtures$': '<rootDir>/../test-fixtures/src/index.ts',
    '^@proc-geo/test-fixtures/(.*)$': '<rootDir>/../test-fixtures/src/$1',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
};
