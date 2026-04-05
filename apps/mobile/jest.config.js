module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  clearMocks: true,
};
