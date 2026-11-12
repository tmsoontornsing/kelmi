<?php
// Server-rendered copy of the Kelmi app's four tabs inside an iPhone (port of components/AppPreview.tsx).
// Markup and class names match the React output. assets/app-preview.js adds the interactions: it clones the
// <template> screens below (each tab opens fresh, like the React remount) and toggles classes on the live markup.
// Nothing here is a real plan.

if (!function_exists('phx_e')) {
    function phx_e($s) { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
}

global $PHX_ION, $PHX_M, $PHX_DAYS, $PHX_PLAN, $PHX_PLAN_TOTAL, $PHX_GROCERIES, $PHX_ALL_COUNT, $PHX_GROCERY_TOTAL, $PHX_CHECKED0, $PHX_OPEN0, $PHX_SHELVES, $PHX_PANTRY_COUNT, $PHX_TABS;
function phx_chr($cp) { return html_entity_decode('&#' . $cp . ';', ENT_QUOTES, 'UTF-8'); }
$PHX_ION = [
    'sunny' => 0xf5ae, 'partly-sunny' => 0xf491, 'moon' => 0xf461, 'swap' => 0xf5b0, 'bookmark' => 0xf1a9,
    'forward' => 0xf23b, 'down' => 0xf232, 'location' => 0xf3c5, 'share' => 0xf572, 'checkbox' => 0xf21b,
    'check' => 0xf21d, 'lock' => 0xf3c8, 'lockfill' => 0xf3c7, 'add' => 0xf103, 'calendar' => 0xf1d6,
    'calendarOn' => 0xf1cf, 'cart' => 0xf203, 'cartOn' => 0xf202, 'cog' => 0xf56c, 'cogOn' => 0xf56b,
    'tray' => 0xf2fc, 'trayOn' => 0xf2fb, 'basket' => 0xf17c, 'leaf' => 0xf3b3, 'snow' => 0xf58a,
];
function phx_ion($n, $s = 20, $color = null) {
    global $PHX_ION;
    $style = 'font-size:' . $s . 'px;' . ($color !== null ? 'color:' . $color . ';' : '');
    return '<span class="ion" style="' . phx_e(rtrim($style, ';')) . '" aria-hidden="true">' . phx_chr($PHX_ION[$n]) . '</span>';
}

// The app puts a hair space around " · " because Outfit sets the dot tight.
function phx_air($s) { return str_replace(' · ', " \u{2009}·\u{2009} ", $s); }
function phx_money($n) { return '$' . number_format($n, 2, '.', ''); }

$PHX_M = [
    'oats' => ['Overnight oats with berries', '5 min prep', 4],
    'eggtoast' => ['Spinach scramble on toast', '15 min', 5],
    'parfait' => ['Yogurt and granola parfaits', '5 min', 5],
    'pancakes' => ['Banana pancakes', '20 min', 4],
    'burritos' => ['Egg and bean breakfast burritos', '20 min', 6],
    'wraps' => ['Turkey and avocado wraps', '10 min', 10],
    'tunasalad' => ['Tuna and chickpea salad', '15 min', 8],
    'quesadilla' => ['Black bean quesadillas', '20 min', 8],
    'chickensand' => ['Chicken salad sandwiches', '15 min', 8],
    'tomatosoup' => ['Tomato soup with grilled cheese', '35 min', 9],
    'fajitas' => ['Sheet-pan chicken fajitas', '30 min', 16],
    'tacos' => ['Black bean and sweet potato tacos', '25 min', 11],
    'spaghetti' => ['Spaghetti with turkey meatballs', '35 min', 15],
    'friedrice' => ['Veggie fried rice with eggs', '20 min', 9],
    'pizza' => ['Homemade margherita pizza', '40 min', 14],
    'chili' => ['Slow-cooker beef chili', '15 min prep', 21],
    'salmon' => ['Lemon garlic salmon with broccoli', '25 min', 26],
];
$PHX_DAYS = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']];
$PHX_PLAN = [
    ['oats', 'wraps', 'fajitas'], ['eggtoast', 'tunasalad', 'tacos'], ['parfait', 'quesadilla', 'spaghetti'], ['oats', 'chickensand', 'friedrice'],
    ['burritos', 'tomatosoup', 'pizza'], ['pancakes', 'wraps', 'chili'], ['eggtoast', 'quesadilla', 'salmon'],
];
const PHX_BUDGET = 220;
const PHX_PEOPLE = 4;
const PHX_TODAY = 0;
const PHX_PANTRY_SAVINGS = 17.8;
$PHX_PLAN_TOTAL = 0;
foreach ($PHX_PLAN as $d) { foreach ($d as $id) { $PHX_PLAN_TOTAL += $PHX_M[$id][2]; } }

$PHX_GROCERIES = [
    ['Produce', [['Bell peppers, 3', 3.75], ['Sweet potatoes, 2 lb', 2.98], ['Yellow onions, 3 lb bag', 3.49], ['Broccoli crowns, 1.5 lb', 2.97], ['Lemons, 2', 1.38], ['Cilantro, 1 bunch', 0.85], ['Bananas, 1 bunch', 1.74], ['Avocados, 4', 4.0], ['Baby spinach, 10 oz', 2.99]]],
    ['Meat and Seafood', [['Chicken breast, 2 lb', 8.98], ['Ground turkey, 1 lb', 5.49], ['Ground beef, 1.5 lb', 8.99], ['Salmon fillets, 1.25 lb', 12.49]]],
    ['Dairy and Eggs', [['Eggs, 1 dozen', 3.29], ['Shredded mozzarella, 8 oz', 2.99], ['Sour cream, 16 oz', 3.19], ['Butter, 1 lb', 4.42]]],
    ['Pantry', [['Black beans, 2 cans', 2.18], ['Kidney beans, 2 cans', 2.18], ['Crushed tomatoes, 2 cans', 3.58], ['Spaghetti, 1 lb', 1.49], ['Flour tortillas, 10 ct', 3.29], ['Pizza dough, 1 lb', 2.99], ['Chili seasoning', 1.29], ['Taco seasoning', 1.29], ['Soy sauce, 10 oz', 2.49]]],
    ['Frozen', [['Mixed vegetables, 2 bags', 4.58], ['Peas, 12 oz', 1.79], ['Sweet corn, 12 oz', 1.79], ['Mixed berries, 24 oz', 6.58]]],
];
$PHX_ALL_COUNT = 0; $PHX_GROCERY_TOTAL = 0;
foreach ($PHX_GROCERIES as $g) { foreach ($g[1] as $it) { $PHX_ALL_COUNT++; $PHX_GROCERY_TOTAL += $it[1]; } }
$PHX_CHECKED0 = ['Bell peppers, 3', 'Yellow onions, 3 lb bag'];
$PHX_OPEN0 = ['Produce'];
$PHX_SHELVES = [
    ['Staples', 'basket', ['Rice', 'Olive oil', 'Flour', 'Sugar', 'Chicken broth']],
    ['Spices', 'leaf', ['Garlic', 'Salt', 'Black pepper', 'Chili powder', 'Cumin', 'Oregano']],
    ['Fridge', 'snow', ['Ketchup', 'Mustard', 'Mayonnaise', 'Parmesan']],
];
$PHX_PANTRY_COUNT = 0;
foreach ($PHX_SHELVES as $s) { $PHX_PANTRY_COUNT += count($s[2]); }
$PHX_TABS = [['This Week', 'calendar', 'calendarOn'], ['Groceries', 'cart', 'cartOn'], ['Pantry', 'tray', 'trayOn'], ['Settings', 'cog', 'cogOn']];

const PHX_PREVIEW = 'This is a preview. The real app is coming soon.';

function phx_ask($msg = PHX_PREVIEW) { return ' data-ask="' . phx_e($msg) . '"'; }
function phx_pip($pose, $size, $class = '') {
    return '<img class="ph-pip ' . phx_e($class) . '" src="/mascot/' . phx_e($pose) . '.svg" alt="" width="' . $size . '" height="' . $size . '" draggable="false" />';
}
function phx_estimate() {
    return '<div class="ph-foot13">Prices, calories, nutrition and cook times are estimates, and Kelmi can make mistakes. Real amounts vary by store, brand and how you cook, so none of it is exact.</div>';
}

// ---- This Week

function phx_tile($id, $type, $icon) {
    global $PHX_M;
    [$name, $min, $cost] = $PHX_M[$id];
    return '<div class="ph-tile"><div class="ph-tile-body">'
        . '<div class="ph-label">' . phx_ion($icon, 14, 'var(--primary)') . '<span class="ph-eyebrow" style="color:var(--primary)">' . phx_e($type) . '</span></div>'
        . '<div class="ph-tile-name">' . phx_e($name) . '</div>'
        . '<div class="ph-foot13 ph-num">' . phx_e($min) . '</div></div>'
        . '<div class="ph-tile-foot"><span class="ph-money" style="font-size:18px">$' . $cost . '</span>'
        . '<button type="button" class="ph-mini" aria-label="' . phx_e('Keep ' . $name . ' when planning again') . '"' . phx_ask() . '>' . phx_ion('bookmark', 18, 'var(--primary)') . '</button>'
        . '<button type="button" class="ph-mini" aria-label="' . phx_e('Swap ' . $name) . '"' . phx_ask() . '>' . phx_ion('lock', 18, 'var(--primary)') . '</button>'
        . '</div></div>';
}

function phx_daycard($d) {
    global $PHX_M, $PHX_PLAN, $PHX_DAYS;
    [$b, $l, $dn] = $PHX_PLAN[$d];
    $total = $PHX_M[$b][2] + $PHX_M[$l][2] + $PHX_M[$dn][2];
    $isToday = $d === PHX_TODAY;
    [$dname, $dmin, $dcost] = $PHX_M[$dn];
    return '<div class="ph-card ph-daycard">'
        . '<div class="ph-dayhead"' . ($isToday ? ' style="background:var(--tint)"' : '') . '>'
        . '<div class="ph-daytitle"><span class="ph-dayname">' . phx_e($PHX_DAYS[$d][1]) . '</span>' . ($isToday ? '<span class="ph-today">TODAY</span>' : '') . '</div>'
        . '<div class="ph-daycost"><span class="ph-money">$' . $total . '</span><span class="ph-foot13">est.</span></div></div>'
        . '<div class="ph-pair">' . phx_tile($b, 'Breakfast', 'sunny') . phx_tile($l, 'Lunch', 'partly-sunny') . '</div>'
        . '<div class="ph-dinner"><div class="ph-dinner-text">'
        . '<div class="ph-label">' . phx_ion('moon', 14, 'var(--primary)') . '<span class="ph-eyebrow" style="color:var(--primary)">Dinner</span></div>'
        . '<div class="ph-dinner-name">' . phx_e($dname) . '</div>'
        . '<div class="ph-meta"><span class="ph-sub ph-num">' . phx_e($dmin) . '</span><span class="ph-sub">·</span><span class="ph-sub" style="color:var(--primary);font-weight:600">Recipe</span>' . phx_ion('forward', 13, 'var(--primary)') . '</div></div>'
        . '<div class="ph-dinner-side"><span class="ph-money" style="font-size:24px">$' . $dcost . '</span>'
        . '<button type="button" class="ph-mini" aria-label="' . phx_e('Keep ' . $dname . ' when planning again') . '"' . phx_ask() . '>' . phx_ion('bookmark', 18, 'var(--primary)') . '</button>'
        . '<button type="button" class="ph-iconbtn" aria-label="' . phx_e('Swap ' . $dname) . '"' . phx_ask() . '>' . phx_ion('lock', 20, 'var(--primary)') . '</button>'
        . '</div></div></div>';
}

function phx_week() {
    global $PHX_DAYS, $PHX_PLAN_TOTAL;
    $total = $PHX_PLAN_TOTAL;
    $left = PHX_BUDGET - $total;
    $pct = min(100, ($total / PHX_BUDGET) * 100);
    $h = '<div class="ph-header"><div class="ph-titlerow">'
        . '<img class="ph-appicon" src="/app/icon.png" alt="" width="32" height="32" />'
        . '<div><h3 class="ph-largetitle">This Week</h3><div class="ph-sub">' . phx_e(phx_air('Oct 27 to Nov 2 · 4 people')) . '</div></div></div>'
        . '<div class="ph-card ph-budget"><div class="ph-budgethead"><span class="ph-eyebrow">Budget</span>'
        . '<span class="ph-num"><span class="ph-money" style="font-size:24px" data-ph-count="' . $total . '">$' . $total . '</span>' . phx_e(phx_air(' of $' . PHX_BUDGET . ' · est.')) . '</span></div>'
        . '<div class="ph-track" role="progressbar" aria-valuemin="0" aria-valuemax="' . PHX_BUDGET . '" aria-valuenow="' . $total . '" aria-label="' . phx_e('Estimated $' . $total . ' of $' . PHX_BUDGET . ' budget') . '"><i style="width:' . $pct . '%"></i></div>'
        . '<div class="ph-under"><div class="ph-flex"><div class="ph-sub" style="color:var(--primary);font-weight:500">$' . $left . ' left this week</div>'
        . '<div class="ph-foot13">About $' . (int)round($total / PHX_PEOPLE) . ' per person</div></div>'
        . phx_pip('cheer', 64, 'ph-cheer') . '</div></div></div>';
    $h .= '<div class="ph-scroll"><div><div class="ph-chips" role="tablist">';
    foreach ($PHX_DAYS as $i => [$s, $long]) {
        $on = $i === PHX_TODAY;
        $h .= '<button type="button" role="tab" aria-selected="' . ($on ? 'true' : 'false') . '" aria-label="' . phx_e($long) . '" class="ph-chip' . ($on ? ' on' : '') . '" data-day="' . $i . '">' . phx_e($s) . ($i === PHX_TODAY ? '<i></i>' : '') . '</button>';
    }
    $h .= '</div><div class="ph-deck" data-ph-deck><div>' . phx_daycard(PHX_TODAY) . '</div></div>'
        . '<div class="ph-foot13 ph-center">Swipe the card to see the next or the previous day</div></div>'
        . '<div class="ph-replan"><button type="button" class="ph-textbtn"' . phx_ask('Planning again replaces this week. It uses one of your 3 free plans a month.') . '>Plan this week again</button>'
        . '<div class="ph-foot13">3 free plans left this month</div></div>'
        . '<div class="ph-card ph-savings"><div class="ph-headline">Your savings</div><div class="ph-stat">'
        . '<div class="ph-foot13">Kept off your list this week</div><div class="ph-money" style="font-size:24px">' . phx_money(PHX_PANTRY_SAVINGS) . '</div>'
        . '<div class="ph-foot13">Already on your pantry shelf</div></div></div>'
        . phx_estimate() . '</div>';
    return $h;
}

// ---- Groceries

function phx_groceries() {
    global $PHX_GROCERIES, $PHX_ALL_COUNT, $PHX_GROCERY_TOTAL, $PHX_CHECKED0, $PHX_OPEN0;
    $done = 0;
    foreach ($PHX_GROCERIES as $g) { foreach ($g[1] as $it) { if (in_array($it[0], $PHX_CHECKED0, true)) $done++; } }
    $h = '<div class="ph-header"><div class="ph-headrow" style="gap:12px"><h3 class="ph-largetitle ph-flex">Grocery List</h3>'
        . '<button type="button" class="ph-iconbtn" aria-label="Add list to Reminders"' . phx_ask() . '>' . phx_ion('checkbox', 20, 'var(--primary)') . '</button>'
        . '<button type="button" class="ph-iconbtn" aria-label="Find grocery stores near you"' . phx_ask('In the app this opens Maps with a search for grocery stores.') . '>' . phx_ion('location', 20, 'var(--primary)') . '</button>'
        . '<button type="button" class="ph-iconbtn" aria-label="Share your grocery list"' . phx_ask() . '>' . phx_ion('share', 20, 'var(--primary)') . '</button></div>'
        . '<div class="ph-summary"><div class="ph-flex"><div class="ph-sub ph-num" style="color:var(--text)" data-ph-done data-total="' . $PHX_ALL_COUNT . '">' . $done . ' of ' . $PHX_ALL_COUNT . ' items in your cart</div>'
        . '<div class="ph-foot13">' . phx_e(phx_air('Estimated total · US average prices')) . '</div><div class="ph-foot13">Quantities for 4 people</div>'
        . '<div class="ph-track" style="margin-top:8px"><i data-ph-bar style="width:' . (($done / $PHX_ALL_COUNT) * 100) . '%"></i></div></div>'
        . '<span class="ph-money" style="font-size:24px">' . phx_money($PHX_GROCERY_TOTAL) . '</span></div>'
        . '<div style="margin-top:-4px"><button type="button" class="ph-textbtn"' . phx_ask('In the app you pick which meals to buy for.') . '>Change which meals to buy for</button></div></div>';
    $h .= '<div class="ph-scroll"><div><div class="ph-pantryrow">' . phx_pip('save', 64, 'ph-savepip')
        . '<div class="ph-sub ph-flex" style="padding:0 6px 4px">On your pantry shelf: rice, olive oil, flour, and more. That saves about <b style="color:var(--text);font-weight:700">' . phx_money(PHX_PANTRY_SAVINGS) . '</b> this week.</div></div>'
        . '<img class="ph-shelfimg" src="/app/shelf.png" alt="" /></div>';
    foreach ($PHX_GROCERIES as [$aisle, $items]) {
        $isOpen = in_array($aisle, $PHX_OPEN0, true);
        $sum = 0; foreach ($items as $it) $sum += $it[1];
        $h .= '<div class="ph-card ph-aisle"><button type="button" class="ph-aislehead" aria-expanded="' . ($isOpen ? 'true' : 'false') . '" data-aisle>'
            . '<span class="ph-headline ph-flex" style="text-align:left">' . phx_e($aisle) . '</span>'
            . '<span class="ph-sub ph-num">' . phx_e(phx_air(count($items) . ' · ' . phx_money($sum))) . '</span>'
            . '<span class="ph-chev" style="transform:' . ($isOpen ? 'rotate(180deg)' : 'none') . '">' . phx_ion('down', 18, 'var(--muted)') . '</span></button>';
        foreach ($items as [$name, $price]) {
            $on = in_array($name, $PHX_CHECKED0, true);
            $h .= '<button type="button" role="checkbox" aria-checked="' . ($on ? 'true' : 'false') . '" class="ph-item" data-item' . ($isOpen ? '' : ' hidden style="display:none"') . '>'
                . '<span class="ph-check' . ($on ? ' on' : '') . '"><i>' . phx_ion('check', 15, 'var(--on-primary)') . '</i></span>'
                . '<span class="ph-flex ph-itemname"' . ($on ? ' style="text-decoration:line-through;color:var(--muted)"' : '') . '>' . phx_e($name) . '</span>'
                . '<span class="ph-sub ph-num">' . phx_money($price) . '</span></button>';
        }
        $h .= '</div>';
    }
    return $h . phx_estimate() . '</div>';
}

// ---- Pantry

function phx_pantry() {
    global $PHX_SHELVES, $PHX_PANTRY_COUNT;
    $h = '<div class="ph-header"><div class="ph-headrow" style="gap:4px"><div class="ph-flex"><h3 class="ph-largetitle">Pantry</h3><div class="ph-sub">What you already have</div></div>'
        . '<button type="button" class="ph-textbtn"' . phx_ask('In the app, press and hold an item to rearrange or remove it.') . '>Edit</button>'
        . '<button type="button" class="ph-iconbtn" aria-label="Add an item"' . phx_ask('In the app you pick a shelf, then tap what you already have.') . '>' . phx_ion('add', 20, 'var(--primary)') . '</button></div></div>';
    $h .= '<div class="ph-scroll"><div class="ph-pantrysum"><div class="ph-flex" style="gap:2px"><div class="ph-bignum">' . $PHX_PANTRY_COUNT . '</div>'
        . '<div class="ph-headline">items on hand</div><div class="ph-sub" style="color:var(--text)">Kept off your list, saving about ' . phx_money(PHX_PANTRY_SAVINGS) . ' this week.</div></div>'
        . phx_pip('yum', 104, 'ph-yum') . '</div>';
    foreach ($PHX_SHELVES as [$name, $icon, $items]) {
        $h .= '<div class="ph-shelfcard"><div class="ph-shelfhead"><span class="ph-badge">' . phx_ion($icon, 16, 'var(--primary)') . '</span>'
            . '<span class="ph-shelfname">' . phx_e($name) . '</span><span class="ph-count ph-num">' . count($items) . '</span></div><div class="ph-items">';
        foreach ($items as $i) $h .= '<span class="ph-pill">' . phx_e($i) . '</span>';
        $h .= '</div><img class="ph-shelfart" src="/app/shelf.png" alt="" /></div>';
    }
    return $h . '</div>';
}

// ---- Settings

function phx_switch($label) {
    return '<button type="button" role="switch" aria-checked="false" aria-label="' . phx_e($label) . '" class="ph-switch" data-switch><i></i></button>';
}
function phx_section($title, $footer, $body) {
    return '<div class="ph-section"><div class="ph-eyebrow ph-pad16">' . phx_e($title) . '</div><div class="ph-card ph-group">' . $body . '</div>'
        . ($footer !== null ? '<div class="ph-foot13 ph-pad16">' . phx_e($footer) . '</div>' : '') . '</div>';
}
function phx_row($label, $value = null, $chevron = false, $danger = false, $action = false) {
    $style = $action ? ' style="color:' . ($danger ? 'var(--danger)' : ($chevron ? 'var(--text)' : 'var(--primary)')) . '"' : '';
    return '<div class="ph-row"><span class="ph-rowlabel"' . $style . '>' . phx_e($label) . '</span>'
        . ($value !== null ? '<span class="ph-rowvalue">' . phx_e($value) . '</span>' : '<span class="ph-flex"></span>')
        . ($chevron ? phx_ion('forward', 16, 'var(--control)') : '') . '</div>';
}
function phx_settings() {
    $h = '<div class="ph-header"><h3 class="ph-largetitle">Settings</h3></div><div class="ph-scroll">'
        . '<button type="button" class="ph-plancard"' . phx_ask() . '>' . phx_pip('sleep', 64, 'ph-planpip')
        . '<div class="ph-flex" style="text-align:left"><div class="ph-headline">Free Plan</div><div class="ph-sub">0 of 3 plans used this month</div></div></button>';
    $h .= phx_section('Household', null,
        phx_row('People eating', '4', true) . phx_row('Weekly budget', '$220', true) . phx_row('Diet', 'Everything', true)
        . phx_row('Goal', 'Just eat well', true) . phx_row('Meat', 'Some', true) . phx_row('Allergies', 'Peanuts, Shellfish', true)
        . phx_row('Dislikes', 'Mushrooms', true) . phx_row('Foods you like', 'None yet', true) . phx_row('Kitchen', 'Stovetop, Oven +1', true));
    $h .= phx_section('Preferences', 'A preference, not a guarantee. Kelmi can’t check sugar or sodium, so put allergies in Allergies.',
        '<div class="ph-notes">Low sugar, low sodium, easy on the stomach</div><div class="ph-foot13 ph-notescount">0/300</div>');
    $h .= phx_section('Language', 'Recipes, ingredients, and your grocery list switch too.', phx_row('App language', 'Same as phone', true));
    $h .= phx_section('Shared list', 'People you invite see the grocery list and can check items off.', phx_row('Members', 'Only you') . phx_row('Invite Someone', null, false, false, true));
    $h .= phx_section('Notifications', null,
        '<div class="ph-row ph-switchrow"><div class="ph-flex"><div>Sunday plan reminder</div><div class="ph-foot13">Sundays at 5 PM</div></div>' . phx_switch('Sunday plan reminder') . '</div>'
        . '<div class="ph-row ph-switchrow"><div class="ph-flex"><div>Grocery list changes</div><div class="ph-foot13">When someone checks off or adds items</div></div>' . phx_switch('Grocery list changes') . '</div>');
    $h .= phx_section('Account', 'Deleting your account removes your household, plans, and lists. Subscriptions are managed in your App Store or Google Play settings.',
        phx_row('Account', 'Example data, not saved') . phx_row('Restore Purchases', null, false, false, true) . phx_row('Sign Out', null, false, false, true) . phx_row('Delete Account', null, false, true, true));
    $h .= phx_estimate();
    $h .= phx_section('About', null,
        phx_row('Terms of Service', null, true, false, true) . phx_row('Privacy Policy', null, true, false, true) . phx_row('Contact Us', null, true, false, true) . phx_row('Version', '1.0.0'));
    return $h . '</div>';
}

$phxScreens = [phx_week(), phx_groceries(), phx_pantry(), phx_settings()];

// Icon glyphs for the tab bar, handed to the script.
$phxJs = ['tabs' => [], 'note' => 3600];
foreach ($PHX_TABS as [$label, $off, $on]) {
    $phxJs['tabs'][] = ['off' => phx_chr($PHX_ION[$off]), 'on' => phx_chr($PHX_ION[$on])];
}
$phxDayCount = count($PHX_DAYS);
?>
<div class="phone" aria-label="A copy of the Kelmi app, with example data" data-ph-root>
  <div class="phone-body">
    <span class="phone-btn b1"></span><span class="phone-btn b2"></span><span class="phone-btn b3"></span><span class="phone-btn b4"></span>
    <div class="phone-screen">
      <div class="ph-status" aria-hidden="true">
        <span class="ph-time">9:41</span>
        <span class="ph-sys">
          <svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
          <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.3c2.3 0 4.4.9 6 2.4l1-1.1A10.4 10.4 0 0 0 8.5.8C5.8.8 3.3 1.8 1.5 3.6l1 1.1a8.6 8.6 0 0 1 6-2.4Zm0 3.7c1.3 0 2.500.5 3.4 1.300l1-1.100a6.600 6.600 0 0 0-8.800 0l1 1.100c.9-.8 2.100-1.300 3.400-1.300Zm0 3.600c.6 0 1.100.2 1.500.6L8.500 12 7 10.200c.4-.4.900-.6 1.500-.6Z" /></svg>
          <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="22" height="12" rx="3.800" fill="none" stroke="currentColor" opacity=".4" /><rect x="2" y="2" width="19" height="9" rx="2.500" /><path d="M24 4.500v4c.8-.3 1.500-1.100 1.500-2s-.7-1.700-1.500-2Z" opacity=".45" /></svg>
        </span>
      </div>
      <div class="phone-island" aria-hidden="true"></div>
      <div class="ph-tab"><?= $phxScreens[0] ?></div>
      <nav class="ph-tabbar" aria-label="Kelmi tabs">
<?php foreach ($PHX_TABS as $i => [$label, $off, $on]): ?>
        <button type="button" class="ph-tabitem<?= $i === 0 ? ' on' : '' ?>"<?= $i === 0 ? ' aria-current="page"' : '' ?> data-tab="<?= $i ?>">
          <?= phx_ion($i === 0 ? $on : $off, 24) ?>
          <span><?= phx_e($label) ?></span>
        </button>
<?php endforeach; ?>
      </nav>
      <div class="ph-home" aria-hidden="true"></div>
    </div>
  </div>
  <?php /* Fresh copies of each screen: every tab opens in its starting state, like the React remount. */ ?>
<?php foreach ($phxScreens as $i => $html): ?>
  <template data-ph-screen="<?= $i ?>"><?= $html ?></template>
<?php endforeach; ?>
<?php for ($d = 0; $d < $phxDayCount; $d++): ?>
  <template data-ph-day="<?= $d ?>"><?= phx_daycard($d) ?></template>
<?php endfor; ?>
  <script type="application/json" data-ph-config><?= json_encode($phxJs, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
</div>
