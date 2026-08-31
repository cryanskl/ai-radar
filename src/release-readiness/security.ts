export type ReleaseScanIssue = {
  path: string;
  code:
    | "private_key"
    | "github_token"
    | "openai_key"
    | "aws_access_key"
    | "resend_key"
    | "email_address"
    | "restricted_field";
  line: number;
};

type ReleaseFile = { path: string; content: string };

const secretPatterns: Array<{
  code: ReleaseScanIssue["code"];
  pattern: RegExp;
}> = [
  {
    code: "private_key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  { code: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { code: "openai_key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { code: "aws_access_key", pattern: /\bAKIA[A-Z0-9]{16}\b/ },
  { code: "resend_key", pattern: /\bre_[A-Za-z0-9]{20,}\b/ },
];

const publicDataPatterns: Array<{
  code: ReleaseScanIssue["code"];
  pattern: RegExp;
}> = [
  {
    code: "email_address",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    code: "restricted_field",
    pattern:
      /"(?:email|emailAddress|internalNote|providerMessageId|sessionToken|apiKey|accessToken|refreshToken|ipAddress|deviceId)"\s*:/,
  },
];

const lineAt = (content: string, index: number) =>
  content.slice(0, index).split("\n").length;

export const scanReleaseFiles = (files: ReleaseFile[]) => {
  const issues: ReleaseScanIssue[] = [];
  for (const file of files) {
    const patterns = file.path.startsWith("data/")
      ? [...secretPatterns, ...publicDataPatterns]
      : secretPatterns;
    for (const { code, pattern } of patterns) {
      const match = pattern.exec(file.content);
      if (match) {
        issues.push({
          path: file.path,
          code,
          line: lineAt(file.content, match.index),
        });
      }
    }
  }
  return issues;
};
