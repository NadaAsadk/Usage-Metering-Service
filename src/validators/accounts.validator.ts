import z from "zod";

export const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(100),
  planName: z.string().trim().min(1).max(100),
});

export const patchAccountPlanSchema = z.object({
  planName: z.string().trim().min(1).max(100),
});
