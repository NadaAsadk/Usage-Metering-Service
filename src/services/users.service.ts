import * as usersRepository from "../repositories/users.repository";

export class UserServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "UserServiceError";
  }
}
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function createUser(
  accountId: number,
  externalUserId: string,
  planName: string,
) {
  const plan = await usersRepository.findUserPlan(planName);

  if (!plan) {
    throw new UserServiceError(
      "User plan not found",
      400,
      "Choose a valid user plan, such as Basic or Power.",
    );
  }

  const existingUser = await usersRepository.findUserByExternalId(
    accountId,
    externalUserId,
  );
  if (existingUser) {
    throw new UserServiceError(
      "User already exists",
      409,
      "This external user ID is already registered for this account.",
    );
  }
  try {
    const user = await usersRepository.createUser({
      accountId,
      externalUserId,
      planId: plan.id,
    });

    return {
      user,
      plan: {
        name: plan.name,
        monthlyAllowance: plan.monthlyAllowance,
        maxUnitsPerRequest: plan.maxUnitsPerRequest,
      },
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new UserServiceError(
        "User already exists",
        409,
        "This external user ID is already registered for this account.",
      );
    }
    throw error;
  }
}

export async function changeUserPlan(
  accountId: number,
  userId: number,
  planName: string,
) {
  const plan = await usersRepository.findUserPlan(planName);
  if (!plan) {
    throw new UserServiceError(
      "User plan not found",
      400,
      "Choose a valid user plan, such as Basic or Power.",
    );
  }
  const user = await usersRepository.updateUserPlan(accountId, userId, plan.id);
  if (!user) {
    throw new UserServiceError("User not found", 404);
  }
  return {
    user,
    plan: {
      name: plan.name,
      monthlyAllowance: plan.monthlyAllowance,
      maxUnitsPerRequest: plan.maxUnitsPerRequest,
    },
  };
}

export async function getUser(accountId: number, userId: number) {
  const user = await usersRepository.findUserDetails(accountId, userId);
  if (!user) {
    throw new UserServiceError("User not found", 404);
  }
  return user;
}
