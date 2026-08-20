import { z } from "zod";
import { MAX_SEATS_PER_BOOKING } from "@/lib/config/booking";

export const holdSeatsSchema = z.object({
  seatIds: z
    .array(z.string().min(1))
    .min(1, "At least one seat must be selected.")
    .max(MAX_SEATS_PER_BOOKING, `A maximum of ${MAX_SEATS_PER_BOOKING} seats can be held at once.`),
});

export type HoldSeatsInput = z.infer<typeof holdSeatsSchema>;
