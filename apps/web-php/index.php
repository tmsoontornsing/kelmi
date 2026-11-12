<?php
require __DIR__ . '/includes/helpers.php';

$faq = [
    ['What does Kelmi cost?', 'Kelmi is free, with 3 weekly plans a month. Paid plans may come later, and if they do we’ll tell you before you’re charged anything.'],
    ['How does Kelmi keep meals inside my budget?', 'You set a weekly grocery budget and Pip picks meals that aim to fit it, scaled to your household. Prices are estimates and your store’s prices will vary.'],
    ['Can Kelmi work around allergies and diets?', 'Kelmi helps you filter out ingredients you list, but it is not a guarantee. Recipe tags can be wrong or incomplete and products vary by brand, so always read labels yourself, and talk to a doctor about food allergies.'],
    ['What if I already have food at home?', 'Add what’s in your pantry and Kelmi leaves it off your grocery list and shows how much that saved.'],
    ['Which phones does Kelmi run on?', 'iPhone and Android. Kelmi is for ages 13 and up in the United States.'],
    ['What happens to my data?', 'Kelmi sends your food details to an AI provider only if you allow it in the app. Read the Privacy Policy for the full picture.'],
];

// Meals and what they cost, from the app's example data. They are examples, not a promise of what your week will cost.
$meals = [
    ['Overnight oats with berries', 4], ['Sheet-pan chicken fajitas', 16], ['Black bean quesadillas', 8], ['Banana pancakes', 4],
    ['Spaghetti with turkey meatballs', 15], ['Tuna and chickpea salad', 8], ['Veggie fried rice with eggs', 9], ['Lentil soup with crusty bread', 8],
    ['Homemade margherita pizza', 14], ['Turkey and avocado wraps', 10], ['Chicken pesto pasta', 13], ['Spinach scramble on toast', 5],
];
$days = [['M', 30], ['T', 24], ['W', 28], ['T', 21], ['F', 29], ['S', 35], ['S', 21]];
$steps = [
    ['M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z', 'Tell Pip about your home', 'Who you cook for, what you spend, what everyone eats, and what’s in your kitchen.'],
    ['M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z', 'Pip plans the week', 'Breakfast, lunch and dinner for seven days, with the cost shown before you buy.'],
    ['M3 4h2l2.4 11h10.2L20 8H6.2M9 20h.01M17 20h.01', 'Shop from one list', 'One grocery list for the week. Anything already in your pantry stays off it.'],
];

page_start('Kelmi: Meal Plans on a Budget', true, '/');
?>
<span id="top"></span>
<?= aurora() ?>
<header class="nav">
  <div class="wrap">
    <a class="brand" href="#top" aria-label="Kelmi home"><span class="pipbadge"><img src="/pip-mark.svg" alt=""></span>Kelmi</a>
    <div class="navright"><?= theme_toggle() ?><a class="btn small" href="#features">See what’s coming</a></div>
  </div>
</header>

