import { z } from "zod";

const githubProfileSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
});

export const isAllowedOwner = (profile: unknown, allowedAccountId: string) => {
  const parsedProfile = githubProfileSchema.safeParse(profile);

  return (
    parsedProfile.success && String(parsedProfile.data.id) === allowedAccountId
  );
};
