"use strict";

/**
 * PUBLIC_INTERFACE
 * Load Fleet Management service configuration from environment variables.
 * No .env file is read directly here; process.env is assumed to be populated by runtime/preview tooling.
 *
 * @returns {{
 *   serviceName: string,
 *   host: string,
 *   port: number,
 *   logLevel: string,
 *   store: { mode: "memory"|"file", filePath: string },
 *   auth: { required: boolean, issuer?: string, audience?: string|string[], clockToleranceSeconds: number }
 * }}
 */
function loadConfig() {
  function env(name, fallback) {
    return process.env[name] !== undefined ? process.env[name] : fallback;
  }

  function parseBool(value, fallback) {
    if (value === undefined) return fallback;
    const v = String(value).toLowerCase().trim();
    if (["1", "true", "yes", "y", "on"].includes(v)) return true;
    if (["0", "false", "no", "n", "off"].includes(v)) return false;
    return fallback;
  }

  const authRequired = parseBool(env("AUTH_REQUIRED", "true"), true);

  // JWT audience can be a comma-separated list
  const audRaw = String(env("JWT_AUDIENCE", "") || "").trim();
  const audience =
    audRaw && audRaw.includes(",")
      ? audRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : audRaw || undefined;

  return {
    serviceName: "fleet-management",
    host: env("HOST", "0.0.0.0"),
    port: Number(env("PORT", "3010")),
    logLevel: env("LOG_LEVEL", "info"),
    store: {
      mode: env("STORE_MODE", "file") === "memory" ? "memory" : "file",
      filePath: env("STORE_FILE_PATH", "./data/store.json"),
    },
    auth: {
      required: authRequired,
      issuer: String(env("JWT_ISSUER", "") || "").trim() || undefined,
      audience,
      clockToleranceSeconds: Number(env("JWT_CLOCK_TOLERANCE_SECONDS", "0")),
    },
  };
}

module.exports = { loadConfig };
