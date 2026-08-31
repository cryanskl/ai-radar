import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { scanReleaseFiles } from "../src/release-readiness/security";

const paths = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const files = await Promise.all(
  paths.map(async (path) => ({ path, content: await readFile(path, "utf8") })),
);
const issues = scanReleaseFiles(files);

if (issues.length > 0) {
  console.error(JSON.stringify({ status: "failed", issues }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "passed", scannedFiles: files.length }));
}
