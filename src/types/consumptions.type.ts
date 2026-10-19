export type PlanSnapshot = {
  planId: number;
  name: string;
  scope: "account" | "user";
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
};

