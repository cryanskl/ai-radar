import type {
  ModelRecommendationRequest,
  PublicModelDetail,
  PublicModelRecommendation,
} from "./contracts";

export type RecommendationCandidate = {
  family: Pick<PublicModelDetail, "publicId" | "name" | "summary">;
  version: PublicModelDetail["versions"][number];
};

export type { ModelRecommendationRequest } from "./contracts";

type ReasonCode =
  PublicModelRecommendation["candidates"][number]["nonFitReasons"][number]["code"];

const reasonMessages: Record<"en" | "zh", Record<ReasonCode, string>> = {
  en: {
    quality_threshold_met: "The selected quality threshold is met.",
    budget_met: "The current comparable unit price is within budget.",
    latency_met: "The selected latency ceiling is met.",
    deployment_met: "The requested deployment method is supported.",
    region_met: "The exact Model Version is available in the selected region.",
    open_weights_met: "Open weights are available.",
    configuration_evidence_missing:
      "A complete public configuration profile is not available.",
    lifecycle_not_active: "The exact Model Version is not active.",
    deployment_not_supported:
      "The requested deployment method is not supported.",
    open_weights_required: "The scenario requires open weights.",
    region_unavailable: "The selected region is not listed as available.",
    quality_evidence_missing:
      "No public Benchmark Run matches the selected quality conditions.",
    quality_threshold_not_met: "The selected quality threshold is not met.",
    current_price_missing:
      "No public Price Record is valid at the Data Cutoff for this cost basis.",
    budget_exceeded: "The comparable unit price exceeds the selected budget.",
    latency_evidence_missing:
      "No public Benchmark Run matches the selected latency conditions.",
    latency_exceeded: "The selected latency ceiling is exceeded.",
    price_unit_incompatible:
      "The selected price category and unit are not comparable.",
    quality_direction_incompatible:
      "The Benchmark Run direction conflicts with the selected quality threshold.",
    benchmark_conditions_incompatible:
      "The candidate Benchmark Runs use different settings or evaluators.",
    price_conditions_incompatible:
      "The candidate prices use different tax conditions.",
    ambiguous_current_price:
      "More than one Price Record is valid for the same conditions at the Data Cutoff.",
    deployment_cost_basis_missing:
      "No comparable hardware, labor, throughput and utilization cost basis is published for this deployment method.",
  },
  zh: {
    quality_threshold_met: "已达到所选质量门槛。",
    budget_met: "当前同口径单位价格在预算以内。",
    latency_met: "已满足所选时延上限。",
    deployment_met: "支持所选部署方式。",
    region_met: "该精确模型版本在所选地区可用。",
    open_weights_met: "提供开放权重。",
    configuration_evidence_missing: "缺少完整的公开配置档案。",
    lifecycle_not_active: "该精确模型版本不是活跃状态。",
    deployment_not_supported: "不支持所选部署方式。",
    open_weights_required: "该场景要求开放权重。",
    region_unavailable: "所选地区不在公开可用范围内。",
    quality_evidence_missing: "没有符合所选质量条件的公开评测记录。",
    quality_threshold_not_met: "未达到所选质量门槛。",
    current_price_missing: "数据截止时间没有符合该成本口径的有效公开价格。",
    budget_exceeded: "同口径单位价格超过所选预算。",
    latency_evidence_missing: "没有符合所选时延条件的公开评测记录。",
    latency_exceeded: "超过所选时延上限。",
    price_unit_incompatible: "所选价格类别与单位不可比。",
    quality_direction_incompatible: "评测分数方向与所选质量门槛冲突。",
    benchmark_conditions_incompatible: "候选评测使用了不同设置或评测主体。",
    price_conditions_incompatible: "候选价格使用了不同税费条件。",
    ambiguous_current_price: "数据截止时间存在多条同条件有效价格。",
    deployment_cost_basis_missing:
      "尚未发布该部署方式可比较的硬件、人力、吞吐与利用率成本口径。",
  },
};

