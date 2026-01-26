"use strict";

const { stopServicesForE2ETests } = require("./serviceHarness");

/**
 * PUBLIC_INTERFACE
 * Jest globalTeardown for the SWE.6 E2E qualification suite.
 *
 * Ensures clean shutdown by killing child processes started in globalSetup.
 *
 * @returns {Promise<void>}
 */
module.exports = async function globalTeardown() {
  await stopServicesForE2ETests();
};
