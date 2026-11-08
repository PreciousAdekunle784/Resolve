import { AppShell } from "@/components/app/app-nav";
import { requireOnboardedUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireOnboardedUser();
  return (
    <AppShell name={profile.full_name ?? "Your account"} email={profile.email} isAdmin={user.isAdmin}>
      {children}
    </AppShell>
  );
}
