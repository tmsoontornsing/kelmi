import { Accordion } from '../components/Accordion';
import { AppPreview } from '../components/AppPreview';
import { Aurora } from '../components/Aurora';
import { Depth } from '../components/Depth';
import { Motion } from '../components/Motion';
import { Pip } from '../components/Pip';
import { Pricing } from '../components/Pricing';
import { ThemeToggle } from '../components/ThemeToggle';
import { Words } from '../components/Words';
import { APP_STORE_URL, COMPANY, PLAY_STORE_URL } from '../links';

const FAQ: [string, string][] = [
  ['What does Kelmi cost?', 'Kelmi is free, with 3 weekly plans a month. Paid plans may come later, and if they do we’ll tell you before you’re charged anything.'],
  ['How does Kelmi keep meals inside my budget?', 'You set a weekly grocery budget and Pip picks meals that aim to fit it, scaled to your household. Prices are estimates and your store’s prices will vary.'],
  ['Can Kelmi work around allergies and diets?', 'Kelmi helps you filter out ingredients you list, but it is not a guarantee. Recipe tags can be wrong or incomplete and products vary by brand, so always read labels yourself, and talk to a doctor about food allergies.'],
  ['What if I already have food at home?', 'Add what’s in your pantry and Kelmi leaves it off your grocery list and shows how much that saved.'],
  ['Which phones does Kelmi run on?', 'iPhone and Android. Kelmi is for ages 13 and up in the United States.'],
  ['What happens to my data?', 'Kelmi sends your food details to an AI provider only if you allow it in the app. Read the Privacy Policy for the full picture.'],
];

// Meals and what they cost, from the app's example data. They are examples, not a promise of what your week will cost.
const MEALS: [string, number][] = [
  ['Overnight oats with berries', 4], ['Sheet-pan chicken fajitas', 16], ['Black bean quesadillas', 8], ['Banana pancakes', 4],
  ['Spaghetti with turkey meatballs', 15], ['Tuna and chickpea salad', 8], ['Veggie fried rice with eggs', 9], ['Lentil soup with crusty bread', 8],
  ['Homemade margherita pizza', 14], ['Turkey and avocado wraps', 10], ['Chicken pesto pasta', 13], ['Spinach scramble on toast', 5],
];
const DAYS: [string, number][] = [['M', 30], ['T', 24], ['W', 28], ['T', 21], ['F', 29], ['S', 35], ['S', 21]];

function Store({ href, small, big }: { href: string; small: string; big: string }) {
  return (
    href ? (
      <a className="btn store" href={href}><small>{small}</small><b>{big}</b></a>
    ) : (
      <span className="btn store soon" aria-label={`${big}: coming soon`}><small>Coming soon to</small><b>{big}</b></span>
    )
  );
}

const Ico = ({ d }: { d: string }) => <svg className="step-ico" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;

