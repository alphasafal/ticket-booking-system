import { notFound } from "next/navigation";
import { getEventDetail } from "@/lib/event/event-service";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SeatMapBooking } from "@/components/seats/SeatMapBooking";
import { ApiError } from "@/lib/utils/api-error";

export default async function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const viewer = await getCurrentUser();

  let event;
  try {
    event = await getEventDetail(eventId, viewer);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <span className="w-fit rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {event.type}
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{event.title}</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {event.venue.name} · {event.eventDate.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
        </p>
        {event.description && <p className="mt-3 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">{event.description}</p>}
      </div>

      <SeatMapBooking
        eventId={event.id}
        categoryPrices={event.categoryPrices.map((p) => ({ category: p.category, priceMinorUnits: p.priceMinorUnits }))}
        isAuthenticated={!!viewer}
      />
    </div>
  );
}
