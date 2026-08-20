import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listVenues } from "@/lib/venue/venue-service";
import { CreateVenueForm } from "@/components/venues/CreateVenueForm";
import { AddSeatRowForm } from "@/components/venues/AddSeatRowForm";
import { cardClass } from "@/components/ui/styles";

export default async function AdminVenuesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/events");

  const venues = await listVenues();

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <h1 className="text-2xl font-semibold tracking-tight">Venues</h1>
        {venues.map((venue) => {
          const categoryCounts = venue.seats.reduce<Record<string, number>>((acc, seat) => {
            acc[seat.category] = (acc[seat.category] ?? 0) + 1;
            return acc;
          }, {});
          return (
            <div key={venue.id} className={cardClass}>
              <h2 className="text-lg font-semibold">{venue.name}</h2>
              {venue.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{venue.description}</p>}
              <p className="mt-2 text-sm text-zinc-500">
                {venue.seats.length} seats
                {Object.entries(categoryCounts).map(([category, count]) => ` · ${count} ${category.toLowerCase()}`)}
              </p>
              <AddSeatRowForm venueId={venue.id} />
            </div>
          );
        })}
      </div>
      <div>
        <CreateVenueForm />
      </div>
    </div>
  );
}
