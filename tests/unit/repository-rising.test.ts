import { describe, expect, test } from "vitest";
import { selectRisingBaseline } from "../../src/repositories/rising";

const observation = (observedAt: string) => ({
  observedAt: new Date(observedAt),
});

describe("GitHub Rising sampling window", () => {
  test("uses a baseline within the declared seven-day sampling tolerance", () => {
    const history = [
      observation("2026-08-29T18:00:00.000Z"),
      observation("2026-08-30T15:10:00.000Z"),
    ];
    expect(
      selectRisingBaseline(
        history,
        new Date("2026-09-06T15:10:00.000Z"),
        ({ observedAt }) => observedAt,
      )?.observedAt.toISOString(),
    ).toBe("2026-08-30T15:10:00.000Z");
  });

  test("does not present a stale observation as seven-day growth", () => {
    const history = [observation("2026-08-20T15:10:00.000Z")];
    expect(
      selectRisingBaseline(
        history,
        new Date("2026-09-06T15:10:00.000Z"),
        ({ observedAt }) => observedAt,
      ),
    ).toBeNull();
  });
});
