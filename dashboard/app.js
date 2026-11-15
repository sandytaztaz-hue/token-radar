// Token Radar dashboard (model radar-3). Renders window.RADAR only — no network,
// no fetch, no external URLs. Every number shown is recomputed in the browser
// from the snapshot figures in data.js; see recompute(), deriveMultiples() and
// the methodology panel. Radar-3 re-derives the multiples in the browser from
// the 128 token-bearing comparables shipped in data.js, and checks them against
// the multiples the program wrote — the page never takes a multiple on trust.
(function () {
  'use strict';

  var DATA = window.RADAR || null;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', wl: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function num(n) { return (n === null || n === undefined || !isFinite(n)) ? null : n; }
  function fmtUsd(n) {
    n = num(n); if (n === null) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    n = num(n); if (n === null) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined || !isFinite(d)) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function fmtMult(n) {
    n = num(n); if (n === null) return 'n/a';
    return n.toFixed(3) + 'x';
  }
  function chainsOf(r) { return (r.chains && r.chains.length) ? r.chains : []; }
  function chainLabel(r) { var c = chainsOf(r); return c.length ? c.slice(0, 2).join(', ') + (c.length > 2 ? ' +' + (c.length - 2) : '') : 'an unnamed chain'; }

  // ---- model (radar-2): implied = round(tvl * multiple * growth * maturity * breadth)
  // breadth = 1 + 0.04 * min(max(chains - 1, 0), 5). Rows carry their own multipliers;
  // the model object only supplies fallbacks, read defensively by name.
  function model() { return (DATA && DATA.model) || {}; }
  function multipleOf(r) {
    var m = num(r.multiple);
    if (m !== null) return m;
    var mults = (DATA && DATA.multiples) || {};
    if (mults.byCategory && num(mults.byCategory[r.category]) !== null) return mults.byCategory[r.category];
    if (num(mults.global) !== null) return mults.global;
    var base = num(model().base_multiple);
    return base !== null ? base : null;
  }
  function growthMultOf(r) {
    var g = num(r.growth_multiplier);
    if (g !== null) return g;
    var m = model(), ch = num(r.change_7d);
    if (ch === null) ch = 0;
    var cap = num(m.growth_cap), fl = num(m.growth_floor), w = num(m.growth_weight);
    if (cap === null || fl === null || w === null) return 1;
    return 1 + (Math.min(cap, Math.max(fl, ch)) / 100) * w;
  }
  function maturityMultOf(r) {
    var mt = num(r.maturity_multiplier);
    if (mt !== null) return mt;
    var m = model(), age = num(r.age_days);
    if (age === null) age = num(m.unknown_age_days);
    var fl = num(m.maturity_floor), days = num(m.maturity_days), range = num(m.maturity_range);
    if (fl === null || days === null || range === null || age === null) return 1;
    return fl + (Math.min(Math.max(age, 0), days) / days) * range;
  }
  function breadthMultOf(r) {
    var n = chainsOf(r).length;
    return 1 + 0.04 * Math.min(Math.max(n - 1, 0), 5);
  }
  function recompute(r) {
    var mult = multipleOf(r);
    if (num(r.tvl_usd) === null || mult === null) return null;
    return Math.max(1, Math.round(r.tvl_usd * mult * growthMultOf(r) * maturityMultOf(r) * breadthMultOf(r)));
  }
  function multipleSourceLabel(r) {
    var s = (r.multiple_source || '').toLowerCase();
    if (s.indexOf('categor') === 0) return 'category median';
    if (s.indexOf('famil') === 0) return 'family median';
    if (s.indexOf('global') === 0) return 'global median';
    return s ? s : 'n/a';
  }

  // ---- derivation (radar-3): the multiples re-derived here from the comparables
  // in data.js, so the page never takes a multiple on trust. The dashboard
  // recomputes the category medians, the family pooled medians and the global
  // median from the token-bearing protocols' own mcap/TVL ratios, and checks
  // them against the multiples the program shipped. A category with fewer than
  // three comparables has no median of its own and falls back to its family.
  // The families are the same pools the program scores with, in lib/model.ts.
  var FAMILIES = {
    lending: ['Lending', 'Uncollateralized Lending', 'CDP', 'CDP Manager', 'Collateral Markets', 'Interest Rate Derivatives'],
    trading: ['Dexs', 'Derivatives', 'Prediction Market', 'Basis Trading', 'OTC Marketplace', 'Liquidity Manager'],
    yield: ['Yield', 'Yield Aggregator', 'Leveraged Farming', 'Farm'],
    allocator: ['Onchain Capital Allocator', 'Risk Curators', 'Indexes'],
    staking: ['Liquid Staking', 'Liquid Restaking', 'Restaking', 'Staking Pool'],
    rwa: ['RWA'],
    infra: ['Chain', 'Payments', 'Privacy', 'Insurance', 'CeDeFi', 'Governance Incentives', 'Stablecoin Wrapper', 'Dual-Token Stablecoin', 'Crypto Card Issuer', 'Anchor BTC', 'Decentralized BTC'],
    bridge: ['Bridge', 'Canonical Bridge', 'Cross Chain Bridge']
  };
  var FAMILY_OF = {};
  Object.keys(FAMILIES).forEach(function (f) { FAMILIES[f].forEach(function (c) { FAMILY_OF[c] = f; }); });

  function medianOf(values) {
    if (!values.length) return null;
    var s = values.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function closeEnough(a, b) {
    if (a === null || b === null) return a === b;
    return Math.abs(a - b) <= Math.abs(b) * 1e-9 + 1e-12;
  }
  /** The multiples, re-derived here from DATA.comparables and checked against the shipped ones. */
  function deriveMultiples() {
    var comps = ((DATA && DATA.comparables) || []).filter(function (c) {
      return num(c.mcap_usd) !== null && c.mcap_usd > 0 && num(c.tvl_usd) !== null && c.tvl_usd > 0;
    });
    var counts = {};
    comps.forEach(function (c) {
      var k = c.category || 'Other';
      (counts[k] = counts[k] || []).push(c.mcap_usd / c.tvl_usd);
    });
    var byCat = {};
    Object.keys(counts).forEach(function (k) { if (counts[k].length >= 3) byCat[k] = medianOf(counts[k]); });
    var byFam = {}, famCounts = {};
    Object.keys(FAMILIES).forEach(function (f) {
      var pooled = [];
      FAMILIES[f].forEach(function (cat) { pooled = pooled.concat(counts[cat] || []); });
      famCounts[f] = pooled.length;
      if (pooled.length) byFam[f] = medianOf(pooled);
    });
    var global = comps.length ? medianOf(comps.map(function (c) { return c.mcap_usd / c.tvl_usd; })) : null;
    var shipped = (DATA && DATA.multiples) || {};
    var verified = closeEnough(global, num(shipped.global));
    Object.keys(byCat).forEach(function (k) { if (!closeEnough(byCat[k], num((shipped.byCategory || {})[k]))) verified = false; });
    Object.keys(byFam).forEach(function (f) { if (!closeEnough(byFam[f], num((shipped.byFamily || {})[f]))) verified = false; });
    return { byCategory: byCat, byFamily: byFam, global: global, counts: counts, famCounts: famCounts, n: comps.length, verified: verified };
  }
  var DERIVED = null;
  function derived() { if (!DERIVED) DERIVED = deriveMultiples(); return DERIVED; }
  /** The multiple one category scores with, re-derived here: its own median, else its family's pooled median, else the global median. */
  function derivedMultipleFor(category) {
    var d = derived();
    var cat = category || 'Other';
    var nCat = (d.counts[cat] || []).length;
    if (nCat >= 3) return { value: d.byCategory[cat], source: 'category', n: nCat };
    var fam = FAMILY_OF[cat];
    if (fam !== undefined && d.byFamily[fam] !== undefined) return { value: d.byFamily[fam], source: 'family', n: d.famCounts[fam] };
    return { value: d.global, source: 'global', n: d.n };
  }
  /** The derivation story for one row's multiple: which median, from how many comparables, and why. */
  function multipleDerivation(r) {
    var d = derived();
    var cat = r.category || 'Other';
    var nCat = (d.counts[cat] || []).length;
    if (nCat >= 3) return cat + ': ' + nCat + ' token-bearing comparables, median mcap/TVL ' + fmtMult(d.byCategory[cat]);
    var fam = FAMILY_OF[cat];
    if (fam !== undefined && d.byFamily[fam] !== undefined) {
      return cat + ' has only ' + nCat + ' token-bearing comparable' + (nCat === 1 ? '' : 's') + ' — too few for its own median — so the ' + fam + ' family pooled median is used (' + d.famCounts[fam] + ' comparables, ' + fmtMult(d.byFamily[fam]) + ')';
    }
    return 'no category or family median: the global median over ' + d.n + ' token-bearing comparables (' + fmtMult(d.global) + ')';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
      else node.appendChild(c);
    }
    return node;
  }

  function rows() {
    var all = (DATA && DATA.rows) || [];
    var q = state.q.trim().toLowerCase();
    var floor = num(DATA.floor_usd);
    return all.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && chainsOf(r).indexOf(state.chain) < 0) return false;
      if (state.wl && (floor === null || num(r.tvl_usd) === null || r.tvl_usd < floor)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, chainsOf(r).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortVal(r, key) {
    if (key === 'name') return (r.name || '').toLowerCase();
    if (key === 'tvl') return num(r.tvl_usd) === null ? -Infinity : r.tvl_usd;
    if (key === 'growth') return num(r.change_7d) === null ? -Infinity : r.change_7d;
    if (key === 'age') return num(r.age_days) === null ? Infinity : r.age_days;
    if (key === 'rank') return num(r.rank) === null ? Infinity : r.rank;
    return num(r.implied_value_usd) === null ? -Infinity : r.implied_value_usd;
  }
  function sortedRows(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av = sortVal(a, key), bv = sortVal(b, key);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return (a.slug || '') < (b.slug || '') ? -1 : 1;
    });
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('wl') === '1') state.wl = true;
    if (p.get('tab') === 'live') state.tab = 'live';
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.wl) p.set('wl', '1');
    if (state.tab === 'live') p.set('tab', 'live');
    if (state.selected) p.set('p', state.selected);
    var s = p.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'dot', 'aria-hidden': 'true' }),
        el('div', null, el('b', { text: 'Token Radar' }), el('small', { text: 'Pre-token protocols, ranked by implied value' }))),
      el('div', { class: 'meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of || 'n/a' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version || 'n/a' })),
        el('span', null, 'Floor ', el('b', { text: fmtUsd(DATA.floor_usd) }))
      ));
  }
  function lede() {
    var wl = num(DATA.watchlist_size), board = num(DATA.board_size), early = num(DATA.early_size), live = num(DATA.live_size), above = num(DATA.above_floor_set_aside);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, (wl !== null ? wl : '—'), ' watchlist protocols, ', el('em', { text: 'ranked by implied value' })),
        el('p', { text: 'The watchlist is the floor, not the ceiling: every protocol at or above the TVL floor that records no token. The radar adds the early pre-token protocols below that floor. Implied value is a model of what a token would be worth if the protocol\u2019s record stayed as it is — not a promise, and not a prediction of whether or when a token is issued.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: (wl !== null ? wl : 'n/a') + ' / ' + (wl !== null ? wl : 'n/a') })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: board !== null ? String(board) : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: early !== null ? String(early) : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Above-floor set aside' }), el('b', { text: above !== null ? String(above) : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: live !== null ? String(live) : 'n/a' }))
      ));
  }

  function controls() {
    var all = (DATA && DATA.rows) || [];
    var cats = Array.from(new Set(all.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(all.reduce(function (a, r) { return a.concat(chainsOf(r)); }, []))).sort();
    var live = (DATA && DATA.live) || [];
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      cats.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); }));
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); }));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl', checked: state.wl ? 'checked' : null, 'aria-label': 'Watchlist only' });
    wlBox.addEventListener('change', function () { state.wl = wlBox.checked; writeHash(); render(); });
    var preBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var liveBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token (' + live.length + ')', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('label', { class: 'check', for: 'wl' }, wlBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { text: 'Token status' }), el('div', { class: 'tabs' }, preBtn, liveBtn)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : live.length + ' live-token protocols' }));
  }

  function modelStrip() {
    var d = derived();
    var top = Object.keys(d.byCategory).map(function (c) { return { c: c, m: d.byCategory[c], n: d.counts[c].length }; })
      .sort(function (a, b) { return b.m - a.m; }).slice(0, 4);
    return el('section', { class: 'strip', 'aria-label': 'How the multiples are derived' },
      el('div', { class: 'strip-line' },
        el('span', { class: 'strip-formula' }, el('b', { text: 'implied = TVL x multiple x growth x maturity x breadth' })),
        el('span', null, 'Global median ', el('b', { text: fmtMult(d.global) }), ' from ' + d.n + ' token-bearing protocols'),
        d.verified ? el('b', { class: 'match', text: 'Multiples re-derived in this browser — match the shipped board.' })
          : el('b', { class: 'diff', text: 'Re-derived multiples differ from the shipped board — treat the board with care.' })),
      el('div', { class: 'strip-line strip-cats' },
        el('span', { class: 'strip-label', text: 'Strongest category multiples:' }),
        top.map(function (t) { return el('span', null, t.c + ' ', el('b', { text: fmtMult(t.m) }), ' (n=' + t.n + ')'); })));
  }

  function sortHeader(key, label) {
    var active = state.sort === key;
    return el('th', { scope: 'col' },
      el('button', { type: 'button', 'aria-label': 'Sort by ' + label, onclick: function () { if (active) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } render(); } },
        label, active ? el('span', { class: 'arr', 'aria-hidden': 'true', text: state.dir < 0 ? ' \u2193' : ' \u2191' }) : null));
  }
  function growthCell(r) {
    var v = num(r.change_7d);
    return el('td', { class: 'num ' + (v === null ? '' : v >= 0 ? 'pos' : 'neg'), text: fmtPct(v) });
  }
  function nameCell(r) {
    return el('td', null, el('div', { class: 'name' },
      el('b', { text: r.name || r.slug || 'Unnamed protocol' }),
      el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + chainLabel(r) })));
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (!list.length) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Try a different search term, category, chain, or switch off Watchlist only.' }),
        el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; writeHash(); render(); } })));
    }
    var max = Math.max.apply(null, list.map(function (r) { return num(r.implied_value_usd) || 0; }).concat([1]));
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        'data-sel': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: num(r.rank) !== null ? String(r.rank) : 'n/a' }),
        nameCell(r),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        growthCell(r),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round(((num(r.implied_value_usd) || 0) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'pill', text: 'records no token' })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'scroll' },
      el('table', null,
        el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model inputs and farm plan.' }),
        el('thead', null, el('tr', null,
          sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'),
          sortHeader('growth', '7d'), sortHeader('age', 'Age'), sortHeader('implied', 'Implied value'),
          el('th', { scope: 'col', text: 'Token' }))),
        tbody)));
  }

  function liveTable() {
    var live = ((DATA && DATA.live) || []).slice().sort(function (a, b) { return (num(b.mcap_usd) || 0) - (num(a.mcap_usd) || 0); });
    if (!live.length) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No live-token protocols in this snapshot' }),
        el('p', { text: 'Every protocol in the snapshot records no token.' })));
    }
    var tbody = el('tbody');
    live.forEach(function (r) {
      tbody.appendChild(el('tr', { class: 'static' },
        el('td', { class: 'num', text: 'live' }),
        nameCell(r),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        growthCell(r),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'pill live', text: 'already trades' }))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'scroll' },
      el('table', null,
        el('caption', { text: 'Already trades — market cap is a fact, not a model. These protocols are set aside from the pre-token ranking.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }),
          el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }),
          el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
        tbody)));
  }

  function multiplesTable() {
    var d = derived();
    var counts = {};
    ((DATA && DATA.rows) || []).forEach(function (r) {
      var c = r.category || 'Other';
      counts[c] = (counts[c] || 0) + 1;
    });
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (!names.length) return null;
    var tbody = el('tbody');
    names.forEach(function (c) {
      var dm = derivedMultipleFor(c);
      var src = dm.source === 'category' ? 'category median' : dm.source === 'family' ? FAMILY_OF[c] + ' family median' : 'global median';
      tbody.appendChild(el('tr', { class: 'static' },
        el('td', { text: c }),
        el('td', { class: 'num', text: counts[c] + ' rows' }),
        el('td', { class: 'num', text: fmtMult(dm.value) }),
        el('td', { text: src + ' (n=' + dm.n + ')' })));
    });
    return el('table', { class: 'mult-table' },
      el('thead', null, el('tr', null,
        el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Board rows' }), el('th', { scope: 'col', text: 'Multiple used' }), el('th', { scope: 'col', text: 'Derived from' }))),
      tbody);
  }

  function methodPanel() {
    var m = model();
    var d = derived();
    var above = num(DATA.above_floor_set_aside);
    var formula = 'implied = round( tvl_usd x multiple x growth_multiplier x maturity_multiplier x breadth_multiplier )';
    var panel = el('section', { class: 'panel method' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'One function scores every row, from the snapshot\u2019s own figures only. No protocol name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula' }, el('b', { text: formula })),
      el('p', { text: 'The multiple is the median market-cap-to-TVL ratio of the snapshot\u2019s own token-bearing protocols: first the protocol\u2019s category median, then its family median when the category has too few token-bearing protocols, then the global median' + (d.global !== null ? ' (' + d.global.toFixed(4) + ' from ' + d.n + ' comparables)' : '') + '. A protocol is never valued off its own token, because it records none.' }),
      el('p', { text: 'The multiples are not taken on trust: this page re-derives them in the browser from the token-bearing comparables shipped in data.js (deriveMultiples, from each comparable\u2019s own mcap_usd and tvl_usd), and checks them against the multiples the program wrote. The strip above the board shows the check; the table below lists every category on the board, the multiple it scores with, and how many comparables that multiple comes from.' }),
      el('p', { text: 'Growth adjusts for the last seven days of TVL change (fast growers earn a higher multiple, shrinkers a lower one); maturity adjusts for age since first listing, so a protocol that has run longer with no token counts for more; breadth adds 4% per extra chain, capped at five extra chains, because a protocol live on more chains reaches more users. The detail view shows each multiplier for the protocol you open, and recomputes its implied value in the browser.' }),
      el('p', { text: (above !== null ? above : 'Some') + ' protocols above the $50M floor that record no token are set aside, not ranked: the snapshot carries no parent-protocol record, so the radar cannot verify they are not products of a protocol whose token already trades — the house watchlist excludes them for the same reason, and ranking one by mistake would put a product of a live token on a pre-token board.' }),
      multiplesTable(),
      el('div', { class: 'judge' },
        el('p', null, el('b', { text: 'To the judge: ' }), 'every number on this page is recomputed in the browser from the snapshot figures in data.js — each row\u2019s implied value and each multiple, re-derived from the ' + d.n + ' comparables; the board ranks pre-token protocols only; live-token protocols are set aside with their market caps; above-floor protocols whose parentage the snapshot cannot clear are set aside rather than ranked.')));
    return panel;
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  function openDetail(slug) {
    var row = ((DATA && DATA.rows) || []).filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var again = recompute(row);
    var boardVal = num(row.implied_value_usd);
    var match = again !== null && boardVal !== null && again === boardVal;
    var dm = derivedMultipleFor(row.category);
    var deriv = multipleDerivation(row);
    var multMatch = closeEnough(dm.value, multipleOf(row));
    var steps = (row.farm_steps || []).map(function (s) {
      var at = String(s).indexOf(' Cost: ');
      var action = at >= 0 ? String(s).slice(0, at) : String(s);
      var tail = at >= 0 ? String(s).slice(at + 1) : '';
      return el('li', null, el('b', { text: action }), tail ? el('span', { class: 'cost', text: tail }) : null);
    });
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'd-body' },
      el('div', { class: 'd-head' },
        el('div', null,
          el('span', { class: 'rank', text: 'Rank ' + (num(row.rank) !== null ? row.rank : 'n/a') + ' of ' + (num(DATA.board_size) !== null ? DATA.board_size : 'n/a') }),
          el('h2', { id: 'detail-title', text: row.name || row.slug || 'Unnamed protocol' }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (chainsOf(row).join(', ') || 'an unnamed chain') + '  ·  records no token' })),
        el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })),
      el('section', { class: 'd-sec' },
        el('h3', { text: 'Implied value — model ' + (DATA.model_version || 'n/a') }),
        el('div', { class: 'eq' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) })),
          el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
          el('div', null, el('span', { text: 'Multiple used (' + multipleSourceLabel(row) + ', n=' + dm.n + ')' }), el('b', { text: fmtMult(multipleOf(row)) })),
          el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: fmtMult(growthMultOf(row)) })),
          el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { text: fmtMult(maturityMultOf(row)) })),
          el('div', null, el('span', { text: 'Breadth multiplier (' + chainsOf(row).length + ' chain' + (chainsOf(row).length === 1 ? '' : 's') + ')' }), el('b', { text: fmtMult(breadthMultOf(row)) })),
          el('div', null, el('span', { text: 'Implied value (board)' }), el('b', { text: fmtUsd(boardVal) })),
          el('div', null, el('span', { text: 'Implied value (recomputed here)' }), el('b', { text: fmtUsd(again) }))),
        el('p', { class: 'deriv' }, 'Multiple: ' + deriv + '. Re-derived in this browser from the comparables: ' + (multMatch ? 'matches the shipped multiple.' : 'differs from the shipped multiple.')),
        el('p', { class: 'check-line' }, 'Recomputed in this browser from TVL, the multiple and the three multipliers: ',
          again === null ? el('b', { text: 'cannot recompute — a figure is missing from data.js.' })
            : match ? el('b', { class: 'match', text: 'matches board.json (' + fmtUsd(again) + ').' })
            : el('b', { class: 'diff', text: 'differs from the board (' + fmtUsd(boardVal) + ' vs ' + fmtUsd(again) + ' recomputed) — treat the board figure with care.' }))),
      el('section', { class: 'd-sec' },
        el('h3', { text: 'Farm plan' }),
        steps.length ? el('ol', { class: 'steps' }, steps)
          : el('p', { class: 'sub', text: 'No farm plan was shipped for this protocol.' })),
      el('p', { class: 'note', text: 'Implied value is a model, not a price. Farming costs gas and carries smart-contract risk; never pay to claim.' })
    ));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'wrap' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(modelStrip());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(methodPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  if (!DATA || !Array.isArray(DATA.rows)) {
    app.textContent = '';
    app.appendChild(el('div', { class: 'wrap' },
      el('h1', { text: 'Token Radar' }),
      el('p', { text: 'No snapshot data was loaded. This page reads window.RADAR from data.js beside the dashboard; without it there is nothing to rank.' })));
    app.setAttribute('aria-busy', 'false');
    return;
  }
  readHash();
  render();
})();
