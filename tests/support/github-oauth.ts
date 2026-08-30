import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import type { GithubProfile } from "next-auth/providers/github";
import { Pool } from "pg";
import { createAuthOptions } from "../../src/auth/create-options";
import { authAccounts, authSessions, authUsers } from "../../src/db/schema";

const secret = "test-secret-that-is-long-enough-for-the-test-suite";
const require = createRequire(import.meta.url);
const NextAuth = require("next-auth")
  .default as typeof import("next-auth").default;
const GitHubProvider = require("next-auth/providers/github")
  .default as typeof import("next-auth/providers/github").default;

const invokeNextAuth = async ({
  action,
  body,
  cookies,
  options,
  providerId,
  query = {},
}: {
  action: string;
  body?: Record<string, string>;
  cookies: Record<string, string>;
  options: NextAuthOptions;
  providerId?: string;
  query?: Record<string, string>;
}) => {
  const headers = new Map<string, string | string[]>();
  let responseBody: unknown;
  const response = {
    end: () => response,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    json: (value: unknown) => {
      responseBody = value;
      return response;
    },
    send: (value: unknown) => {
      responseBody = value;
      return response;
    },
    setHeader: (name: string, value: string | string[]) => {
      headers.set(name.toLowerCase(), value);
      return response;
    },
    status: () => response,
  };
  const request = {
    body,
    cookies,
    headers: {},
    method: body ? "POST" : "GET",
    query: {
      ...query,
      nextauth: providerId ? [action, providerId] : [action],
    },
  };

  await NextAuth(
    request as unknown as NextApiRequest,
    response as unknown as NextApiResponse,
    options,
  );
  const setCookies = headers.get("set-cookie") ?? [];
  for (const serializedCookie of Array.isArray(setCookies)
    ? setCookies
    : [setCookies]) {
    const [nameValue] = serializedCookie.split(";", 1);
    const separator = nameValue.indexOf("=");
    cookies[nameValue.slice(0, separator)] = decodeURIComponent(
      nameValue.slice(separator + 1),
    );
  }

  return {
    body: responseBody,
    redirect: headers.get("location") as string | undefined,
  };
};

export const completeFakeGithubOAuth = async ({
  applicationUrl,
  databaseUrl,
  ownerGithubId,
  profile,
}: {
  applicationUrl: string;
  databaseUrl: string;
  ownerGithubId: string;
  profile: Pick<
    GithubProfile,
    "avatar_url" | "email" | "id" | "login" | "name"
  >;
}) => {
  const oauthServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/authorize") {
      const callback = new URL(url.searchParams.get("redirect_uri") ?? "");
      callback.searchParams.set("code", "fake-github-code");
      callback.searchParams.set("state", url.searchParams.get("state") ?? "");
      response.writeHead(302, { location: callback.toString() }).end();
      return;
    }

    response.setHeader("content-type", "application/json");
    if (url.pathname === "/token") {
      response.end(
        JSON.stringify({
          access_token: "fake-github-token",
          token_type: "bearer",
        }),
      );
      return;
    }
    if (url.pathname === "/user") {
      response.end(JSON.stringify(profile));
      return;
    }

    response.writeHead(404).end(JSON.stringify({ error: "not_found" }));
  });
  oauthServer.listen(0, "127.0.0.1");
  await once(oauthServer, "listening");

  const address = oauthServer.address();
  if (!address || typeof address === "string")
    throw new Error("Fake GitHub OAuth server did not bind");
  const oauthUrl = `http://127.0.0.1:${address.port}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool);
  const options = createAuthOptions({
    adapter: DrizzleAdapter(database, {
      usersTable: authUsers,
      accountsTable: authAccounts,
      sessionsTable: authSessions,
    }),
    githubProvider: GitHubProvider({
      clientId: "fake-github-client-id",
      clientSecret: "fake-github-client-secret",
      authorization: `${oauthUrl}/authorize`,
      token: `${oauthUrl}/token`,
      userinfo: `${oauthUrl}/user`,
    }),
    ownerGithubId,
    secret,
  });
  const cookies: Record<string, string> = {};
  const previousNextAuthUrl = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = `${applicationUrl}/api/auth`;

  try {
    const csrf = await invokeNextAuth({ action: "csrf", cookies, options });
    const signIn = await invokeNextAuth({
      action: "signin",
      body: { csrfToken: (csrf.body as { csrfToken: string }).csrfToken },
      cookies,
      options,
      providerId: "github",
    });
    if (!signIn.redirect)
      throw new Error("GitHub sign-in did not redirect to authorization");

    const authorization = await fetch(signIn.redirect, { redirect: "manual" });
    const callbackLocation = authorization.headers.get("location");
    if (!callbackLocation)
      throw new Error("Fake GitHub did not redirect to the callback");
    const callbackUrl = new URL(callbackLocation);
    const callback = await invokeNextAuth({
      action: "callback",
      cookies,
      options,
      providerId: "github",
      query: Object.fromEntries(callbackUrl.searchParams),
    });

    return {
      redirect: callback.redirect,
      sessionToken: cookies["next-auth.session-token"],
    };
  } finally {
    if (previousNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = previousNextAuthUrl;
    await pool.end();
    oauthServer.close();
    await once(oauthServer, "close");
  }
};
