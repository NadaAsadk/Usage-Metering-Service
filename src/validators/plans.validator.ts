import z from "zod";

export const planSchema = z.object({
  name: z.string().trim().min(2).max(100),
  scope: z.enum(["account", "user"]),
  monthlyAllowance: z.number().int().nonnegative(),
  maxUnitsPerRequest: z.number().int().positive(),
});

export const patchPlanSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    monthlyAllowance: z.number().int().nonnegative().optional(),
    maxUnitsPerRequest: z.number().int().positive().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });
