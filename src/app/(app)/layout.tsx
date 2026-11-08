import { AppNav } from "@/components/app/app-nav";
import { requireOnboardedUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireOnboardedUser();
  return (
    <div className="min-h-screen bg-ink-50">
      <AppNav name={profile.full_name ?? "Your account"} email={profile.email} isAdmin={user.isAdmin} />
      <div className="lg:pl-64">
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