export default function Home() {
  return (
    <>
      <Motion />
      <Aurora />
      <span id="top" />
      <header className="nav">
        <div className="wrap">
          <a className="brand" href="#top" aria-label="Kelmi home">
            <span className="pipbadge"><img src="/pip-mark.svg" alt="" /></span>
            Kelmi
          </a>
          <div className="navright">
            <ThemeToggle />
            <a className="btn small" href="#features">See what’s coming</a>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <Depth set="hero" />
          <div className="wrap">
            <div>
              <p className="eyebrow-live"><i />Coming soon to the App Store</p>
              <h1 className="display hero-title" data-words="load"><Words text="Every meal of the week, planned around your grocery budget." /></h1>
              <p className="lede">Meet Pip, the jar that plans your week. Tell Kelmi who you cook for and what you spend, and Pip fills the week with meals that fit.</p>
              <div className="ctas">
                <Store href={APP_STORE_URL} small="Download on the" big="App Store" />
                <Store href={PLAY_STORE_URL} small="Get it on" big="Google Play" />
              </div>
              <p className="footnote">Free. 3 plans a month, no card needed. For ages 13+ in the United States.</p>
            </div>
            <div className="stagewrap">
              <div className="device">
                <div className="hero-pip"><Pip pose="wave" /></div><div className="device-in" data-depth="0.1" data-tilt><AppPreview /></div></div>
            </div>
          </div>
        </section>

        <div className="marquee" aria-label="Example meals Kelmi plans, with estimated costs">
          <div className="marquee-track">
            {[0, 1].map((n) => (
              <div key={n} style={{ display: 'flex', gap: 12 }} aria-hidden={n === 1 ? 'true' : undefined}>
                {MEALS.map(([name, cost]) => <span className="chip" key={name + n}>{name}<b>${cost}</b></span>)}
              </div>
            ))}
          </div>
        </div>

        <section id="how">
          <Depth set="how" />
          <div className="wrap">
            <div className="sechead" data-depth="-0.05">
              <p className="label">How it works</p>
              <h2 className="display h2" data-words><Words text="Three steps, then dinner is sorted." /></h2>
            </div>
            <div className="steps">
              {[
                ['M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z', 'Tell Pip about your home', 'Who you cook for, what you spend, what everyone eats, and what’s in your kitchen.'],
                ['M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z', 'Pip plans the week', 'Breakfast, lunch and dinner for seven days, with the cost shown before you buy.'],
                ['M3 4h2l2.4 11h10.2L20 8H6.2M9 20h.01M17 20h.01', 'Shop from one list', 'One grocery list for the week. Anything already in your pantry stays off it.'],
              ].map(([d, h, p], i) => (
                <div className="step" key={h}>
                  <div className="step-n">0{i + 1}</div>
                  <Ico d={d} />
                  <h3>{h}</h3>
                  <p>{p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features">
          <Depth set="features" />
          <div className="wrap">
            <div className="sechead" data-depth="-0.05">
              <p className="label">What Kelmi does</p>
              <h2 className="display h2" data-words><Words text="Everything a week of meals needs." /></h2>
            </div>
            <div className="bento">
              <article className="tile t-budget" id="t-budget">
                <div className="perch"><Pip pose="save" /></div>
                <div className="copy"><h3>Plans around your budget</h3><p>Pip picks cheaper recipes first and shows the estimated cost of the week, scaled to your household.</p></div>
                <div className="vis">
                  <div className="b-top"><span className="b-num" data-count="188" data-dec="2" data-prefix="$">$188.00</span><span className="b-of">of a $200 budget · example week</span></div>
                  <div className="b-bars" aria-hidden="true">
                    {DAYS.map(([d, v], i) => <div className="b-bar" key={i} style={{ '--p': v / 35, '--i': i } as React.CSSProperties}><i />{d}</div>)}
                  </div>
                </div>
              </article>

              <article className="tile t-likes" id="t-likes">
                <div className="copy"><h3>Your favorites first</h3><p>Tell Pip what you love and it lands in your week first.</p></div>
                <div className="vis">
                  <div className="chips">
                    {['Curry', 'Pasta', 'Tacos', 'Stir-fry', 'Soup', 'Pizza', 'Rice bowls', 'Salads'].map((c, i) => (
                      <span className={`pill${i % 3 === 0 ? ' cycle' : ''}`} style={{ '--i': i } as React.CSSProperties} key={c}>{c}</span>
                    ))}
                  </div>
                  <p className="note">Picked first, every week</p>
                </div>
              </article>

              <article className="tile t-groc" id="t-groc">
                <div className="copy"><h3>One grocery list</h3><p>The whole week, minus your pantry.</p></div>
                <div className="vis">
                  <div className="g-list" aria-hidden="true">
                    {[['Spinach', '2 bags'], ['Chicken breast', '1.5 lb'], ['Black beans', '3 cans'], ['Spaghetti', '1 lb']].map(([n, q], i) => (
                      <div className="g-row" style={{ '--i': i } as React.CSSProperties} key={n}>
                        <span className="g-box"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
                        <span className="g-name">{n}</span><span className="g-qty">{q}</span>
                      </div>
                    ))}
                  </div>
                  <div className="saved"><span>Kept off your list (example)</span><b className="mono">$12.40</b></div>
                </div>
              </article>

              <article className="tile t-swap" id="t-swap">
                <div className="copy"><h3>Swap any meal</h3><p>Not feeling it? Pip offers others that still fit.</p></div>
                <div className="vis">
                  <div className="s-card" aria-hidden="true">
                    <div className="s-stack">
                      {[['Chicken pesto pasta', '25 min · $13'], ['Lentil soup with crusty bread', '40 min · $8'], ['Hummus and veggie pitas', '10 min · $8']].map(([n, m]) => (
                        <div className="s-meal" key={n}><b>{n}</b><span>{m}</span></div>
                      ))}
                    </div>
                    <span className="s-btn"><svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg></span>
                  </div>
                  <div className="s-alt" aria-hidden="true"><i /><i /><i /><span>Same budget, new dinner</span></div>
                </div>
              </article>

              <article className="tile t-cook" id="t-cook">
                <div className="copy"><h3>Cook mode</h3><p>One step at a time, with the screen kept awake.</p></div>
                <div className="vis">
                  <div className="c-wrap" aria-hidden="true">
                    <div className="ring"><svg viewBox="0 0 84 84"><circle className="bg" cx="42" cy="42" r="34" /><circle className="fg" cx="42" cy="42" r="34" /></svg><span>4:00</span></div>
                    <div className="c-step"><b>Sauté the onions until soft</b><span>Step 3 of 5</span></div>
                  </div>
                  <div className="c-dots" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>
                </div>
              </article>

              <article className="tile t-widget" id="t-widget">
                <div className="copy"><h3>On your home screen</h3><p>A widget for today’s meals and your grocery progress.</p></div>
                <div className="vis">
                  <div className="widget" aria-hidden="true">
                    <div className="w-head"><span>Today</span><img src="/pip-mark.svg" alt="" /></div>
                    <div className="w-row"><em>Bkfst</em>Overnight oats with berries</div>
                    <div className="w-row"><em>Lunch</em>Turkey and avocado wraps</div>
                    <div className="w-row"><em>Dinner</em>Sheet-pan chicken fajitas</div>
                    <div className="w-bar"><i /></div>
                  </div>
                </div>
              </article>

              <article className="tile t-diet" id="t-diet">
                <div className="copy"><h3>Allergies and diets</h3><p>Tell Pip what to avoid and Kelmi filters out matching recipes. It’s a helper, not a guarantee: always read labels yourself.</p></div>
                <div className="vis">
                  <div className="chips" aria-hidden="true">
                    {['Vegetarian', 'Pescatarian', 'Vegan', 'Lower carb', 'Halal', 'Peanuts', 'Dairy', 'Gluten', 'Eggs', 'Soy'].map((c, i) => (
                      <span className="pill tog" style={{ '--i': i } as React.CSSProperties} key={c}>{c}</span>
                    ))}
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="pricing">
          <Depth set="pricing" />
          <div className="wrap">
            <div className="sechead" data-depth="-0.05">
              <p className="label">Pricing</p>
              <h2 className="display h2" data-words><Words text="Free to start, no card needed." /></h2>
            </div>
            <Pricing />
          </div>
        </section>

        <section className="waitlist" id="coming-soon">
          <div className="wrap">
            <div className="box">
              <Depth set="box" />
              <div className="perch"><Pip pose="cheer" /></div>
              <h2 className="display" data-words><Words text="Meet Pip. Coming soon to the App Store." /></h2>
              <p className="lede">A week of meals that fit your budget, in your pocket. Kelmi is on its way.</p>
              <div className="ctas">
                <Store href={APP_STORE_URL} small="Download on the" big="App Store" />
              </div>
            </div>
          </div>
        </section>

        <section id="faq">
          <Depth set="faq" />
          <div className="wrap">
            <div className="sechead faq-head" id="faq-head">
              <p className="label">Questions</p>
              <h2 className="display h2" data-words><Words text="Good to know." /></h2>
            </div>
            <Accordion items={FAQ} />
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="row">
            <div>
              <a className="brand" href="#top" style={{ fontSize: 22 }}><span className="pipbadge"><img src="/pip-mark.svg" alt="" /></span>Kelmi</a>
              <p className="footnote" style={{ marginTop: 10 }}>© {new Date().getFullYear()} {COMPANY}</p>
              <p className="footnote" style={{ marginTop: 6, maxWidth: 460 }}>Prices, savings, calories and cook times shown on this site are examples and estimates, not quotes or guarantees. Your costs will vary by store, brand and location.</p>
            </div>
            <nav aria-label="Legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/consumer-health-data">Health data</a><a href="/delete-account">Delete account</a></nav>
          </div>
          <div className="sleepspot" aria-hidden="true"><Pip pose="sleep" /></div>
          <div className="bigword" aria-hidden="true">{'Kelmi'.split('').map((c, i) => <span key={i} data-depth={0.06 + i * 0.05}>{c}</span>)}</div>
        </div>
      </footer>
    </>
  );
}
