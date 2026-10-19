import z from "zod";

export const createUserSchema = z.object({
  externalUserId: z.string().trim().min(1).max(255),
  planName: z.string().trim().min(1).max(100),
});
export const patchUserPlanSchema = z.object({
  planName: z.string().trim().min(1).max(100),
});