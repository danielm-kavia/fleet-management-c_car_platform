"use strict";

/**
 * Jest config for SWE.6 E2E standard suite.
 */
module.exports = {
  displayName: "e2e",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/e2e"],
  testMatch: ["**/*.spec.js"],
  testTimeout: 60000,
  collectCoverage: false,

  // Start/stop required services for SWE.6 E2E suite.
  globalSetup: "<rootDir>/tests/e2e/harness/jestGlobalSetup.js",
  globalTeardown: "<rootDir>/tests/e2e/harness/jestGlobalTeardown.js",

  // Ensure the junit output directory exists (jest-junit does not always create it in all environments).
  // NOTE: setupFilesAfterEnv must be file paths (modules), not functions.
  setupFilesAfterEnv: ["<rootDir>/tests/e2e/harness/ensureJunitDir.js"],

  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "<rootDir>/../kavia-docs/TestReports/qualification/E2E/junit",
        outputName: "junit.e2e.xml",
        addFileAttribute: "true",
        suiteName: "@connected-car/qualification SWE.6 E2E",
      },
    ],
  ],
};
