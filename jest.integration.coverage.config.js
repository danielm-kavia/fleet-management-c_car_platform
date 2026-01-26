"use strict";

/** @type {import("jest").Config} */
module.exports = {
  displayName: "integration-coverage",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integration"],
  testMatch: ["**/*.spec.js"],
  testTimeout: 30000,

  // Coverage artifacts specifically for integration suite.
  collectCoverage: true,
  collectCoverageFrom: ["<rootDir>/src/**/*.js"],
  coverageDirectory: "<rootDir>/coverage-integration",
  coverageReporters: ["lcov", "html", "text-summary"],

  globalSetup: "<rootDir>/tests/integration/harness/jestGlobalSetup.js",
  globalTeardown: "<rootDir>/tests/integration/harness/jestGlobalTeardown.js",

  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "<rootDir>/tests/integration/junit",
        outputName: "junit.xml",
        addFileAttribute: "true",
        suiteName: "@connected-car/fleet-management integration (vehicle-state flow, coverage)",
      },
    ],
  ],
};
