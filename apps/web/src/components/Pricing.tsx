// Kelmi is free at launch. Kelmi Plus is shown as coming later (billing is not built; PLUS_ENABLED is false in the app).
// The free limit matches FREE_MONTHLY_PLAN_CAP in supabase/functions/_shared/plan-logic.ts. The Plus numbers match
// PLANS in apps/mobile/src/data/mock.ts and PLUS_PLANS_PER_MONTH in apps/mobile/src/lib/limits.ts.
export function Pricing() {
  return (
    <div className="pricing">
      <div className="pricegrid">
        <div className="price">
          <h3>Free</h3>
          <p className="amount"><span>$0</span></p>
          <p className="billed">No card needed</p>
          <ul><li>3 weekly plans a month</li><li>Grocery list and pantry</li><li>Swap any meal</li></ul>
        </div>
        <div className="price best">
          <h3>Kelmi Plus <small>(coming later)</small></h3>
          <p className="amount"><span>$59</span><small>/ year</small></p>
          <p className="billed">About $4.92 a month, or $7.99 billed monthly</p>
          <ul><li>Up to 40 plans a month, one for every week</li><li>Cook mode with step timers</li><li>Savings report and full nutrition</li><li>No limit on pantry items</li></ul>
        </div>
      </div>
      <p className="footnote">Kelmi Plus is not available yet. When it is, we will tell you before you are charged anything.</p>
    </div>
  );
}