const methodology = {
  en: {
    question:
      "Which exact Model Versions satisfy the selected task, quality, cost, latency, deployment, region and open-weight constraints?",
    eligibility: [
      "One exact, active Model Version with a public configuration profile.",
      "One current Price Record matching category, unit, currency and region.",
      "A Benchmark Run matching benchmark, version, task, score unit, direction, settings and evaluator.",
    ],
    limitations: [
      "Quality must not be generalized beyond the selected Benchmark and settings.",
      "Hosted API prices are not compared with uncosted self-hosted deployments.",
      "Candidates are ranked by comparable cost only after every selected threshold is met.",
    ],
  },
  zh: {
    question:
      "哪些精确模型版本满足所选任务、质量、成本、时延、部署、地区与开放权重约束？",
    eligibility: [
      "具有公开配置档案的活跃精确模型版本。",
      "一条在当前有效且类别、单位、币种和地区一致的价格记录。",
      "评测基准、版本、任务、分数单位、方向、设置和评测主体一致的评测记录。",
    ],
    limitations: [
      "质量结论不能超出所选评测与设置。",
      "托管 API 价格不与缺少完整成本的自部署方案比较。",
      "只有满足全部门槛的候选才按同口径成本排序。",
    ],
  },
};

const priceUnitForCategory = {
  input_tokens: "per_million_tokens",
  output_tokens: "per_million_tokens",
  cached_input_tokens: "per_million_tokens",
  cached_output_tokens: "per_million_tokens",
  batch_input_tokens: "per_million_tokens",
  batch_output_tokens: "per_million_tokens",
  image: "per_image",
  audio: "per_minute",
  video: "per_second",
} as const;

const provenancePriority = {
  independent_reproduced: 0,
  independent_reported: 1,
  vendor_reported: 2,
  community_observation: 3,
} as const;

const canonicalSettings = (
  settings: Record<string, string | number | boolean | null>,
) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(settings).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );

const decimalScale = 100_000_000n;

const scaledDecimal = (value: string | number) => {
  const text = String(value);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [integer, fraction = ""] = unsigned.split(".");
  const scaled =
    BigInt(integer) * decimalScale +
    BigInt(fraction.padEnd(8, "0").slice(0, 8));
  return negative ? -scaled : scaled;
};

const compareDecimal = (left: string | number, right: string | number) => {
  const scaledLeft = scaledDecimal(left);
  const scaledRight = scaledDecimal(right);
  return scaledLeft < scaledRight ? -1 : scaledLeft > scaledRight ? 1 : 0;
};

const evidencePreference = (
  left: PublicModelDetail["versions"][number]["benchmarkRuns"][number],
  right: PublicModelDetail["versions"][number]["benchmarkRuns"][number],
) =>
  provenancePriority[left.provenance] - provenancePriority[right.provenance] ||
  right.confidence - left.confidence ||
  Date.parse(right.runAt) - Date.parse(left.runAt) ||
  left.publicId.localeCompare(right.publicId);

