import { createHash } from "node:crypto";
import type { AskEvidenceItem } from "./contracts";

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

export const versionAskEvidencePack = ({
  items,
  dataCutoff,
}: {
  items: AskEvidenceItem[];
  dataCutoff: string;
}) =>
  `public-${createHash("sha256")
    .update(JSON.stringify(canonicalize({ dataCutoff, items })))
    .digest("hex")
    .slice(0, 16)}`;
