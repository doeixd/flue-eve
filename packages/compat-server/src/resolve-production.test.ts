import { afterEach, describe, expect, it } from "vitest";

import { isEveAuthEnforced, resolveEveProductionOptions } from "./resolve-production.js";

describe("resolveEveProductionOptions", () => {
  const previousEnv = process.env.NODE_ENV;
  const previousBearer = process.env.EVE_AUTH_BEARER;

  afterEach(() => {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
    if (previousBearer === undefined) delete process.env.EVE_AUTH_BEARER;
    else process.env.EVE_AUTH_BEARER = previousBearer;
  });

  it("uses bearer auth when EVE_AUTH_BEARER is set", () => {
    process.env.EVE_AUTH_BEARER = "prod-secret";
    expect(resolveEveProductionOptions("production")).toEqual({ auth: { bearer: "prod-secret" } });
    expect(isEveAuthEnforced(resolveEveProductionOptions("production").auth, "production")).toBe(
      true,
    );
  });

  it("fails closed in production without EVE_AUTH_BEARER", () => {
    delete process.env.EVE_AUTH_BEARER;
    const options = resolveEveProductionOptions("production");
    expect(options.auth).toEqual({});
    expect(isEveAuthEnforced(options.auth, "production")).toBe(true);
  });

  it("allows local-dev outside production", () => {
    delete process.env.EVE_AUTH_BEARER;
    const options = resolveEveProductionOptions("development");
    expect(options.auth).toBe("local-dev");
    expect(isEveAuthEnforced(options.auth, "development")).toBe(false);
  });
});