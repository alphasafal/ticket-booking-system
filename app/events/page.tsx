import { listPublishedEvents } from "@/lib/event/event-service";
import { EventCard } from "@/components/events/EventCard";
import { inputClass, primaryButtonClass } from "@/components/ui/styles";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; type?: string }>;
}) {
  const { search, type } = await searchParams;
  const events = await listPublishedEvents({ search, type });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Browse upcoming events and book your seats.</p>
      </div>

      <form className="flex gap-3">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search by title…"
          className={`${inputClass} max-w-xs`}
        />
        <select name="type" defaultValue={type ?? ""} className={inputClass + " max-w-40"}>
          <option value="">All types</option>
          <option value="CONCERT">Concert</option>
          <option value="MOVIE">Movie</option>
        </select>
        <button type="submit" className={primaryButtonClass}>
          Filter
        </button>
      </form>

      {events.length === 0 ? (
        <p className="text-sm text-zinc-500">No events match your filters.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const lowestPrice = event.categoryPrices.length
              ? Math.min(...event.categoryPrices.map((p) => p.priceMinorUnits))
              : null;
            return (
              <EventCard
                key={event.id}
                id={event.id}
                title={event.title}
                type={event.type}
                eventDate={event.eventDate}
                venueName={event.venue.name}
                lowestPriceMinorUnits={lowestPrice}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
