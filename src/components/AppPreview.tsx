'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// A copy of the Kelmi app's four tabs inside an iPhone, laid out in the app's own points (393 x 852) with its own
// spacing, type scale and example data (apps/mobile/src/app/(tabs), src/components, src/data/mock.ts). Nothing here is a real plan.

const ION = {
  sunny: '', 'partly-sunny': '', moon: '', swap: '', bookmark: '', forward: '', down: '',
  location: '', share: '', checkbox: '', check: '', lock: '', lockfill: '', add: '',
  calendar: '', calendarOn: '', cart: '', cartOn: '', cog: '', cogOn: '', tray: '', trayOn: '',
  basket: '', leaf: '', snow: '',
} as const;
type IconName = keyof typeof ION;
const Ion = ({ n, s = 20, color }: { n: IconName; s?: number; color?: string }) => (
  <span className="ion" style={{ fontSize: s, color }} aria-hidden="true">{ION[n]}</span>
);

// The app puts a hair space around " · " because Outfit sets the dot tight.
const air = (s: string) => s.replace(/ · /g, '  ·  ');
const money = (n: number) => '$' + n.toFixed(2);

type Meal = { name: string; minutes: string; cost: number };
const M: Record<string, Meal> = {
  oats: { name: 'Overnight oats with berries', minutes: '5 min prep', cost: 4 },
  eggtoast: { name: 'Spinach scramble on toast', minutes: '15 min', cost: 5 },
  parfait: { name: 'Yogurt and granola parfaits', minutes: '5 min', cost: 5 },
  pancakes: { name: 'Banana pancakes', minutes: '20 min', cost: 4 },
  burritos: { name: 'Egg and bean breakfast burritos', minutes: '20 min', cost: 6 },
  wraps: { name: 'Turkey and avocado wraps', minutes: '10 min', cost: 10 },
  tunasalad: { name: 'Tuna and chickpea salad', minutes: '15 min', cost: 8 },
  quesadilla: { name: 'Black bean quesadillas', minutes: '20 min', cost: 8 },
  chickensand: { name: 'Chicken salad sandwiches', minutes: '15 min', cost: 8 },
  tomatosoup: { name: 'Tomato soup with grilled cheese', minutes: '35 min', cost: 9 },
  fajitas: { name: 'Sheet-pan chicken fajitas', minutes: '30 min', cost: 16 },
  tacos: { name: 'Black bean and sweet potato tacos', minutes: '25 min', cost: 11 },
  spaghetti: { name: 'Spaghetti with turkey meatballs', minutes: '35 min', cost: 15 },
  friedrice: { name: 'Veggie fried rice with eggs', minutes: '20 min', cost: 9 },
  pizza: { name: 'Homemade margherita pizza', minutes: '40 min', cost: 14 },
  chili: { name: 'Slow-cooker beef chili', minutes: '15 min prep', cost: 21 },
  salmon: { name: 'Lemon garlic salmon with broccoli', minutes: '25 min', cost: 26 },
};
const DAYS: [string, string][] = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']];
const PLAN: [string, string, string][] = [
  ['oats', 'wraps', 'fajitas'], ['eggtoast', 'tunasalad', 'tacos'], ['parfait', 'quesadilla', 'spaghetti'], ['oats', 'chickensand', 'friedrice'],
  ['burritos', 'tomatosoup', 'pizza'], ['pancakes', 'wraps', 'chili'], ['eggtoast', 'quesadilla', 'salmon'],
];
const BUDGET = 220;
const PEOPLE = 4;
const TODAY = 0;
const PLAN_TOTAL = PLAN.reduce((s, d) => s + d.reduce((n, id) => n + M[id].cost, 0), 0);

