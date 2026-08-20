import Link from "next/link";
import { formatINR } from "@/lib/utils/currency";

interface EventCardProps {
  id: string;
  title: string;
  type: string;
  eventDate: Date;
  venueName: string;
  lowestPriceMinorUnits: number | null;
}

export function EventCard({ id, title, type, eventDate, venueName, lowestPriceMinorUnits }: EventCardProps) {
  return (
    <Link
      href={`/events/${id}`}
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
    >
      <span className="w-fit rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        {type}
      </span>
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{title}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{venueName}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {eventDate.toLocaleDateString(undefined, { dateStyle: "medium" })}
      </p>
      {lowestPriceMinorUnits !== null && (
        <p className="mt-2 text-sm font-medium text-zinc-950 dark:text-zinc-50">
          From {formatINR(lowestPriceMinorUnits)}
        </p>
      )}
    </Link>
  );
}
