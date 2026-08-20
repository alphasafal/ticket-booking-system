import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOrganiserDashboard } from "@/lib/event/organiser-dashboard-service";
import { formatINR } from "@/lib/utils/currency";
import { cardClass, primaryButtonClass } from "@/components/ui/styles";

export default async function OrganiserDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ORGANISER") redirect("/events");

  const dashboard = await getOrganiserDashboard(user.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organiser dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Your events, bookings, and revenue.</p>
        </div>
        <Link href="/organiser/events" className={primaryButtonClass}>
          Manage events
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total events", value: dashboard.totals.totalEvents },
          { label: "Upcoming events", value: dashboard.totals.upcomingEvents },
          { label: "Total bookings", value: dashboard.totals.totalBookings },
          { label: "Total revenue", value: formatINR(dashboard.totals.totalRevenueMinorUnits) },
        ].map((stat) => (
          <div key={stat.label} className={cardClass}>
            <p className="text-sm text-zinc-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Events</h2>
        {dashboard.events.length === 0 ? (
          <p className="text-sm text-zinc-500">You haven&apos;t created any events yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Sold / Total</th>
                  <th className="px-4 py-3 font-medium">Bookings</th>
                  <th className="px-4 py-3 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.events.map((event) => (
                  <tr key={event.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                    <td className="px-4 py-3">
                      <p className="font-medium">{event.title}</p>
                      <p className="text-zinc-500">{event.venueName}</p>
                    </td>
                    <td className="px-4 py-3">{event.status}</td>
                    <td className="px-4 py-3">{event.ticketsSold} / {event.totalSeats}</td>
                    <td className="px-4 py-3">{event.bookingsCount}</td>
                    <td className="px-4 py-3 font-medium">{formatINR(event.revenueMinorUnits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
