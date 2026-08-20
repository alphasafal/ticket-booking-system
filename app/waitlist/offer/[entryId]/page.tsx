import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWaitlistOfferDetail } from "@/lib/waitlist/waitlist-service";
import { formatINR } from "@/lib/utils/currency";
import { AcceptOfferButton } from "@/components/booking/AcceptOfferButton";
import { OfferCountdown } from "@/components/booking/OfferCountdown";
import { cardClass, secondaryButtonClass } from "@/components/ui/styles";

// The destination of the time-limited link emailed to a waitlisted customer
// when a seat is released to them. Every claim is still validated server-side
// on accept — this page is a convenience, not the security boundary.
export default async function WaitlistOfferPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    // Come straight back here after signing in, so the emailed link still
    // works for someone who isn't logged in on this device.
    redirect(`/login?next=${encodeURIComponent(`/waitlist/offer/${entryId}`)}`);
  }

  const entry = await getWaitlistOfferDetail(entryId);
  if (!entry) notFound();
  if (entry.userId !== user.id) notFound();

  const seat = entry.offeredSeat?.seat;
  const price = entry.event.categoryPrices.find((p) => p.category === entry.category);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Your seat offer</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        {entry.event.title} · {entry.event.venue.name}
      </p>

      <div className={cardClass}>
        {entry.status === "OFFERED" && entry.offerExpiresAt && seat ? (
          <>
            <OfferCountdown expiresAt={entry.offerExpiresAt.toISOString()} />
            <div className="mb-4 flex justify-between text-sm">
              <span>
                Seat {seat.row}
                {seat.number} ({entry.category})
              </span>
              <span className="font-medium">
                {price ? formatINR(price.priceMinorUnits) : "—"}
              </span>
            </div>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              This seat was released by a cancellation and is being held for you. Complete your
              booking before the timer runs out, or it passes to the next person waiting.
            </p>
            <AcceptOfferButton entryId={entry.id} />
          </>
        ) : entry.status === "COMPLETED" ? (
          <div className="text-center">
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              You&apos;ve already claimed this seat.
            </p>
            <Link href="/bookings" className={secondaryButtonClass}>
              View my bookings
            </Link>
          </div>
        ) : (
          <div className="text-center">
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              {entry.status === "WAITING"
                ? "You're on the waitlist for this event — we'll email you when a seat opens up."
                : "This offer has expired and the seat has passed to the next person waiting."}
            </p>
            <Link href={`/events/${entry.eventId}`} className={secondaryButtonClass}>
              Back to event
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
