import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SignOutButton } from "./SignOutButton";

export async function NavBar() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          TicketBooking
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/events" className="font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
            Events
          </Link>
          {user && (
            <Link href="/bookings" className="font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
              My bookings
            </Link>
          )}
          {user?.role === "ORGANISER" && (
            <Link href="/organiser/dashboard" className="font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
              Dashboard
            </Link>
          )}
          {user?.role === "ADMIN" && (
            <Link href="/admin/venues" className="font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
              Venues
            </Link>
          )}
          {user ? (
            <div className="flex items-center gap-4 border-l border-zinc-200 pl-6 dark:border-zinc-800">
              <span className="text-zinc-500">{user.name}</span>
              <SignOutButton />
            </div>
          ) : (
            <div className="flex items-center gap-4 border-l border-zinc-200 pl-6 dark:border-zinc-800">
              <Link href="/login" className="font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-zinc-950 px-3 py-1.5 font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