<main>
  <section class="hero">
    <?= depth('hero') ?>
    <div class="wrap">
      <div>
        <p class="eyebrow-live"><i></i>Coming soon to the App Store</p>
        <h1 class="display hero-title" data-words="load"><?= words('Every meal of the week, planned around your grocery budget.') ?></h1>
        <p class="lede">Meet Pip, the jar that plans your week. Tell Kelmi who you cook for and what you spend, and Pip fills the week with meals that fit.</p>
        <div class="ctas">
          <?= store_badge(APP_STORE_URL, 'Download on the', 'App Store') ?>
          <?= store_badge(PLAY_STORE_URL, 'Get it on', 'Google Play') ?>
        </div>
        <p class="footnote">Free. 3 plans a month, no card needed. For ages 13+ in the United States.</p>
      </div>
      <div class="stagewrap">
        <div class="device">
          <div class="hero-pip"><?= pip('wave') ?></div><div class="device-in" data-depth="0.1" data-tilt><?php include __DIR__ . '/includes/app-preview.php'; ?></div></div>
      </div>
    </div>
  </section>

  <div class="marquee" aria-label="Example meals Kelmi plans, with estimated costs">
    <div class="marquee-track">
      <?php foreach ([0, 1] as $n): ?>
      <div style="display:flex;gap:12px"<?= $n === 1 ? ' aria-hidden="true"' : '' ?>>
        <?php foreach ($meals as [$name, $cost]): ?><span class="chip"><?= h($name) ?><b>$<?= $cost ?></b></span><?php endforeach; ?>
      </div>
      <?php endforeach; ?>
    </div>
  </div>

  <section id="how">
    <?= depth('how') ?>
    <div class="wrap">
      <div class="sechead" data-depth="-0.05">
        <p class="label">How it works</p>
        <h2 class="display h2" data-words><?= words('Three steps, then dinner is sorted.') ?></h2>
      </div>
      <div class="steps">
        <?php foreach ($steps as $i => [$d, $hd, $p]): ?>
        <div class="step">
          <div class="step-n">0<?= $i + 1 ?></div>
          <svg class="step-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="<?= h($d) ?>"/></svg>
          <h3><?= h($hd) ?></h3>
          <p><?= h($p) ?></p>
        </div>
        <?php endforeach; ?>
      </div>
    </div>
  </section>

  <section id="features">
    <?= depth('features') ?>
    <div class="wrap">
      <div class="sechead" data-depth="-0.05">
        <p class="label">What Kelmi does</p>
        <h2 class="display h2" data-words><?= words('Everything a week of meals needs.') ?></h2>
      </div>
      <div class="bento">
        <article class="tile t-budget" id="t-budget">
          <div class="perch"><?= pip('save') ?></div>
          <div class="copy"><h3>Plans around your budget</h3><p>Pip picks cheaper recipes first and shows the estimated cost of the week, scaled to your household.</p></div>
          <div class="vis">
            <div class="b-top"><span class="b-num" data-count="188" data-dec="2" data-prefix="$">$188.00</span><span class="b-of">of a $200 budget · example week</span></div>
            <div class="b-bars" aria-hidden="true">
              <?php foreach ($days as $i => [$d, $v]): ?><div class="b-bar" style="--p:<?= round($v / 35, 6) ?>;--i:<?= $i ?>"><i></i><?= $d ?></div><?php endforeach; ?>
            </div>
          </div>
        </article>

        <article class="tile t-likes" id="t-likes">
          <div class="copy"><h3>Your favorites first</h3><p>Tell Pip what you love and it lands in your week first.</p></div>
          <div class="vis">
            <div class="chips">
              <?php foreach (['Curry', 'Pasta', 'Tacos', 'Stir-fry', 'Soup', 'Pizza', 'Rice bowls', 'Salads'] as $i => $c): ?><span class="pill<?= $i % 3 === 0 ? ' cycle' : '' ?>" style="--i:<?= $i ?>"><?= h($c) ?></span><?php endforeach; ?>
            </div>
            <p class="note">Picked first, every week</p>
          </div>
        </article>

        <article class="tile t-groc" id="t-groc">
          <div class="copy"><h3>One grocery list</h3><p>The whole week, minus your pantry.</p></div>
          <div class="vis">
            <div class="g-list" aria-hidden="true">
              <?php foreach ([['Spinach', '2 bags'], ['Chicken breast', '1.5 lb'], ['Black beans', '3 cans'], ['Spaghetti', '1 lb']] as $i => [$n, $q]): ?>
              <div class="g-row" style="--i:<?= $i ?>">
                <span class="g-box"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>
                <span class="g-name"><?= h($n) ?></span><span class="g-qty"><?= h($q) ?></span>
              </div>
              <?php endforeach; ?>
            </div>
            <div class="saved"><span>Kept off your list (example)</span><b class="mono">$12.40</b></div>
          </div>
        </article>

        <article class="tile t-swap" id="t-swap">
          <div class="copy"><h3>Swap any meal</h3><p>Not feeling it? Pip offers others that still fit.</p></div>
          <div class="vis">
            <div class="s-card" aria-hidden="true">
              <div class="s-stack">
                <?php foreach ([['Chicken pesto pasta', '25 min · $13'], ['Lentil soup with crusty bread', '40 min · $8'], ['Hummus and veggie pitas', '10 min · $8']] as [$n, $m]): ?>
                <div class="s-meal"><b><?= h($n) ?></b><span><?= h($m) ?></span></div>
                <?php endforeach; ?>
              </div>
              <span class="s-btn"><svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg></span>
            </div>
            <div class="s-alt" aria-hidden="true"><i></i><i></i><i></i><span>Same budget, new dinner</span></div>
          </div>
        </article>

        <article class="tile t-cook" id="t-cook">
          <div class="copy"><h3>Cook mode</h3><p>One step at a time, with the screen kept awake.</p></div>
          <div class="vis">
            <div class="c-wrap" aria-hidden="true">
              <div class="ring"><svg viewBox="0 0 84 84"><circle class="bg" cx="42" cy="42" r="34"/><circle class="fg" cx="42" cy="42" r="34"/></svg><span>4:00</span></div>
              <div class="c-step"><b>Sauté the onions until soft</b><span>Step 3 of 5</span></div>
            </div>
            <div class="c-dots" aria-hidden="true"><?php for ($i = 0; $i < 5; $i++): ?><i style="--i:<?= $i ?>"></i><?php endfor; ?></div>
          </div>
        </article>

        <article class="tile t-widget" id="t-widget">
          <div class="copy"><h3>On your home screen</h3><p>A widget for today’s meals and your grocery progress.</p></div>
          <div class="vis">
            <div class="widget" aria-hidden="true">
              <div class="w-head"><span>Today</span><img src="/pip-mark.svg" alt=""></div>
              <div class="w-row"><em>Bkfst</em>Overnight oats with berries</div>
              <div class="w-row"><em>Lunch</em>Turkey and avocado wraps</div>
              <div class="w-row"><em>Dinner</em>Sheet-pan chicken fajitas</div>
              <div class="w-bar"><i></i></div>
            </div>
          </div>
        </article>

        <article class="tile t-diet" id="t-diet">
          <div class="copy"><h3>Allergies and diets</h3><p>Tell Pip what to avoid and Kelmi filters out matching recipes. It’s a helper, not a guarantee: always read labels yourself.</p></div>
          <div class="vis">
            <div class="chips" aria-hidden="true">
              <?php foreach (['Vegetarian', 'Pescatarian', 'Vegan', 'Lower carb', 'Halal', 'Peanuts', 'Dairy', 'Gluten', 'Eggs', 'Soy'] as $i => $c): ?><span class="pill tog" style="--i:<?= $i ?>"><?= h($c) ?></span><?php endforeach; ?>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <section id="pricing">
    <?= depth('pricing') ?>
    <div class="wrap">
      <div class="sechead" data-depth="-0.05">
        <p class="label">Pricing</p>
        <h2 class="display h2" data-words><?= words('Free to start, no card needed.') ?></h2>
      </div>
      <div class="pricing">
        <div class="pricegrid">
          <div class="price">
            <h3>Free</h3>
            <p class="amount"><span>$0</span></p>
            <p class="billed">No card needed</p>
            <ul><li>3 weekly plans a month</li><li>Grocery list and pantry</li><li>Swap any meal</li></ul>
          </div>
          <div class="price best">
            <h3>Kelmi Plus <small>(coming later)</small></h3>
            <p class="amount"><span>$59</span><small>/ year</small></p>
            <p class="billed">About $4.92 a month, or $7.99 billed monthly</p>
            <ul><li>Up to 40 plans a month, one for every week</li><li>Cook mode with step timers</li><li>Savings report and full nutrition</li><li>No limit on pantry items</li></ul>
          </div>
        </div>
        <p class="footnote">Kelmi Plus is not available yet. When it is, we will tell you before you are charged anything.</p>
      </div>
    </div>
  </section>

  <section class="waitlist" id="coming-soon">
    <div class="wrap">
      <div class="box">
        <?= depth('box') ?>
        <div class="perch"><?= pip('cheer') ?></div>
        <h2 class="display" data-words><?= words('Meet Pip. Coming soon to the App Store.') ?></h2>
        <p class="lede">A week of meals that fit your budget, in your pocket. Kelmi is on its way.</p>
        <div class="ctas"><?= store_badge(APP_STORE_URL, 'Download on the', 'App Store') ?></div>
      </div>
    </div>
  </section>

  <section id="faq">
    <?= depth('faq') ?>
    <div class="wrap">
      <div class="sechead faq-head" id="faq-head">
        <p class="label">Questions</p>
        <h2 class="display h2" data-words><?= words('Good to know.') ?></h2>
      </div>
      <div class="qas">
        <?php foreach ($faq as $i => [$q, $a]): ?>
        <div class="qa">
          <button type="button" class="qa-head" aria-expanded="false" aria-controls="qa-<?= $i ?>" id="qa-h-<?= $i ?>">
            <span class="qa-n"><?= sprintf('%02d', $i + 1) ?></span>
            <span class="qa-q"><?= h($q) ?></span>
            <span class="qa-ico" aria-hidden="true"><i></i><i></i></span>
          </button>
          <div class="qa-panel" id="qa-<?= $i ?>" role="region" aria-labelledby="qa-h-<?= $i ?>"><div><p><?= h($a) ?></p></div></div>
        </div>
        <?php endforeach; ?>
      </div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <div class="row">
      <div>
        <a class="brand" href="#top" style="font-size:22px"><span class="pipbadge"><img src="/pip-mark.svg" alt=""></span>Kelmi</a>
        <p class="footnote" style="margin-top:10px">© <?= date('Y') ?> <?= h(COMPANY) ?></p>
        <p class="footnote" style="margin-top:6px;max-width:460px">Prices, savings, calories and cook times shown on this site are examples and estimates, not quotes or guarantees. Your costs will vary by store, brand and location.</p>
      </div>
      <?= legal_nav() ?>
    </div>
    <div class="sleepspot" aria-hidden="true"><?= pip('sleep') ?></div>
    <div class="bigword" aria-hidden="true"><?php foreach (str_split('Kelmi') as $i => $c): ?><span data-depth="<?= 0.06 + $i * 0.05 ?>"><?= $c ?></span><?php endforeach; ?></div>
  </div>
</footer>
<script src="/assets/app-preview.js?v=<?= (int) @filemtime(__DIR__ . "/assets/app-preview.js") ?>" defer></script>
<?php page_end();
