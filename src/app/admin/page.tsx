import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth/options";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== "owner") {
    redirect("/api/auth/signin?callbackUrl=/admin");
  }

  return (
    <main>
      <h1>Owner administration</h1>
      <p>Signed in as {session.user.email ?? session.user.name}.</p>
    </main>
  );
}
