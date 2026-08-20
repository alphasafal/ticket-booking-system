import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { cardClass, primaryButtonClass } from "@/components/ui/styles";

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/events");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <div className={`${cardClass} flex items-center justify-between`}>
        <div>
          <h2 className="font-medium">Venues &amp; seat layouts</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Create venues and configure seat rows and categories.</p>
        </div>
        <Link href="/admin/venues" className={primaryButtonClass}>
          Manage venues
        </Link>
      </div>
    </div>
  );
}
