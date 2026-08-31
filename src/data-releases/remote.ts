import { createHash } from "node:crypto";
import { z } from "zod";
import type { dataReleaseMirrorRequestSchema } from "./contracts";

const maximumFileBytes = 50 * 1024 * 1024;
const maximumMetadataBytes = 1024 * 1024;

const githubReleaseSchema = z.object({
  html_url: z.url(),
  assets: z.array(
    z.object({
      name: z.string().min(1),
      browser_download_url: z.url(),
    }),
  ),
});

type ExpectedFile = { name: string; checksumSha256: string };

export class DataReleaseRemoteError extends Error {
  constructor(
    readonly code:
      | "canonical_not_found"
      | "canonical_checksum_mismatch"
      | "remote_fetch_failed"
      | "checksum_mismatch",
    readonly httpStatus?: number,
  ) {
    super(code);
  }
}

const outboundUrl = (url: string) => {
  const testOrigin = process.env.DATA_RELEASE_REMOTE_TEST_ORIGIN;
  if (!testOrigin) return url;
  if (process.env.AI_RADAR_TEST_MODE !== "true") {
    throw new Error(
      "Data Release remote URL override is only allowed in tests",
    );
  }
  const requested = new URL(url);
  const rewritten = new URL(testOrigin);
  rewritten.pathname = `/${requested.hostname}${requested.pathname}`;
  rewritten.search = requested.search;
  return rewritten.toString();
};

const download = async (
  url: string,
  maximumBytes: number,
  redirects: RequestRedirect = "follow",
) => {
  let response: Response;
  try {
    response = await fetch(outboundUrl(url), {
      headers: { accept: "application/json, application/octet-stream" },
      redirect: redirects,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof DataReleaseRemoteError) throw error;
    throw new DataReleaseRemoteError("remote_fetch_failed");
  }
  if (!response.ok) {
    throw new DataReleaseRemoteError("remote_fetch_failed", response.status);
  }
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    (!Number.isSafeInteger(Number(declaredLength)) ||
      Number(declaredLength) > maximumBytes)
  ) {
    throw new DataReleaseRemoteError("remote_fetch_failed");
  }
  if (!response.body) throw new DataReleaseRemoteError("remote_fetch_failed");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        throw new DataReleaseRemoteError("remote_fetch_failed");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DataReleaseRemoteError) throw error;
    throw new DataReleaseRemoteError("remote_fetch_failed");
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const checksum = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

export const verifyCanonicalRelease = async (
  canonicalUrl: string,
  expectedFiles: ExpectedFile[],
) => {
  const tag = new URL(canonicalUrl).pathname.split("/").at(-1);
  if (!tag) throw new DataReleaseRemoteError("canonical_not_found");
  let releaseBytes: Uint8Array;
  try {
    releaseBytes = await download(
      `https://api.github.com/repos/cryanskl/ai-radar/releases/tags/${encodeURIComponent(tag)}`,
      maximumMetadataBytes,
    );
  } catch (error) {
    if (
      error instanceof DataReleaseRemoteError &&
      error.code === "remote_fetch_failed" &&
      error.httpStatus === 404
    ) {
      throw new DataReleaseRemoteError("canonical_not_found");
    }
    throw error;
  }
  let release: z.infer<typeof githubReleaseSchema>;
  try {
    release = githubReleaseSchema.parse(
      JSON.parse(new TextDecoder().decode(releaseBytes)),
    );
  } catch {
    throw new DataReleaseRemoteError("remote_fetch_failed");
  }
  if (release.html_url !== canonicalUrl) {
    throw new DataReleaseRemoteError("canonical_not_found");
  }
  const assets = [...release.assets].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const expected = [...expectedFiles].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  if (
    assets.length !== expected.length ||
    assets.some((asset, index) => asset.name !== expected[index].name)
  ) {
    throw new DataReleaseRemoteError("canonical_checksum_mismatch");
  }
  await Promise.all(
    assets.map(async (asset, index) => {
      const expectedUrl = `https://github.com/cryanskl/ai-radar/releases/download/${tag}/${encodeURIComponent(asset.name)}`;
      if (asset.browser_download_url !== expectedUrl) {
        throw new DataReleaseRemoteError("canonical_checksum_mismatch");
      }
      const bytes = await download(
        asset.browser_download_url,
        maximumFileBytes,
      );
      if (checksum(bytes) !== expected[index].checksumSha256) {
        throw new DataReleaseRemoteError("canonical_checksum_mismatch");
      }
    }),
  );
};

export const verifyMirrorFiles = async (
  input: z.infer<typeof dataReleaseMirrorRequestSchema>,
  expectedFiles: ExpectedFile[],
) => {
  const claimed = [...input.files].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const expected = [...expectedFiles].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  if (
    claimed.length !== expected.length ||
    claimed.some((file, index) => file.name !== expected[index].name)
  ) {
    throw new DataReleaseRemoteError("checksum_mismatch");
  }
  await Promise.all(
    claimed.map(async (file, index) => {
      const bytes = await download(file.url, maximumFileBytes, "error");
      if (checksum(bytes) !== expected[index].checksumSha256) {
        throw new DataReleaseRemoteError("checksum_mismatch");
      }
    }),
  );
};
