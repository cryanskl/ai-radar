import { readFile } from "node:fs/promises";
import { buildReleaseDecision } from "../src/release-readiness/service";

const [checklistMarkdown, evidenceManifest] = await Promise.all([
  readFile("docs/10-acceptance-checklist.md", "utf8"),
  readFile("docs/release-evidence/public-alpha-v1.json", "utf8").then(
    JSON.parse,
  ),
]);
const decision = buildReleaseDecision({
  checklistMarkdown,
  evidenceManifest,
});
const summaryOnly = process.argv.includes("--summary");

console.log(
  JSON.stringify(
    summaryOnly
      ? {
          decision: decision.decision,
          summary: decision.summary,
          failedChecks: decision.checks
            .filter(({ result }) => result === "fail")
            .map(({ checkId }) => checkId),
        }
      : decision,
    null,
    2,
  ),
);

if (process.argv.includes("--require-go") && decision.decision !== "go") {
  process.exitCode = 1;
}
