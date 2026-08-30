import {
  askRequestSchema,
  askResponseSchema,
  type AskRequest,
} from "./contracts";
import { buildAskEvidencePack } from "./evidence";
import { getAskLlm, type AskLlm } from "./provider";
import { validateAskCandidate } from "./validation";

const insufficientCopy = {
  en: "The public AI Radar dataset does not contain enough evidence to answer this question.",
  zh: "AI Radar 公开数据集中没有足够证据回答这个问题。",
} as const;

export const answerPublicQuestion = async (
  untrustedInput: AskRequest,
  llm?: AskLlm,
) => {
  const input = askRequestSchema.parse(untrustedInput);
  const pack = await buildAskEvidencePack(input);
  const validated =
    pack.items.length === 0
      ? {
          status: "abstained" as const,
          reason: "insufficient_evidence" as const,
          answer: insufficientCopy[input.locale],
          claims: [],
        }
      : validateAskCandidate(
          await (llm ?? getAskLlm()).generate({
            question: input.question,
            locale: input.locale,
            evidence: pack.items,
            dataCutoff: pack.dataCutoff,
            dataVersion: pack.dataVersion,
          }),
          pack.items,
          input.locale,
        );
  const evidenceByCitationId = new Map(
    pack.items.map((item) => [item.citationId, item]),
  );

  return askResponseSchema.parse({
    question: input.question,
    locale: input.locale,
    status: validated.status,
    reason: validated.reason,
    answer: validated.answer,
    claims: validated.claims.map((claim, index) => ({
      publicId: `claim-${index + 1}`,
      text: claim.text,
      citations: claim.citationIds.map((citationId) => {
        const {
          citationId: id,
          recordType,
          publicId,
          title,
          recordUrl,
          source,
          lastVerifiedAt,
        } = evidenceByCitationId.get(citationId)!;
        return {
          citationId: id,
          recordType,
          publicId,
          title,
          recordUrl,
          source,
          lastVerifiedAt,
        };
      }),
    })),
    generatedAt: new Date().toISOString(),
    dataCutoff: pack.dataCutoff,
    dataVersion: pack.dataVersion,
    evidencePack: { count: pack.items.length, limit: pack.limit },
  });
};