const GROCERIES: [string, [string, number][]][] = [
  ['Produce', [['Bell peppers, 3', 3.75], ['Sweet potatoes, 2 lb', 2.98], ['Yellow onions, 3 lb bag', 3.49], ['Broccoli crowns, 1.5 lb', 2.97], ['Lemons, 2', 1.38], ['Cilantro, 1 bunch', 0.85], ['Bananas, 1 bunch', 1.74], ['Avocados, 4', 4.0], ['Baby spinach, 10 oz', 2.99]]],
  ['Meat and Seafood', [['Chicken breast, 2 lb', 8.98], ['Ground turkey, 1 lb', 5.49], ['Ground beef, 1.5 lb', 8.99], ['Salmon fillets, 1.25 lb', 12.49]]],
  ['Dairy and Eggs', [['Eggs, 1 dozen', 3.29], ['Shredded mozzarella, 8 oz', 2.99], ['Sour cream, 16 oz', 3.19], ['Butter, 1 lb', 4.42]]],
  ['Pantry', [['Black beans, 2 cans', 2.18], ['Kidney beans, 2 cans', 2.18], ['Crushed tomatoes, 2 cans', 3.58], ['Spaghetti, 1 lb', 1.49], ['Flour tortillas, 10 ct', 3.29], ['Pizza dough, 1 lb', 2.99], ['Chili seasoning', 1.29], ['Taco seasoning', 1.29], ['Soy sauce, 10 oz', 2.49]]],
  ['Frozen', [['Mixed vegetables, 2 bags', 4.58], ['Peas, 12 oz', 1.79], ['Sweet corn, 12 oz', 1.79], ['Mixed berries, 24 oz', 6.58]]],
];
const ALL_ITEMS = GROCERIES.flatMap(([, items]) => items);
const GROCERY_TOTAL = ALL_ITEMS.reduce((s, [, p]) => s + p, 0);
const PANTRY_SAVINGS = 17.8;
const SHELVES: [string, IconName, string[]][] = [
  ['Staples', 'basket', ['Rice', 'Olive oil', 'Flour', 'Sugar', 'Chicken broth']],
  ['Spices', 'leaf', ['Garlic', 'Salt', 'Black pepper', 'Chili powder', 'Cumin', 'Oregano']],
  ['Fridge', 'snow', ['Ketchup', 'Mustard', 'Mayonnaise', 'Parmesan']],
];
const PANTRY_COUNT = SHELVES.reduce((n, [, , items]) => n + items.length, 0);

const Pip = ({ pose, size, className }: { pose: string; size: number; className?: string }) => (
  <img className={`ph-pip ${className ?? ''}`} src={`/mascot/${pose}.svg`} alt="" width={size} height={size} draggable={false} />
);

const TABS: [string, IconName, IconName][] = [
  ['This Week', 'calendar', 'calendarOn'], ['Groceries', 'cart', 'cartOn'], ['Pantry', 'tray', 'trayOn'], ['Settings', 'cog', 'cogOn'],
];

// ---- This Week

function MealTile({ id, type, icon, ask }: { id: string; type: string; icon: IconName; ask: (s: string) => void }) {
  const m = M[id];
  return (
    <div className="ph-tile">
      <div className="ph-tile-body">
        <div className="ph-label"><Ion n={icon} s={14} color="var(--primary)" /><span className="ph-eyebrow" style={{ color: 'var(--primary)' }}>{type}</span></div>
        <div className="ph-tile-name">{m.name}</div>
        <div className="ph-foot13 ph-num">{m.minutes}</div>
      </div>
      <div className="ph-tile-foot">
        <span className="ph-money" style={{ fontSize: 18 }}>{`$${m.cost}`}</span>
        <button type="button" className="ph-mini" aria-label={`Keep ${m.name} when planning again`} onClick={() => ask('This is a preview. The real app is coming soon.')}><Ion n="bookmark" s={18} color="var(--primary)" /></button>
        <button type="button" className="ph-mini" aria-label={`Swap ${m.name}`} onClick={() => ask('This is a preview. The real app is coming soon.')}><Ion n="lock" s={18} color="var(--primary)" /></button>
      </div>
    </div>
  );
}

