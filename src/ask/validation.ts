import {
  askCandidateSchema,
  type AskCandidate,
  type AskEvidenceItem,
} from "./contracts";

const copy = {
  en: {
    insufficient:
      "The public AI Radar dataset does not contain enough evidence to answer this question.",
    citation:
      "I could not validate every citation against this answer's evidence pack, so I am abstaining.",
    comparison:
      "These records use incompatible benchmark or price conditions, so AI Radar will not produce a definitive comparison.",
  },
  zh: {
    insufficient: "AI Radar 公开数据集中没有足够证据回答这个问题。",
    citation: "本次回答的引用无法全部通过证据包校验，因此 AI Radar 选择拒答。",
    comparison:
      "这些记录使用了不可比的评测或价格条件，因此 AI Radar 不会给出确定比较。",
  },
} as const;

const comparisonKey = (
  basis: NonNullable<AskEvidenceItem["comparisonBasis"]>,
) => {
  if (basis.kind === "price") return JSON.stringify(basis);
  return JSON.stringify({
    ...basis,
    settings: Object.fromEntries(
      Object.entries(basis.settings).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  });
};

export const validateAskCandidate = (
  untrustedCandidate: AskCandidate,
  evidence: AskEvidenceItem[],
  locale: "en" | "zh",
) => {
  const candidate = askCandidateSchema.parse(untrustedCandidate);
  if (candidate.status === "abstained") {
    return {
      status: "abstained" as const,
      reason: "insufficient_evidence" as const,
      answer: copy[locale].insufficient,
      claims: [],
    };
  }

  const evidenceByCitationId = new Map(
    evidence.map((item) => [item.citationId, item]),
  );
  const citationsAreValid =
    candidate.claims.length > 0 &&
    candidate.claims.every(({ citationIds }) =>
      citationIds.every((citationId) => evidenceByCitationId.has(citationId)),
    );
  if (!citationsAreValid) {
    return {
      status: "abstained" as const,
      reason: "citation_validation_failed" as const,
      answer: copy[locale].citation,
      claims: [],
    };
  }

  const citedEvidence = candidate.claims.flatMap(({ citationIds }) =>
    citationIds.map((citationId) => evidenceByCitationId.get(citationId)!),
  );
  if (
    candidate.status === "conflict" &&
    (new Set(citedEvidence.map(({ citationId }) => citationId)).size < 2 ||
      new Set(citedEvidence.map(({ publicId }) => publicId)).size < 2)
  ) {
    return {
      status: "abstained" as const,
      reason: "citation_validation_failed" as const,
      answer: copy[locale].citation,
      claims: [],
    };
  }

  for (const claim of candidate.claims) {
    const comparisonEvidence = claim.citationIds.map((citationId) =>
      evidenceByCitationId.get(citationId)!,
    );
    const structuredEvidence = comparisonEvidence.filter(
      ({ comparisonBasis }) => comparisonBasis !== null,
    );
    if (structuredEvidence.length < 2 && !claim.comparison) continue;
    const bases = comparisonEvidence.map(({ comparisonBasis }) => {
      if (!claim.comparison) return null;
      return comparisonBasis?.kind === claim.comparison.kind
        ? comparisonBasis
        : null;
    });
    if (
      !claim.comparison ||
      new Set(claim.citationIds).size < 2 ||
      new Set(comparisonEvidence.map(({ publicId }) => publicId)).size < 2 ||
      bases.length < 2 ||
      bases.some((basis) => basis === null) ||
      new Set(bases.map((basis) => comparisonKey(basis!))).size !== 1
    ) {
      return {
        status: "not_comparable" as const,
        reason: "incompatible_comparison" as const,
        answer: copy[locale].comparison,
        claims: [],
      };
    }
  }

  return {
    status: candidate.status,
    reason:
      candidate.status === "conflict"
        ? ("conflicting_evidence" as const)
        : ("answered" as const),
    answer: candidate.claims.map(({ text }) => text).join("\n"),
    claims: candidate.claims,
  };
};
