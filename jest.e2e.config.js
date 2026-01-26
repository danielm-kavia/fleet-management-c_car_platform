"use strict";

/** @type {import("jest").Config} */
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

  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "<rootDir>/../kavia-docs/TestReports/qualification/E2E/junit",
        outputName: "junit.xml",
        addFileAttribute: "true",
        suiteName: "@connected-car/qualification SWE.6 E2E",
      },
    ],
  ],
};
