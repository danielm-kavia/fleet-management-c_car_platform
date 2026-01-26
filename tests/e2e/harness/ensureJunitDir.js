"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Jest setup file to ensure JUnit output directory exists.
 *
 * PUBLIC_INTERFACE
 */
module.exports = () => {
  const outDir = path.resolve(__dirname, "../../../../kavia-docs/TestReports/qualification/E2E/junit");
  fs.mkdirSync(outDir, { recursive: true });
};
