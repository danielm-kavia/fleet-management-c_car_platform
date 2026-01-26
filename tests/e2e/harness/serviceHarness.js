"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const { httpJson } = require("../helpers/httpClient");

const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 250;

/**
 * Resolve repository root from:
 * fleet-management-c_car_platform/tests/e2e/harness/serviceHarness.js
 * -> repo root is 3 levels up from fleet-management-c_car_platform
 */
function repoRootFromHere() {
  return path.resolve(__dirname, "../../../..");
}

function pidFilePath() {
  return path.join(os.tmpdir(), "connected-car-e2e-harness-pids.swe6.json");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * PUBLIC_INTERFACE
 * Compute deterministic SWE.6 E2E ports and base URLs.
 *
 * Defaults (chosen to avoid collisions with existing integration harnesses):
 * - vehicle-state: 3401 (env VS_E2E_PORT)
 * - telematics-ingestion: 3402 (env TI_E2E_PORT)
 * - vehicle-gateway: 3404 (env GW_E2E_PORT)
 * - remote-commands: 3406 (env RC_E2E_PORT)
 * - fleet-management: 3410 (env FM_E2E_PORT)
 *
 * @returns {{
 *  VEHICLE_STATE_BASE_URL: string,
 *  TELEMATICS_INGESTION_BASE_URL: string,
 *  VEHICLE_GATEWAY_BASE_URL: string,
 *  REMOTE_COMMANDS_BASE_URL: string,
 *  FLEET_MANAGEMENT_BASE_URL: string,
 *  ports: { vs: number, ti: number, gw: number, rc: number, fm: number }
 * }}
 */
function buildHarnessEnv() {
  const vs = Number(process.env.VS_E2E_PORT || 3401);
  const ti = Number(process.env.TI_E2E_PORT || 3402);
  const gw = Number(process.env.GW_E2E_PORT || 3404);
  const rc = Number(process.env.RC_E2E_PORT || 3406);
  const fm = Number(process.env.FM_E2E_PORT || 3410);

  return {
    VEHICLE_STATE_BASE_URL: `http://127.0.0.1:${vs}`,
    TELEMATICS_INGESTION_BASE_URL: `http://127.0.0.1:${ti}`,
    VEHICLE_GATEWAY_BASE_URL: `http://127.0.0.1:${gw}`,
    REMOTE_COMMANDS_BASE_URL: `http://127.0.0.1:${rc}`,
    FLEET_MANAGEMENT_BASE_URL: `http://127.0.0.1:${fm}`,
    ports: { vs, ti, gw, rc, fm },
  };
}

async function waitForHealthy(baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;

  while (Date.now() < deadline) {
    try {
      const res = await httpJson(`${baseUrl}/health`, { method: "GET", timeoutMs: 1500 });
      if (res.status === 200) return;
      lastErr = new Error(`Non-200 health status: ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  const msg = lastErr ? String(lastErr && lastErr.message ? lastErr.message : lastErr) : "unknown error";
  throw new Error(`Service at ${baseUrl} did not become healthy within ${timeoutMs}ms (${msg})`);
}

function spawnService({ name, cwd, env, nodeArgs }) {
  const child = spawn(process.execPath, nodeArgs, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Prefix logs for CI debugging.
  child.stdout.on("data", (d) => process.stdout.write(`[${name}] ${String(d)}`));
  child.stderr.on("data", (d) => process.stderr.write(`[${name}] ${String(d)}`));

  child.on("exit", (code, signal) => {
    process.stderr.write(`[${name}] exited (code=${code}, signal=${signal})\n`);
  });

  return child;
}

/**
 * PUBLIC_INTERFACE
 * Start all services required for SWE.6 E2E and wait until healthy.
 *
 * Environment profile goals:
 * - deterministic local ports
 * - no external infrastructure required (Kafka/Timescale disabled)
 * - in-memory stores where available
 * - auth behavior is configurable; default is AUTH_REQUIRED=false for determinism
 *
 * @returns {Promise<{ pids: number[], envForTests: Record<string,string> }>}
 */
async function startServicesForE2ETests() {
  const repoRoot = repoRootFromHere();

  const vsRoot = path.join(repoRoot, "vehicle-state-c_car_platform");
  const tiRoot = path.join(repoRoot, "telematics-ingestion-c_car_platform");
  const gwRoot = path.join(repoRoot, "vehicle-gateway-c_car_platform");
  const rcRoot = path.join(repoRoot, "remote-commands-c_car_platform");
  const fmRoot = path.join(repoRoot, "fleet-management-c_car_platform");

  const {
    VEHICLE_STATE_BASE_URL,
    TELEMATICS_INGESTION_BASE_URL,
    VEHICLE_GATEWAY_BASE_URL,
    REMOTE_COMMANDS_BASE_URL,
    FLEET_MANAGEMENT_BASE_URL,
    ports,
  } = buildHarnessEnv();

  const authRequired = String(process.env.AUTH_REQUIRED || "false").toLowerCase() === "true" ? "true" : "false";

  const baseEnv = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "test",

    // Base URLs consumed by tests
    VEHICLE_STATE_BASE_URL,
    TELEMATICS_INGESTION_BASE_URL,
    VEHICLE_GATEWAY_BASE_URL,
    REMOTE_COMMANDS_BASE_URL,
    FLEET_MANAGEMENT_BASE_URL,

    // External infra off for qualification baseline
    KAFKA_ENABLED: "false",
    TIMESCALE_ENABLED: "false",
  };

  const vehicleStateEnv = {
    ...baseEnv,
    SERVICE_NAME: "vehicle-state-e2e",
    HOST: "127.0.0.1",
    PORT: String(ports.vs),
    WS_ENABLED: "false",
    DOCS_ENABLED: "false",
    STATE_STORE_DRIVER: "memory",
  };

  const telematicsIngestionEnv = {
    ...baseEnv,
    SERVICE_NAME: "telematics-ingestion-e2e",
    HOST: "127.0.0.1",
    PORT: String(ports.ti),
    // default: no ingest auth secret; if set externally, the test can be adapted
    INGEST_AUTH_TOKEN: "",
  };

  const remoteCommandsEnv = {
    ...baseEnv,
    SERVICE_NAME: "remote-commands-e2e",
    HOST: "127.0.0.1",
    PORT: String(ports.rc),
    RC_STORE: "memory",
    AUTH_REQUIRED: authRequired,
    RC_USE_KAFKA: "false",
    RC_GATEWAY_HTTP_URL: VEHICLE_GATEWAY_BASE_URL,
    RC_PUBLIC_HTTP_URL: REMOTE_COMMANDS_BASE_URL,
    DOCS_ENABLED: "false",
  };

  const gatewayEnv = {
    ...baseEnv,
    SERVICE_NAME: "vehicle-gateway-e2e",
    HOST: "127.0.0.1",
    PORT: String(ports.gw),
    TELEMATICS_PUBLISH_ENABLED: "false",
    RC_ENABLED: "true",
    RC_USE_KAFKA: "false",
    RC_REMOTE_COMMANDS_HTTP_URL: REMOTE_COMMANDS_BASE_URL,
    DOCS_ENABLED: "false",
  };

  const fleetManagementEnv = {
    ...baseEnv,
    SERVICE_NAME: "fleet-management-e2e",
    HOST: "127.0.0.1",
    PORT: String(ports.fm),
    STORE_MODE: "memory",
    AUTH_REQUIRED: authRequired,
  };

  // Start dependencies first, then dependents.
  const vs = spawnService({
    name: "vehicle-state",
    cwd: vsRoot,
    env: vehicleStateEnv,
    nodeArgs: [path.join(vsRoot, "src", "server.js")],
  });

  const ti = spawnService({
    name: "telematics-ingestion",
    cwd: tiRoot,
    env: telematicsIngestionEnv,
    nodeArgs: [path.join(tiRoot, "src", "server.js")],
  });

  const rc = spawnService({
    name: "remote-commands",
    cwd: rcRoot,
    env: remoteCommandsEnv,
    nodeArgs: [path.join(rcRoot, "src", "index.js")],
  });

  const gw = spawnService({
    name: "vehicle-gateway",
    cwd: gwRoot,
    env: gatewayEnv,
    nodeArgs: [path.join(gwRoot, "src", "index.js")],
  });

  const fm = spawnService({
    name: "fleet-management",
    cwd: fmRoot,
    env: fleetManagementEnv,
    nodeArgs: [path.join(fmRoot, "src", "index.js")],
  });

  fs.writeFileSync(
    pidFilePath(),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        pids: [vs.pid, ti.pid, rc.pid, gw.pid, fm.pid].filter(Boolean),
      },
      null,
      2
    ),
    "utf-8"
  );

  // Readiness gates.
  await waitForHealthy(VEHICLE_STATE_BASE_URL, DEFAULT_TIMEOUT_MS);
  await waitForHealthy(TELEMATICS_INGESTION_BASE_URL, DEFAULT_TIMEOUT_MS);
  await waitForHealthy(REMOTE_COMMANDS_BASE_URL, DEFAULT_TIMEOUT_MS);
  await waitForHealthy(VEHICLE_GATEWAY_BASE_URL, DEFAULT_TIMEOUT_MS);
  await waitForHealthy(FLEET_MANAGEMENT_BASE_URL, DEFAULT_TIMEOUT_MS);

  return {
    pids: [vs.pid, ti.pid, rc.pid, gw.pid, fm.pid].filter(Boolean),
    envForTests: {
      VEHICLE_STATE_BASE_URL,
      TELEMATICS_INGESTION_BASE_URL,
      VEHICLE_GATEWAY_BASE_URL,
      REMOTE_COMMANDS_BASE_URL,
      FLEET_MANAGEMENT_BASE_URL,
      KAFKA_ENABLED: "false",
      TIMESCALE_ENABLED: "false",
      AUTH_REQUIRED: authRequired,
      // Helpful for tests that want deterministic ports
      VS_E2E_PORT: String(ports.vs),
      TI_E2E_PORT: String(ports.ti),
      GW_E2E_PORT: String(ports.gw),
      RC_E2E_PORT: String(ports.rc),
      FM_E2E_PORT: String(ports.fm),
    },
  };
}

/**
 * PUBLIC_INTERFACE
 * Stop services started by startServicesForE2ETests() using persisted PIDs.
 *
 * @returns {Promise<void>}
 */
async function stopServicesForE2ETests() {
  if (!fs.existsSync(pidFilePath())) return;

  /** @type {{pids?: number[]}} */
  let data;
  try {
    data = JSON.parse(fs.readFileSync(pidFilePath(), "utf-8"));
  } catch (_) {
    data = {};
  }

  const pids = Array.isArray(data.pids) ? data.pids : [];

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (_) {}
  }

  await sleep(750);

  for (const pid of pids) {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch (_) {}
  }

  try {
    fs.unlinkSync(pidFilePath());
  } catch (_) {}
}

module.exports = {
  startServicesForE2ETests,
  stopServicesForE2ETests,
  buildHarnessEnv,
};
