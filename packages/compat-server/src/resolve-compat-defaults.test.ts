import { afterEach, describe, expect, it } from "vitest";

import { resolveEveCompatDefaults } from "./resolve-compat-defaults.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalBearer = process.env.EVE_AUTH_BEARER;
const originalPersistence = process.env.EVE_JOURNAL_PERSISTENCE;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalBearer === undefined) delete process.env.EVE_AUTH_BEARER;
  else process.env.EVE_AUTH_BEARER = originalBearer;
  if (originalPersistence === undefined) delete process.env.EVE_JOURNAL_PERSISTENCE;
  else process.env.EVE_JOURNAL_PERSISTENCE = originalPersistence;
});

describe("resolveEveCompatDefaults", () => {
  it("bundles production auth and journal persistence from env", () => {
    process.env.NODE_ENV = "production";
    process.env.EVE_AUTH_BEARER = "secret";
    process.env.EVE_JOURNAL_PERSISTENCE = "memory";

    const defaults = resolveEveCompatDefaults();
    expect(defaults.auth).toEqual({ bearer: "secret" });
    expect(defaults.persistence).toBeDefined();
  });

  it("returns local-dev auth and no persistence by default in development", () => {
    process.env.NODE_ENV = "development";
    delete process.env.EVE_AUTH_BEARER;
    delete process.env.EVE_JOURNAL_PERSISTENCE;

    const defaults = resolveEveCompatDefaults();
    expect(defaults.auth).toBe("local-dev");
    expect(defaults.persistence).toBeUndefined();
  });
});