function DayCard({ d, ask }: { d: number; ask: (s: string) => void }) {
  const [b, l, dn] = PLAN[d];
  const total = M[b].cost + M[l].cost + M[dn].cost;
  const isToday = d === TODAY;
  const dm = M[dn];
  return (
    <div className="ph-card ph-daycard">
      <div className="ph-dayhead" style={isToday ? { background: 'var(--tint)' } : undefined}>
        <div className="ph-daytitle">
          <span className="ph-dayname">{DAYS[d][1]}</span>
          {isToday ? <span className="ph-today">TODAY</span> : null}
        </div>
        <div className="ph-daycost"><span className="ph-money">{`$${total}`}</span><span className="ph-foot13">est.</span></div>
      </div>
      <div className="ph-pair">
        <MealTile id={b} type="Breakfast" icon="sunny" ask={ask} />
        <MealTile id={l} type="Lunch" icon="partly-sunny" ask={ask} />
      </div>
      <div className="ph-dinner">
        <div className="ph-dinner-text">
          <div className="ph-label"><Ion n="moon" s={14} color="var(--primary)" /><span className="ph-eyebrow" style={{ color: 'var(--primary)' }}>Dinner</span></div>
          <div className="ph-dinner-name">{dm.name}</div>
          <div className="ph-meta"><span className="ph-sub ph-num">{dm.minutes}</span><span className="ph-sub">·</span><span className="ph-sub" style={{ color: 'var(--primary)', fontWeight: 600 }}>Recipe</span><Ion n="forward" s={13} color="var(--primary)" /></div>
        </div>
        <div className="ph-dinner-side">
          <span className="ph-money" style={{ fontSize: 24 }}>{`$${dm.cost}`}</span>
          <button type="button" className="ph-mini" aria-label={`Keep ${dm.name} when planning again`} onClick={() => ask('This is a preview. The real app is coming soon.')}><Ion n="bookmark" s={18} color="var(--primary)" /></button>
          <button type="button" className="ph-iconbtn" aria-label={`Swap ${dm.name}`} onClick={() => ask('This is a preview. The real app is coming soon.')}><Ion n="lock" s={20} color="var(--primary)" /></button>
        </div>
      </div>
    </div>
  );
}

// Counts up from zero when the screen opens, like the app's budget total.
function useCountUp(to: number) {
  const [v, setV] = useState(to);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 1100);
      setV(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    setV(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return v;
}

function Week({ ask }: { ask: (s: string) => void }) {
  const shown = useCountUp(PLAN_TOTAL);
  const [day, setDay] = useState(TODAY);
  const [dir, setDir] = useState(0);
  const down = useRef<{ x: number; y: number } | null>(null);
  const go = (n: number) => {
    if (n === day || n < 0 || n > 6) return;
    setDir(n > day ? 1 : -1);
    setDay(n);
  };
  const left = BUDGET - PLAN_TOTAL;
  const pct = Math.min(100, (PLAN_TOTAL / BUDGET) * 100);
  return (
    <>
      <div className="ph-header">
        <div className="ph-titlerow">
          <img className="ph-appicon" src="/app/icon.png" alt="" width={32} height={32} />
          <div>
            <h3 className="ph-largetitle">This Week</h3>
            <div className="ph-sub">{air('Oct 27 to Nov 2 · 4 people')}</div>
          </div>
        </div>
        <div className="ph-card ph-budget">
          <div className="ph-budgethead">
            <span className="ph-eyebrow">Budget</span>
            <span className="ph-num"><span className="ph-money" style={{ fontSize: 24 }}>{`$${shown}`}</span>{air(` of $${BUDGET} · est.`)}</span>
          </div>
          <div className="ph-track" role="progressbar" aria-valuemin={0} aria-valuemax={BUDGET} aria-valuenow={PLAN_TOTAL} aria-label={`Estimated $${PLAN_TOTAL} of $${BUDGET} budget`}><i style={{ width: `${pct}%` }} /></div>
          <div className="ph-under">
            <div className="ph-flex">
              <div className="ph-sub" style={{ color: 'var(--primary)', fontWeight: 500 }}>{`$${left} left this week`}</div>
              <div className="ph-foot13">{`About $${Math.round(PLAN_TOTAL / PEOPLE)} per person`}</div>
            </div>
            <Pip pose="cheer" size={64} className="ph-cheer" />
          </div>
        </div>
      </div>
      <div className="ph-scroll">
        <div>
          <div className="ph-chips" role="tablist">
            {DAYS.map(([s, long], i) => (
              <button key={s} type="button" role="tab" aria-selected={i === day} aria-label={long} className={`ph-chip${i === day ? ' on' : ''}`} onClick={() => go(i)}>
                {s}{i === TODAY ? <i /> : null}
              </button>
            ))}
          </div>
          <div
            className="ph-deck"
            onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
            onPointerUp={(e) => {
              const s = down.current; down.current = null;
              if (!s) return;
              const dx = e.clientX - s.x;
              if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.6) go(day + (dx < 0 ? 1 : -1));
            }}
          >
            <div key={day} className={dir === 0 ? '' : dir > 0 ? 'ph-in-right' : 'ph-in-left'}><DayCard d={day} ask={ask} /></div>
          </div>
          <div className="ph-foot13 ph-center">Swipe the card to see the next or the previous day</div>
        </div>
        <div className="ph-replan">
          <button type="button" className="ph-textbtn" onClick={() => ask('Planning again replaces this week. It uses one of your 3 free plans a month.')}>Plan this week again</button>
          <div className="ph-foot13">3 free plans left this month</div>
        </div>
        <div className="ph-card ph-savings">
          <div className="ph-headline">Your savings</div>
          <div className="ph-stat">
            <div className="ph-foot13">Kept off your list this week</div>
            <div className="ph-money" style={{ fontSize: 24 }}>{money(PANTRY_SAVINGS)}</div>
            <div className="ph-foot13">Already on your pantry shelf</div>
          </div>
        </div>
        <Estimate />
      </div>
    </>
  );
}

