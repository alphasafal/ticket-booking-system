import { z } from "zod";

export const createVenueSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional(),
});

export const updateVenueSchema = createVenueSchema.partial();

export const addSeatsSchema = z.object({
  seats: z
    .array(
      z.object({
        row: z.string().trim().min(1).max(10),
        number: z.number().int().positive(),
        category: z.enum(["PREMIUM", "STANDARD"]),
      }),
    )
    .min(1, "At least one seat is required"),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;
export type AddSeatsInput = z.infer<typeof addSeatsSchema>;
