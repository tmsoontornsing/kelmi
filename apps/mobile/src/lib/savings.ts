// What Kelmi has saved a household, from the grocery lists they generated. Everything here is an estimate built from average
// prices, so the screen words it as "about" and never promises it. The weekly budget is today's setting, not the one a past
// week was planned under, because Kelmi doesn't keep a history of budgets.

export type SavingsRow = { weekStart: string; total: number; pantry: number };

export type SavingsPeriod = {
  weeks: number;
  // Groceries left off the list because they were already on the pantry shelf.
  pantry: number;
  // Budget minus the list's total, added up over the weeks; negative when the lists ran over.
  vsBudget: number;
  // Weeks that came in at or under budget.
  underWeeks: number;
};

export type Savings = { month: SavingsPeriod; all: SavingsPeriod };

const round2 = (n: number) => Math.round(n * 100) / 100;

function summarize(rows: SavingsRow[], budget: number): SavingsPeriod {
  return {
    weeks: rows.length,
    pantry: round2(rows.reduce((s, r) => s + r.pantry, 0)),
    vsBudget: round2(rows.reduce((s, r) => s + (budget - r.total), 0)),
    underWeeks: rows.filter((r) => r.total <= budget).length,
  };
}

// `month` counts the weeks whose Monday falls in the same calendar month as `now`.
export function computeSavings(rows: SavingsRow[], budget: number, now: Date = new Date()): Savings {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { month: summarize(rows.filter((r) => r.weekStart.startsWith(key)), budget), all: summarize(rows, budget) };
}
