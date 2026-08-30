export const risingWindowDays = 7;
export const risingSamplingToleranceDays = 1;

export const selectRisingBaseline = <T>(
  history: T[],
  latestObservedAt: Date,
  observedAt: (item: T) => Date,
) => {
  const target = new Date(
    latestObservedAt.getTime() - risingWindowDays * 86_400_000,
  );
  const earliestAccepted = new Date(
    target.getTime() - risingSamplingToleranceDays * 86_400_000,
  );
  return (
    [...history].reverse().find((item) => {
      const timestamp = observedAt(item);
      return timestamp <= target && timestamp >= earliestAccepted;
    }) ?? null
  );
};
