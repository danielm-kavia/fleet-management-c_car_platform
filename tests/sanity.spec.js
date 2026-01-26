"use strict";

const shared = require("@connected-car/shared");

describe("fleet-management baseline", () => {
  test("@connected-car/shared has security middleware exports", () => {
    expect(typeof shared.createSecurityHeadersMiddleware).toBe("function");
    expect(typeof shared.createRateLimitMiddleware).toBe("function");
  });
});
