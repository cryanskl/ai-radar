type ClusterEventType =
  "announces" | "updates" | "changes_price_of" | "deprecates";

type ClusterSourceItem = {
  externalId: string;
  externalIdVerified: boolean;
  canonicalUrl: string;
};

type CandidateAssessmentInput = {
  eventType: ClusterEventType;
  occurredAt: string;
  sourceItems: ClusterSourceItem[];
  entityPublicIds: string[];
  candidateEventType: ClusterEventType;
  candidateOccurredAt: string;
  candidateSourceItems: ClusterSourceItem[];
  candidateEntityPublicIds: string[];
};

const intersection = (left: string[], right: string[]) => {
  const rightValues = new Set(right);
  return [...new Set(left.filter((value) => rightValues.has(value)))].sort();
};

export const assessEventCandidate = (input: CandidateAssessmentInput) => {
  if (input.eventType !== input.candidateEventType) return null;

  const timeDistanceMinutes = Math.round(
    Math.abs(
      new Date(input.occurredAt).getTime() -
        new Date(input.candidateOccurredAt).getTime(),
    ) / 60_000,
  );
  if (timeDistanceMinutes > 72 * 60) return null;

  const verifiedExternalIds = intersection(
    input.sourceItems
      .filter(({ externalIdVerified }) => externalIdVerified)
      .map(({ externalId }) => externalId),
    input.candidateSourceItems
      .filter(({ externalIdVerified }) => externalIdVerified)
      .map(({ externalId }) => externalId),
  );
  const canonicalUrls = intersection(
    input.sourceItems.map(({ canonicalUrl }) => canonicalUrl),
    input.candidateSourceItems.map(({ canonicalUrl }) => canonicalUrl),
  );
  const sharedEntityPublicIds = intersection(
    input.entityPublicIds,
    input.candidateEntityPublicIds,
  );
  if (
    verifiedExternalIds.length === 0 &&
    canonicalUrls.length === 0 &&
    sharedEntityPublicIds.length === 0
  ) {
    return null;
  }

  const confidence = Math.min(
    100,
    (verifiedExternalIds.length > 0 ? 40 : 0) +
      (canonicalUrls.length > 0 ? 35 : 0) +
      (sharedEntityPublicIds.length > 0 ? 25 : 0) +
      (timeDistanceMinutes <= 24 * 60 ? 20 : 10),
  );
  const highImpact = ["changes_price_of", "deprecates"].includes(
    input.eventType,
  );

  return {
    confidence,
    highImpact,
    requiresOwnerReview: highImpact || confidence < 80,
    signals: {
      verifiedExternalIds,
      canonicalUrls,
      timeDistanceMinutes,
      sharedEntityPublicIds,
    },
  };
};
