import { z } from "zod";

const categoryPriceSchema = z.object({
  category: z.enum(["PREMIUM", "STANDARD"]),
  priceMinorUnits: z.number().int().nonnegative(),
});

export const createEventSchema = z.object({
  venueId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(4000).optional(),
  type: z.string().trim().min(1).max(50),
  eventDate: z.coerce.date(),
  startTime: z.coerce.date(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("PUBLISHED"),
  categoryPrices: z.array(categoryPriceSchema).min(1, "At least one category price is required"),
});

export const updateEventSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  type: z.string().trim().min(1).max(50).optional(),
  eventDate: z.coerce.date().optional(),
  startTime: z.coerce.date().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional(),
});

export const listEventsQuerySchema = z.object({
  type: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
