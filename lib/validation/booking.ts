import { z } from "zod";

export const checkoutSchema = z.object({
  holdToken: z.string().min(1, "holdToken is required"),
  // Client-generated key (e.g. a UUID minted once per checkout attempt) so
  // a retried/duplicated request cannot create a second booking.
  idempotencyKey: z.string().min(1).max(255),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
