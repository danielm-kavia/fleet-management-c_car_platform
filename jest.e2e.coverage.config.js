"use strict";

/**
 * Jest config for SWE.6 E2E coverage suite.
 */
module.exports = {
  displayName: "e2e-coverage",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/e2e"],
  testMatch: ["**/*.spec.js"],
  testTimeout: 60000,

  // Coverage artifacts (note: spawned subprocess services are not instrumented by Jest by default).
  collectCoverage: true,
  // Keep this broad but local to this container; E2E primarily qualifies behavior, not per-service coverage.
  collectCoverageFrom: ["<rootDir>/src/**/*.js"],
  coverageDirectory: "<rootDir>/coverage-e2e",
  coverageReporters: ["lcov", "html", "text-summary"],

  globalSetup: "<rootDir>/tests/e2e/harness/jestGlobalSetup.js",
  globalTeardown: "<rootDir>/tests/e2e/harness/jestGlobalTeardown.js",

  // Ensure the junit output directory exists.
  setupFilesAfterEnv: ["<rootDir>/tests/e2e/harness/ensureJunitDir.js"],

  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "<rootDir>/../kavia-docs/TestReports/qualification/E2E/junit",
        outputName: "junit.e2e.coverage.xml",
        addFileAttribute: "true",
        suiteName: "@connected-car/qualification SWE.6 E2E (coverage)",
      },
    ],
  ],
};
