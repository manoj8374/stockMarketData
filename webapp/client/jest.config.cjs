module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '[.]css$': 'identity-obj-proxy',
    '(^|/)candleChart$': '<rootDir>/src/test/candleChartStub.ts',
  },
  clearMocks: true,
}