const Estimate = () => (
  <div className="ph-foot13">Prices, calories, nutrition and cook times are estimates, and Kelmi can make mistakes. Real amounts vary by store, brand and how you cook, so none of it is exact.</div>
);

// ---- Groceries

function Groceries({ ask }: { ask: (s: string) => void }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({ 'Bell peppers, 3': true, 'Yellow onions, 3 lb bag': true });
  const [open, setOpen] = useState<Record<string, boolean>>({ Produce: true });
  const done = ALL_ITEMS.filter(([n]) => checked[n]).length;
  return (
    <>
      <div className="ph-header">
        <div className="ph-headrow" style={{ gap: 12 }}>
          <h3 className="ph-largetitle ph-flex">Grocery List</h3>
          <button type="button" className="ph-iconbtn" aria-label="Add list to Reminders" onClick={() => ask('This is a preview. The real app is coming soon.')}><Ion n="checkbox" s={20} color="var(--primary)" /></button>
          <button type="button" className="ph-iconbtn" aria-label="Find grocery stores near you" onClick={() => ask('In the app this opens Maps with a search for grocery stores.')}><Ion n="location" s={20} color="var(--primary)" /></button>
          <button type="button" className="ph-iconbtn" aria-label="Share your grocery list" onClick={() => ask('This is a preview. The real app is coming soon.')}><Ion n="share" s={20} color="var(--primary)" /></button>
        </div>
        <div className="ph-summary">
          <div className="ph-flex">
            <div className="ph-sub ph-num" style={{ color: 'var(--text)' }}>{`${done} of ${ALL_ITEMS.length} items in your cart`}</div>
            <div className="ph-foot13">{air('Estimated total · US average prices')}</div>
            <div className="ph-foot13">Quantities for 4 people</div>
            <div className="ph-track" style={{ marginTop: 8 }}><i style={{ width: `${(done / ALL_ITEMS.length) * 100}%` }} /></div>
          </div>
          <span className="ph-money" style={{ fontSize: 24 }}>{money(GROCERY_TOTAL)}</span>
        </div>
        <div style={{ marginTop: -4 }}><button type="button" className="ph-textbtn" onClick={() => ask('In the app you pick which meals to buy for.')}>Change which meals to buy for</button></div>
      </div>
      <div className="ph-scroll">
        <div>
          <div className="ph-pantryrow">
            <Pip pose="save" size={64} className="ph-savepip" />
            <div className="ph-sub ph-flex" style={{ padding: '0 6px 4px' }}>
              On your pantry shelf: rice, olive oil, flour, and more. That saves about <b style={{ color: 'var(--text)', fontWeight: 700 }}>{money(PANTRY_SAVINGS)}</b> this week.
            </div>
          </div>
          <img className="ph-shelfimg" src="/app/shelf.png" alt="" />
        </div>
        {GROCERIES.map(([aisle, items]) => {
          const isOpen = !!open[aisle];
          return (
            <div className="ph-card ph-aisle" key={aisle}>
              <button type="button" className="ph-aislehead" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [aisle]: !isOpen }))}>
                <span className="ph-headline ph-flex" style={{ textAlign: 'left' }}>{aisle}</span>
                <span className="ph-sub ph-num">{air(`${items.length} · ${money(items.reduce((s, [, p]) => s + p, 0))}`)}</span>
                <span className="ph-chev" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}><Ion n="down" s={18} color="var(--muted)" /></span>
              </button>
              {isOpen ? items.map(([name, price]) => {
                const on = !!checked[name];
                return (
                  <button type="button" key={name} role="checkbox" aria-checked={on} className="ph-item" onClick={() => setChecked((c) => ({ ...c, [name]: !on }))}>
                    <span className={`ph-check${on ? ' on' : ''}`}><i><Ion n="check" s={15} color="var(--on-primary)" /></i></span>
                    <span className="ph-flex ph-itemname" style={on ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>{name}</span>
                    <span className="ph-sub ph-num">{money(price)}</span>
                  </button>
                );
              }) : null}
            </div>
          );
        })}
        <Estimate />
      </div>
    </>
  );
}

