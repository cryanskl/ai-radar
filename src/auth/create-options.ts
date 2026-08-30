import type { Adapter } from "next-auth/adapters";
import type { NextAuthOptions } from "next-auth";
import type { Provider } from "next-auth/providers/index";
import { isAllowedOwner } from "./owner-policy";

type AuthDependencies = {
  adapter: Adapter;
  githubProvider: Provider;
  ownerGithubId: string;
  secret: string;
};

export const createAuthOptions = ({
  adapter,
  githubProvider,
  ownerGithubId,
  secret,
}: AuthDependencies): NextAuthOptions => ({
  adapter,
  secret,
  session: {
    strategy: "database",
  },
  providers: [githubProvider],
  callbacks: {
    signIn({ account, profile }) {
      return (
        account?.provider === "github" && isAllowedOwner(profile, ownerGithubId)
      );
    },
    session({ session }) {
      if (session.user) session.user.role = "owner";
      return session;
    },
  },
});
