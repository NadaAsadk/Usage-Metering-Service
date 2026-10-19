import z from "zod";

export const consumeSchema = z.object({
  userId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  requestId: z.string().trim().min(1).max(200),
  units: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const consumptionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  userId: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  status: z.enum(["accepted", "rejected"]).optional(),
});


export type ConsumptionQuerySchema = z.infer<typeof consumptionQuerySchema>;