// ---- Pantry

function Pantry({ ask }: { ask: (s: string) => void }) {
  return (
    <>
      <div className="ph-header">
        <div className="ph-headrow" style={{ gap: 4 }}>
          <div className="ph-flex">
            <h3 className="ph-largetitle">Pantry</h3>
            <div className="ph-sub">What you already have</div>
          </div>
          <button type="button" className="ph-textbtn" onClick={() => ask('In the app, press and hold an item to rearrange or remove it.')}>Edit</button>
          <button type="button" className="ph-iconbtn" aria-label="Add an item" onClick={() => ask('In the app you pick a shelf, then tap what you already have.')}><Ion n="add" s={20} color="var(--primary)" /></button>
        </div>
      </div>
      <div className="ph-scroll">
        <div className="ph-pantrysum">
          <div className="ph-flex" style={{ gap: 2 }}>
            <div className="ph-bignum">{PANTRY_COUNT}</div>
            <div className="ph-headline">items on hand</div>
            <div className="ph-sub" style={{ color: 'var(--text)' }}>{`Kept off your list, saving about ${money(PANTRY_SAVINGS)} this week.`}</div>
          </div>
          <Pip pose="yum" size={104} className="ph-yum" />
        </div>
        {SHELVES.map(([name, icon, items]) => (
          <div className="ph-shelfcard" key={name}>
            <div className="ph-shelfhead">
              <span className="ph-badge"><Ion n={icon} s={16} color="var(--primary)" /></span>
              <span className="ph-shelfname">{name}</span>
              <span className="ph-count ph-num">{items.length}</span>
            </div>
            <div className="ph-items">{items.map((i) => <span className="ph-pill" key={i}>{i}</span>)}</div>
            <img className="ph-shelfart" src="/app/shelf.png" alt="" />
          </div>
        ))}
      </div>
    </>
  );
}

// ---- Settings

function Switch({ on, label, set }: { on: boolean; label: string; set: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`ph-switch${on ? ' on' : ''}`} onClick={() => set(!on)}><i /></button>;
}

function Section({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <div className="ph-section">
      <div className="ph-eyebrow ph-pad16">{title}</div>
      <div className="ph-card ph-group">{children}</div>
      {footer ? <div className="ph-foot13 ph-pad16">{footer}</div> : null}
    </div>
  );
}
const Row = ({ label, value, chevron, danger, action, children }: { label: string; value?: string; chevron?: boolean; danger?: boolean; action?: boolean; children?: ReactNode }) => (
  <div className="ph-row">
    <span className="ph-rowlabel" style={action ? { color: danger ? 'var(--danger)' : chevron ? 'var(--text)' : 'var(--primary)' } : undefined}>{label}</span>
    {value !== undefined ? <span className="ph-rowvalue">{value}</span> : <span className="ph-flex" />}
    {chevron ? <Ion n="forward" s={16} color="var(--control)" /> : null}
    {children}
  </div>
);

