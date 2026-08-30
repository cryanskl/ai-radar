import { describe, expect, it } from "vitest";
import { isAllowedOwner } from "../../src/auth/owner-policy";

describe("Owner GitHub allowlist", () => {
  it("matches the immutable GitHub account ID instead of the mutable login", () => {
    expect(
      isAllowedOwner({ id: 34_471_145, login: "renamed-owner" }, "34471145"),
    ).toBe(true);
    expect(isAllowedOwner({ id: 999, login: "cryanskl" }, "34471145")).toBe(
      false,
    );
    expect(isAllowedOwner({ login: "cryanskl" }, "34471145")).toBe(false);
  });
});