export const evaluateModelRecommendations = (
  input: ModelRecommendationRequest,
  candidates: RecommendationCandidate[],
  dataCutoff: PublicModelRecommendation["dataCutoff"],
  evaluationInstant = dataCutoff,
): PublicModelRecommendation => {
  const message = (code: ReasonCode) => ({
    code,
    message: reasonMessages[input.locale][code],
  });
  const expectedHigherIsBetter = input.qualityDirection === "at_least";
  const categoryUnitCompatible =
    priceUnitForCategory[input.priceCategory] === input.priceUnit;

  const evaluated = candidates.map(({ family, version }) => {
    const fitCodes: ReasonCode[] = [];
    const nonFitCodes: ReasonCode[] = [];
    const insufficientCodes: ReasonCode[] = [];
    const notComparableCodes: ReasonCode[] = [];

    const hasConfiguration =
      version.lifecycleStatus !== null &&
      version.provider !== null &&
      version.accessMethods.length > 0 &&
      version.regions.length > 0;
    if (!hasConfiguration) {
      insufficientCodes.push("configuration_evidence_missing");
    } else {
      if (version.lifecycleStatus !== "active")
        nonFitCodes.push("lifecycle_not_active");
      if (!version.accessMethods.includes(input.deployment))
        nonFitCodes.push("deployment_not_supported");
      else fitCodes.push("deployment_met");
      if (
        input.requireOpenWeights &&
        !version.accessMethods.includes("open_weights")
      )
        nonFitCodes.push("open_weights_required");
      else if (input.requireOpenWeights) fitCodes.push("open_weights_met");
      if (!version.regions.includes(input.region))
        nonFitCodes.push("region_unavailable");
      else fitCodes.push("region_met");
    }

    const qualityMatches = version.benchmarkRuns
      .filter(
        (run) =>
          run.benchmark.publicId === input.benchmarkPublicId &&
          run.benchmark.version === input.benchmarkVersion &&
          run.task === input.task &&
          run.unit === input.scoreUnit &&
          evaluationInstant !== null &&
          Date.parse(run.runAt) <= Date.parse(evaluationInstant),
      )
      .sort(evidencePreference);
    const qualityEvidence = qualityMatches.find(
      ({ higherIsBetter }) => higherIsBetter === expectedHigherIsBetter,
    );
    if (!qualityEvidence) {
      if (qualityMatches.length > 0)
        notComparableCodes.push("quality_direction_incompatible");
      else insufficientCodes.push("quality_evidence_missing");
    } else {
      const qualityComparison = compareDecimal(
        qualityEvidence.score,
        input.qualityThreshold,
      );
      if (
        input.qualityDirection === "at_least"
          ? qualityComparison >= 0
          : qualityComparison <= 0
      )
        fitCodes.push("quality_threshold_met");
      else nonFitCodes.push("quality_threshold_not_met");
    }

    let priceEvidence = null;
    if (input.deployment !== "hosted_api") {
      notComparableCodes.push("deployment_cost_basis_missing");
    } else if (!categoryUnitCompatible) {
      notComparableCodes.push("price_unit_incompatible");
    } else {
      const currentPrices = version.prices.filter(
        (price) =>
          price.category === input.priceCategory &&
          price.unit === input.priceUnit &&
          price.currency === input.currency &&
          price.region === input.region &&
          evaluationInstant !== null &&
          Date.parse(price.validFrom) <= Date.parse(evaluationInstant) &&
          (price.validTo === null ||
            Date.parse(price.validTo) >= Date.parse(evaluationInstant)),
      );
      if (currentPrices.length === 0) {
        insufficientCodes.push("current_price_missing");
      } else if (currentPrices.length > 1) {
        notComparableCodes.push("ambiguous_current_price");
      } else {
        priceEvidence = currentPrices[0];
        if (compareDecimal(priceEvidence.amount, input.maximumUnitPrice) <= 0)
          fitCodes.push("budget_met");
        else nonFitCodes.push("budget_exceeded");
      }
    }

    let latencyEvidence = null;
    if (input.maximumLatencyMs !== undefined) {
      const latencyMatches = version.benchmarkRuns
        .filter(
          (run) =>
            run.benchmark.publicId === input.latencyBenchmarkPublicId &&
            run.benchmark.version === input.latencyBenchmarkVersion &&
            run.task === "latency" &&
            run.unit === "ms" &&
            !run.higherIsBetter &&
            evaluationInstant !== null &&
            Date.parse(run.runAt) <= Date.parse(evaluationInstant),
        )
        .sort(evidencePreference);
      latencyEvidence = latencyMatches[0] ?? null;
      if (!latencyEvidence) {
        insufficientCodes.push("latency_evidence_missing");
      } else if (
        compareDecimal(latencyEvidence.score, input.maximumLatencyMs) <= 0
      ) {
        fitCodes.push("latency_met");
      } else {
        nonFitCodes.push("latency_exceeded");
      }
    }

    return {
      familyPublicId: family.publicId,
      familyName: family.name,
      familySummary: family.summary,
      versionPublicId: version.publicId,
      versionLabel: version.versionLabel,
      provider: version.provider,
      outcome: "fit" as
        "fit" | "not_fit" | "not_comparable" | "insufficient_evidence",
      rank: null as number | null,
      fitCodes,
      nonFitCodes,
      insufficientCodes,
      notComparableCodes,
      priceEvidence,
      qualityEvidence: qualityEvidence ?? null,
      latencyEvidence,
      qualityCondition: qualityEvidence
        ? [
            qualityEvidence.benchmark.publicId,
            qualityEvidence.benchmark.version,
            qualityEvidence.task,
            qualityEvidence.unit,
            qualityEvidence.higherIsBetter,
            canonicalSettings(qualityEvidence.settings),
            qualityEvidence.evaluator.publicId,
          ].join("|")
        : null,
      latencyCondition: latencyEvidence
        ? [
            latencyEvidence.benchmark.publicId,
            latencyEvidence.benchmark.version,
            canonicalSettings(latencyEvidence.settings),
            latencyEvidence.evaluator.publicId,
          ].join("|")
        : null,
      priceCondition: priceEvidence?.taxPolicy ?? null,
    };
  });

  const hasConflictingConditions = (values: Array<string | null>) =>
    new Set(values.filter((value): value is string => value !== null)).size > 1;
  const qualityConflict = hasConflictingConditions(
    evaluated.map(({ qualityCondition }) => qualityCondition),
  );
  const latencyConflict = hasConflictingConditions(
    evaluated.map(({ latencyCondition }) => latencyCondition),
  );
  const priceConflict = hasConflictingConditions(
    evaluated.map(({ priceCondition }) => priceCondition),
  );

  for (const candidate of evaluated) {
    if (qualityConflict && candidate.qualityEvidence)
      candidate.notComparableCodes.push("benchmark_conditions_incompatible");
    if (latencyConflict && candidate.latencyEvidence)
      candidate.notComparableCodes.push("benchmark_conditions_incompatible");
    if (priceConflict && candidate.priceEvidence)
      candidate.notComparableCodes.push("price_conditions_incompatible");

    candidate.notComparableCodes = [...new Set(candidate.notComparableCodes)];

    if (candidate.notComparableCodes.length > 0)
      candidate.outcome = "not_comparable";
    else if (candidate.insufficientCodes.length > 0)
      candidate.outcome = "insufficient_evidence";
    else if (candidate.nonFitCodes.length > 0) candidate.outcome = "not_fit";
  }

  const fits = evaluated
    .filter(({ outcome }) => outcome === "fit")
    .sort(
      (left, right) =>
        compareDecimal(
          left.priceEvidence!.amount,
          right.priceEvidence!.amount,
        ) ||
        (input.qualityDirection === "at_least" ? -1 : 1) *
          compareDecimal(
            left.qualityEvidence!.score,
            right.qualityEvidence!.score,
          ) ||
        left.versionPublicId.localeCompare(right.versionPublicId),
    );
  fits.forEach((candidate, index) => {
    candidate.rank = index + 1;
  });

  const ordered = [
    ...fits,
    ...evaluated.filter(({ outcome }) => outcome !== "fit"),
  ];
  const status =
    fits.length > 0
      ? ("available" as const)
      : ordered.some(({ outcome }) => outcome === "not_comparable")
        ? ("not_comparable" as const)
        : ordered.some(({ outcome }) => outcome === "insufficient_evidence") ||
            ordered.length === 0
          ? ("insufficient_evidence" as const)
          : ("available" as const);

  return {
    locale: input.locale,
    status,
    methodology: {
      publicId: "model-configuration-fit",
      version: "1.0.0",
      ...methodology[input.locale],
    },
    constraints: input,
    dataCutoff,
    candidates: ordered.map((candidate) => ({
      familyPublicId: candidate.familyPublicId,
      familyName: candidate.familyName,
      familySummary: candidate.familySummary,
      versionPublicId: candidate.versionPublicId,
      versionLabel: candidate.versionLabel,
      provider: candidate.provider,
      outcome: candidate.outcome,
      rank: candidate.rank,
      priceEvidence: candidate.priceEvidence,
      qualityEvidence: candidate.qualityEvidence,
      latencyEvidence: candidate.latencyEvidence,
      fitReasons: candidate.fitCodes.map(message),
      nonFitReasons: [
        ...candidate.notComparableCodes,
        ...candidate.insufficientCodes,
        ...candidate.nonFitCodes,
      ].map(message),
    })),
  };
};