function Settings({ ask }: { ask: (s: string) => void }) {
  const [sun, setSun] = useState(false);
  const [list, setList] = useState(false);
  return (
    <>
      <div className="ph-header"><h3 className="ph-largetitle">Settings</h3></div>
      <div className="ph-scroll">
        <button type="button" className="ph-plancard" onClick={() => ask('This is a preview. The real app is coming soon.')}>
          <Pip pose="sleep" size={64} className="ph-planpip" />
          <div className="ph-flex" style={{ textAlign: 'left' }}>
            <div className="ph-headline">Free Plan</div>
            <div className="ph-sub">0 of 3 plans used this month</div>
          </div>
                  </button>
        <Section title="Household">
          <Row label="People eating" value="4" chevron />
          <Row label="Weekly budget" value="$220" chevron />
          <Row label="Diet" value="Everything" chevron />
          <Row label="Goal" value="Just eat well" chevron />
          <Row label="Meat" value="Some" chevron />
          <Row label="Allergies" value="Peanuts, Shellfish" chevron />
          <Row label="Dislikes" value="Mushrooms" chevron />
          <Row label="Foods you like" value="None yet" chevron />
          <Row label="Kitchen" value="Stovetop, Oven +1" chevron />
        </Section>
        <Section title="Preferences" footer="A preference, not a guarantee. Kelmi can’t check sugar or sodium, so put allergies in Allergies.">
          <div className="ph-notes">Low sugar, low sodium, easy on the stomach</div>
          <div className="ph-foot13 ph-notescount">0/300</div>
        </Section>
        <Section title="Language" footer="Recipes, ingredients, and your grocery list switch too.">
          <Row label="App language" value="Same as phone" chevron />
        </Section>
        <Section title="Shared list" footer="People you invite see the grocery list and can check items off.">
          <Row label="Members" value="Only you" />
          <Row label="Invite Someone" action />
        </Section>
        <Section title="Notifications">
          <div className="ph-row ph-switchrow"><div className="ph-flex"><div>Sunday plan reminder</div><div className="ph-foot13">Sundays at 5 PM</div></div><Switch on={sun} label="Sunday plan reminder" set={setSun} /></div>
          <div className="ph-row ph-switchrow"><div className="ph-flex"><div>Grocery list changes</div><div className="ph-foot13">When someone checks off or adds items</div></div><Switch on={list} label="Grocery list changes" set={setList} /></div>
        </Section>
        <Section title="Account" footer="Deleting your account removes your household, plans, and lists. Subscriptions are managed in your App Store or Google Play settings.">
          <Row label="Account" value="Example data, not saved" />
          <Row label="Restore Purchases" action />
          <Row label="Sign Out" action />
          <Row label="Delete Account" action danger />
        </Section>
        <Estimate />
        <Section title="About">
          <Row label="Terms of Service" chevron action />
          <Row label="Privacy Policy" chevron action />
          <Row label="Contact Us" chevron action />
          <Row label="Version" value="1.0.0" />
        </Section>
      </div>
    </>
  );
}

// ---- The phone

export function AppPreview() {
  const [tab, setTab] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ask = (s: string) => {
    setNote(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 3600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const screens = [<Week key="w" ask={ask} />, <Groceries key="g" ask={ask} />, <Pantry key="p" ask={ask} />, <Settings key="s" ask={ask} />];
  return (
    <div className="phone" aria-label="A copy of the Kelmi app, with example data">
      <div className="phone-body">
        <span className="phone-btn b1" /><span className="phone-btn b2" /><span className="phone-btn b3" /><span className="phone-btn b4" />
        <div className="phone-screen">
          <div className="ph-status" aria-hidden="true">
            <span className="ph-time">9:41</span>
            <span className="ph-sys">
              <svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
              <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.3c2.3 0 4.4.9 6 2.4l1-1.1A10.4 10.4 0 0 0 8.5.8C5.8.8 3.3 1.8 1.5 3.6l1 1.1a8.6 8.6 0 0 1 6-2.4Zm0 3.7c1.3 0 2.500.5 3.4 1.300l1-1.100a6.600 6.600 0 0 0-8.800 0l1 1.100c.9-.8 2.100-1.300 3.400-1.300Zm0 3.600c.6 0 1.100.2 1.500.6L8.500 12 7 10.200c.4-.4.900-.6 1.500-.6Z" /></svg>
              <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="22" height="12" rx="3.800" fill="none" stroke="currentColor" opacity=".4" /><rect x="2" y="2" width="19" height="9" rx="2.500" /><path d="M24 4.500v4c.8-.3 1.500-1.100 1.500-2s-.7-1.700-1.500-2Z" opacity=".45" /></svg>
            </span>
          </div>
          <div className="phone-island" aria-hidden="true" />
          <div key={tab} className="ph-tab">{screens[tab]}</div>
          {note ? <div className="ph-note" role="status" key={note}><Pip pose="cheer" size={44} /><span>{note}</span></div> : null}
          <nav className="ph-tabbar" aria-label="Kelmi tabs">
            {TABS.map(([label, off, on], i) => (
              <button key={label} type="button" className={`ph-tabitem${i === tab ? ' on' : ''}`} aria-current={i === tab ? 'page' : undefined} onClick={() => { setTab(i); setNote(null); }}>
                <Ion n={i === tab ? on : off} s={24} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="ph-home" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
