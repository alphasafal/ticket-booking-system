import { Resend } from "resend";
import { env } from "@/lib/config/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface BookingConfirmationEmailParams {
  to: string;
  reference: string;
  eventTitle: string;
  venueName: string;
  eventDate: Date;
  seats: { row: string; number: number }[];
  qrDataUrl: string;
}

interface WaitlistOfferEmailParams {
  to: string;
  eventTitle: string;
  category: string;
  offerExpiresAt: Date;
  acceptUrl: string;
}

async function send(payload: { to: string; subject: string; html: string }): Promise<void> {
  if (!resend) {
    console.log(`[email:dev] to=${payload.to} subject="${payload.subject}"`);
    return;
  }
  try {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
  } catch (error) {
    // The booking/offer this email describes is already committed to the
    // database. A provider outage here must never roll that back — log and
    // move on rather than throwing.
    console.error("Failed to send email:", error);
  }
}

export async function sendBookingConfirmation(params: BookingConfirmationEmailParams): Promise<void> {
  const seatList = params.seats.map((s) => `${s.row}${s.number}`).join(", ");
  await send({
    to: params.to,
    subject: `Your booking is confirmed — ${params.reference}`,
    html: `
      <h1>Booking confirmed</h1>
      <p><strong>${params.eventTitle}</strong> at ${params.venueName}</p>
      <p>${params.eventDate.toLocaleString()}</p>
      <p>Seats: ${seatList}</p>
      <p>Reference: <strong>${params.reference}</strong></p>
      <img src="${params.qrDataUrl}" alt="Booking QR code" width="180" height="180" />
    `,
  });
}

export async function sendWaitlistOffer(params: WaitlistOfferEmailParams): Promise<void> {
  await send({
    to: params.to,
    subject: `A ${params.category} seat is available for ${params.eventTitle}`,
    html: `
      <h1>Seat available</h1>
      <p>A ${params.category} seat for <strong>${params.eventTitle}</strong> is being held for you.</p>
      <p>This offer expires at ${params.offerExpiresAt.toLocaleString()}.</p>
      <p><a href="${params.acceptUrl}">Accept your offer</a></p>
    `,
  });
}
