"use strict";

const unlockRequest = require("./fixtures/remoteCommands.unlock.request.json");
const { httpJson } = require("./helpers/httpClient");

function baseUrls() {
  return {
    remoteCommands: process.env.REMOTE_COMMANDS_BASE_URL,
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll command status until terminal state or timeout.
 * Terminal: ACKED or FAILED (rejected).
 */
async function waitForCommandTerminal(remoteCommandsBaseUrl, commandId, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;

  while (Date.now() < deadline) {
    const res = await httpJson(`${remoteCommandsBaseUrl}/commands/${encodeURIComponent(commandId)}`, {
      method: "GET",
      timeoutMs: 3000,
    });

    if (res.status === 200 && res.body?.ok) {
      last = res.body.command;
      if (last?.state === "ACKED" || last?.state === "FAILED") return last;
    }

    await sleep(250);
  }

  throw new Error(`Command ${commandId} did not reach terminal state within ${timeoutMs}ms (last=${JSON.stringify(last)})`);
}

describe("SWE.6 E2E: remote command dispatch via gateway -> remote-commands lifecycle", () => {
  test("Scenario 2: unlock command reaches terminal status (submitted -> accepted/rejected)", async () => {
    const { remoteCommands } = baseUrls();
    expect(remoteCommands).toBeTruthy();

    const createRes = await httpJson(`${remoteCommands}/commands/unlock`, {
      method: "POST",
      body: unlockRequest,
      timeoutMs: 5000,
    });

    // If auth is enabled, this scenario is not applicable without credentials (handled by scenario 3).
    if (String(process.env.AUTH_REQUIRED || "false").toLowerCase() === "true") {
      expect([401, 403]).toContain(createRes.status);
      return;
    }

    expect(createRes.status).toBe(202);
    expect(createRes.body?.ok).toBe(true);
    expect(createRes.body?.command?.id).toBeTruthy();

    const commandId = createRes.body.command.id;
    const terminal = await waitForCommandTerminal(remoteCommands, commandId);

    // Accept either terminal state; in stable harness the gateway returns completed -> ACKED.
    expect(["ACKED", "FAILED"]).toContain(terminal.state);
    expect(terminal.id).toBe(commandId);
    expect(terminal.vehicleId).toBe(unlockRequest.vehicleId);
  });
});
