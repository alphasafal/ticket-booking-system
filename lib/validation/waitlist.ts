import { z } from "zod";

export const joinWaitlistSchema = z.object({
  category: z.enum(["PREMIUM", "STANDARD"]),
});

export const acceptOfferSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
});
