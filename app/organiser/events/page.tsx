import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listOrganiserEvents } from "@/lib/event/event-service";
import { CreateEventForm } from "@/components/events/CreateEventForm";
import { cardClass } from "@/components/ui/styles";

export default async function OrganiserEventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ORGANISER") redirect("/events");

  const events = await listOrganiserEvents(user.id);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">Your events</h1>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No events yet — create one to get started.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className={`${cardClass} flex items-center justify-between hover:border-zinc-400 dark:hover:border-zinc-600`}
              >
                <div>
                  <p className="font-medium">{event.title}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {event.venue.name} · {event.eventDate.toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium dark:bg-zinc-800">
                  {event.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div>
        <CreateEventForm />
      </div>
    </div>
  );
}
