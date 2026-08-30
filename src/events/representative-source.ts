export type RepresentativeSource = {
  sourceItemId: string;
  sourceItemPublicId: string;
  sourceTier: "S" | "A" | "B" | "C";
  publishedAt: Date;
  isOriginalSource: boolean;
};

const sourceTierRank = { S: 0, A: 1, B: 2, C: 3 } as const;

export const selectRepresentativeSource = <T extends RepresentativeSource>(
  links: T[],
) =>
  [...links].sort(
    (left, right) =>
      Number(right.isOriginalSource) - Number(left.isOriginalSource) ||
      sourceTierRank[left.sourceTier] - sourceTierRank[right.sourceTier] ||
      left.publishedAt.getTime() - right.publishedAt.getTime() ||
      left.sourceItemPublicId.localeCompare(right.sourceItemPublicId),
  )[0];

export const eventEvidenceConfidence = (
  links: Array<Pick<RepresentativeSource, "sourceTier">>,
) => {
  const bestTier = links
    .map(({ sourceTier }) => sourceTierRank[sourceTier])
    .sort((left, right) => left - right)[0];
  if (bestTier === 0) return "high" as const;
  if (bestTier === 1) return "medium" as const;
  return "low" as const;
};
