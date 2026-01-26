"use strict";

const { startServicesForE2ETests } = require("./serviceHarness");

/**
 * PUBLIC_INTERFACE
 * Jest globalSetup for the SWE.6 E2E qualification suite.
 *
 * Starts required platform services on deterministic E2E test ports, waits for readiness,
 * and sets base URLs in process.env for test processes.
 *
 * @returns {Promise<void>}
 */
module.exports = async function globalSetup() {
  const { envForTests } = await startServicesForE2ETests();

  for (const [k, v] of Object.entries(envForTests)) {
    process.env[k] = v;
  }
};
