// Kelmi is free at launch. There is no paid plan, so there is nothing to switch between. The free limit matches
// FREE_MONTHLY_PLAN_CAP in supabase/functions/_shared/plan-logic.ts.
export function Pricing() {
  return (
    <div className="pricing">
      <div className="pricegrid">
        <div className="price best">
          <h3>Free</h3>
          <p className="amount"><span>$0</span></p>
          <p className="billed">No card needed</p>
          <ul><li>3 weekly plans a month</li><li>Grocery list and pantry</li><li>Swap any meal</li></ul>
        </div>
      </div>
      <p className="footnote">Paid plans may come later. If they do, we will tell you before you are charged anything.</p>
    </div>
  );
}
