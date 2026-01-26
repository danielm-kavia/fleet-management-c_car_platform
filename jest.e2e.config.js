"use strict";

const fs = require("fs");
const path = require("path");

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

  // Ensure the junit output directory exists (jest-junit does not always create it in all environments).
  setupFilesAfterEnv: [
    () => {
      const outDir = path.resolve(__dirname, "../kavia-docs/TestReports/qualification/E2E/junit");
      fs.mkdirSync(outDir, { recursive: true });
    },
  ],

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
