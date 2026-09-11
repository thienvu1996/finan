import assert from "node:assert/strict";
import test from "node:test";
import { demoData, summarize, weeklyFlow } from "../lib/finance";

test("financial summaries reconcile with the transaction list", () => {
  const data = demoData("2026-08");
  const totals = summarize(data.transactions);
  assert.equal(totals.net, totals.income - totals.expense);
  const weeks = weeklyFlow(data.transactions, "2026-08");
  assert.equal(weeks.reduce((sum, week) => sum + week.income, 0), totals.income);
  assert.equal(weeks.reduce((sum, week) => sum + week.expense, 0), totals.expense);
});
