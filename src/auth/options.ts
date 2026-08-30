import "server-only";

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import GitHubProvider from "next-auth/providers/github";
import { getAuthEnv } from "@/config/server-env";
import { database } from "@/db/client";
import { authAccounts, authSessions, authUsers } from "@/db/schema";
import { createAuthOptions } from "./create-options";

const env = getAuthEnv();

export const authOptions = createAuthOptions({
  adapter: DrizzleAdapter(database, {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
  }),
  githubProvider: GitHubProvider({
    clientId: env.GITHUB_ID,
    clientSecret: env.GITHUB_SECRET,
  }),
  ownerGithubId: env.OWNER_GITHUB_ID,
  secret: env.NEXTAUTH_SECRET,
});
