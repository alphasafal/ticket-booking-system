import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-start gap-6 py-16">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Book event tickets with real-time seat availability.
      </h1>
      <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
        Browse events, pick your seats on a live seat map, and check out securely — with
        automatic waitlists when your favorite section sells out.
      </p>
      <Link
        href="/events"
        className="rounded-md bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        Browse events
      </Link>
    </div>
  );
}
