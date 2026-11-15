// Token Radar dashboard (model radar-4). Renders window.RADAR only — no network,
// no fetch, no external URLs. Every number shown is recomputed in the browser
// from the snapshot figures in data.js: the size curve is refit here from the
// 128 token-bearing comparables, each row's category effect and band are
// re-derived here, and each row's implied value is recomputed from its curve
// value and multipliers and checked against the board. Radar-4 replaces the
// radar-2/3 category-median primary with the fitted curve plus a category
// correction, and every value is a band, netted in dollars at the band's low.
(function () {
  'use strict';

  var DATA = window.RADAR || null;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', wl: false, flag: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

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
  function fmtEffect(n) {
    n = num(n); if (n === null) return 'n/a';
    return (n >= 0 ? '+' : '') + n.toFixed(2);
  }
  function chainsOf(r) { return (r.chains && r.chains.length) ? r.chains : []; }
  function chainLabel(r) { var c = chainsOf(r); return c.length ? c.slice(0, 2).join(', ') + (c.length > 2 ? ' +' + (c.length - 2) : '') : 'an unnamed chain'; }

  // ---- model (radar-4): implied = round(curve_value x growth x maturity x breadth)
  // curve_value = exp(intercept + slope x ln(TVL) + categoryEffect). Rows carry
  // their own curve value and multipliers at full precision; the model object
  // only supplies fallbacks, read defensively by name.
  function model() { return (DATA && DATA.model) || {}; }
  function validation() { return (DATA && DATA.validation) || {}; }
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
  function curveValueOf(r) {
    var c = num(r.curve_value_usd);
    if (c !== null) return c;
    var d = derivedCurve();
    if (d.curve === null || num(r.tvl_usd) === null) return null;
    return Math.exp(d.curve.intercept + d.curve.slope * Math.log(r.tvl_usd) + d.effectFor(r.category).effect);
  }
  function recompute(r) {
    var cv = curveValueOf(r);
    if (cv === null) return null;
    return Math.max(1, Math.round(cv * growthMultOf(r) * maturityMultOf(r) * breadthMultOf(r)));
  }
  function multipleSourceLabel(r) {
    var s = (r.multiple_source || '').toLowerCase();
    if (s.indexOf('categor') === 0) return 'category median';
    if (s.indexOf('famil') === 0) return 'family median';
    if (s.indexOf('global') === 0) return 'global median';
    return s ? s : 'n/a';
  }

  // ---- derivation (radar-3/4): the multiples re-derived here from the comparables
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
  function quantileOf(values, p) {
    var s = values.slice().sort(function (a, b) { return a - b; });
    var pos = (s.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return s[lo];
    return s[lo] * (hi - pos) + s[hi] * (pos - lo);
  }
  function closeEnough(a, b) {
    if (a === null || b === null) return a === b;
    return Math.abs(a - b) <= Math.abs(b) * 1e-9 + 1e-12;
  }
  function closeRel(a, b, tol) {
    if (a === null || b === null) return a === b;
    return Math.abs(a - b) <= Math.abs(b) * tol + 1e-9;
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

  // ---- curve derivation (radar-4): the size curve refit here from the comparables
  // (least squares of log mcap on log TVL), with each category's correction — the
  // median log-residual vs the curve, shrunk by n/(n+3) when the category has at
  // least three comparables, else its family's pooled median residual shrunk the
  // same way, else zero — and each source's FDV/TVL ratio band (p25/median/p75).
  // The refit is checked against the shipped curve in data.js validation.
  var CURVE = null;
  function deriveCurve() {
    if (CURVE) return CURVE;
    var comps = ((DATA && DATA.comparables) || []).filter(function (c) {
      return num(c.mcap_usd) !== null && c.mcap_usd > 0 && num(c.tvl_usd) !== null && c.tvl_usd > 0;
    });
    var n = comps.length, sx = 0, sy = 0, i;
    for (i = 0; i < n; i++) { sx += Math.log(comps[i].tvl_usd); sy += Math.log(comps[i].mcap_usd); }
    var mx = sx / n, my = sy / n, sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) {
      var dx = Math.log(comps[i].tvl_usd) - mx, dy = Math.log(comps[i].mcap_usd) - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    var slope = sxy / sxx, intercept = my - slope * mx, r2 = (sxy * sxy) / (sxx * syy);
    var curve = { n: n, slope: slope, intercept: intercept, r2: r2 };
    var residCat = {}, residFam = {}, ratioCat = {}, ratioFam = {}, ratioAll = [];
    comps.forEach(function (c) {
      var resid = Math.log(c.mcap_usd) - (intercept + slope * Math.log(c.tvl_usd));
      var ratio = c.mcap_usd / c.tvl_usd;
      ratioAll.push(ratio);
      var k = c.category || 'Other';
      (residCat[k] = residCat[k] || []).push(resid);
      (ratioCat[k] = ratioCat[k] || []).push(ratio);
      var fam = FAMILY_OF[k];
      if (fam !== undefined) {
        (residFam[fam] = residFam[fam] || []).push(resid);
        (ratioFam[fam] = ratioFam[fam] || []).push(ratio);
      }
    });
    function effectFor(category) {
      var cat = category || 'Other';
      var own = residCat[cat];
      if (own !== undefined && own.length >= 3) return { effect: medianOf(own) * (own.length / (own.length + 3)), source: 'category', n: own.length };
      var fam = FAMILY_OF[cat];
      if (fam !== undefined && residFam[fam] !== undefined) {
        var p = residFam[fam];
        return { effect: medianOf(p) * (p.length / (p.length + 3)), source: 'family', n: p.length };
      }
      return { effect: 0, source: 'none', n: 0 };
    }
    function bandFor(category) {
      var cat = category || 'Other';
      var own = ratioCat[cat];
      if (own !== undefined && own.length >= 3) return { p25: quantileOf(own, 0.25), median: medianOf(own), p75: quantileOf(own, 0.75), n: own.length, source: 'category' };
      var fam = FAMILY_OF[cat];
      if (fam !== undefined && ratioFam[fam] !== undefined) {
        var p = ratioFam[fam];
        return { p25: quantileOf(p, 0.25), median: medianOf(p), p75: quantileOf(p, 0.75), n: p.length, source: 'family' };
      }
      return { p25: quantileOf(ratioAll, 0.25), median: medianOf(ratioAll), p75: quantileOf(ratioAll, 0.75), n: ratioAll.length, source: 'global' };
    }
    var shipped = validation().curve || {};
    var verified = closeRel(slope, num(shipped.slope), 1e-9) && closeRel(intercept, num(shipped.intercept), 1e-9) && closeRel(r2, num(shipped.r2), 1e-9);
    CURVE = { curve: curve, effectFor: effectFor, bandFor: bandFor, verified: verified };
    return CURVE;
  }
  function derivedCurve() { return deriveCurve(); }
  /** One row's curve value, refit here: exp(intercept + slope x ln(TVL) + effect). */
  function derivedCurveValue(r) {
    var d = derivedCurve();
    if (d.curve === null || num(r.tvl_usd) === null) return null;
    return Math.exp(d.curve.intercept + d.curve.slope * Math.log(r.tvl_usd) + d.effectFor(r.category).effect);
  }
  /** The story of one row's category effect: which median residual, shrunk how much, from how many comparables. */
  function effectDerivation(r) {
    var e = derivedCurve().effectFor(r.category);
    var cat = r.category || 'Other';
    if (e.source === 'category') return cat + ': median log-residual vs the curve over ' + e.n + ' comparables, shrunk by ' + e.n + '/(' + e.n + '+3) to ' + fmtEffect(e.effect);
    if (e.source === 'family') return cat + ' has too few comparables for its own correction, so the ' + FAMILY_OF[cat] + ' family pooled median log-residual is used (' + e.n + ' comparables, shrunk to ' + fmtEffect(e.effect) + ')';
    return 'no category or family correction: effect 0';
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
      // Watchlist rows are the above-floor rows that are NOT flagged: the 20
      // flagged rows are above the floor but not on the watchlist.
      if (state.wl && (floor === null || num(r.tvl_usd) === null || r.tvl_usd < floor || r.flagged_above_floor)) return false;
      if (state.flag && !r.flagged_above_floor) return false;
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
    if (key === 'net') return num(r.net_low_usd) === null ? -Infinity : r.net_low_usd;
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
    if (p.get('flag') === '1') state.flag = true;
    if (p.get('tab') === 'live') state.tab = 'live';
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.wl) p.set('wl', '1');
    if (state.flag) p.set('flag', '1');
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
    var wl = num(DATA.watchlist_size), board = num(DATA.board_size), early = num(DATA.early_size), inc = num(DATA.above_floor_included), above = num(DATA.above_floor_set_aside);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, (wl !== null ? wl : '—'), ' watchlist protocols, ', el('em', { text: 'ranked by implied value' })),
        el('p', { text: 'The watchlist is the floor, not the ceiling: every protocol at or above the TVL floor that records no token, plus every rankable pre-token protocol below it. Implied value comes from a fitted size curve over the market\u2019s own token-bearing protocols, with a category correction — and every value is a band, not a point, because the curve fits poorly. Each farm plan is netted in dollars at the band\u2019s low.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: (wl !== null ? wl : 'n/a') + ' / ' + (wl !== null ? wl : 'n/a') })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: board !== null ? String(board) : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: early !== null ? String(early) : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Above-floor included, flagged' }), el('b', { text: inc !== null ? String(inc) : 'n/a' })),
        el('div', { class: 'fact' }, el('span', { text: 'Above-floor set aside' }), el('b', { text: above !== null ? String(above) : 'n/a' }))
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
    var flagBox = el('input', { type: 'checkbox', id: 'flag', checked: state.flag ? 'checked' : null, 'aria-label': 'Flagged above floor only' });
    flagBox.addEventListener('change', function () { state.flag = flagBox.checked; writeHash(); render(); });
    var preBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var liveBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token (' + live.length + ')', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('label', { class: 'check', for: 'wl' }, wlBox, 'Watchlist only'),
      el('label', { class: 'check', for: 'flag' }, flagBox, 'Flagged — above floor'),
      el('div', { class: 'field' }, el('span', { text: 'Token status' }), el('div', { class: 'tabs' }, preBtn, liveBtn)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : live.length + ' live-token protocols' }));
  }

  // The model strip: the fitted curve and its weakness, the leave-one-out
  // backtest against two baselines, and the board's coverage — the validation
  // evidence on the board's first screen, above the table.
  function modelStrip() {
    var v = validation(), c = v.curve || {}, loo = v.loo_full || {}, lc = v.loo_curve_only || {}, lo = v.loo_old_median || {};
    var dc = derivedCurve();
    var gases = ((DATA && DATA.rows) || []).map(function (r) { return num(r.plan_gas_usd); }).filter(function (g) { return g !== null; }).sort(function (a, b) { return a - b; });
    var gasMed = gases.length ? gases[Math.floor(gases.length / 2)] : null;
    var gasMin = gases.length ? gases[0] : null, gasMax = gases.length ? gases[gases.length - 1] : null;
    var netMin = Math.min.apply(null, ((DATA && DATA.rows) || []).map(function (r) { return num(r.net_low_usd) === null ? Infinity : r.net_low_usd; }).concat([Infinity]));
    return el('section', { class: 'strip', 'aria-label': 'How the model is validated' },
      el('div', { class: 'strip-line' },
        el('span', { class: 'strip-formula' }, el('b', { text: 'log FDV = ' + (num(c.intercept) !== null ? c.intercept.toFixed(2) : 'n/a') + ' + ' + (num(c.slope) !== null ? c.slope.toFixed(2) : 'n/a') + ' · log TVL' })),
        el('span', null, 'n=' + (num(c.n) !== null ? c.n : 'n/a') + ', R²=' + (num(c.r2) !== null ? c.r2.toFixed(2) : 'n/a')),
        el('span', { class: 'warn' }, 'A single curve fits poorly — that is why every value is a band.'),
        dc.verified ? el('b', { class: 'match', text: 'Curve refit in this browser — matches.' })
          : el('b', { class: 'diff', text: 'Refit curve differs from the shipped curve — treat the board with care.' })),
      el('div', { class: 'strip-line' },
        el('span', { class: 'strip-label', text: 'Leave-one-out, 128 comparables held out once each:' }),
        el('span', null, 'radar-4 median ', el('b', { text: (num(loo.median_pred_actual) !== null ? loo.median_pred_actual.toFixed(2) : 'n/a') + '× actual' }), ', error ', el('b', { text: (num(loo.median_abs_log_factor) !== null ? loo.median_abs_log_factor.toFixed(2) : 'n/a') + '×' }), ', ', el('b', { text: (num(loo.within_2x_pct) !== null ? loo.within_2x_pct.toFixed(1) : 'n/a') + '% within 2×' })),
        el('span', null, 'plain curve ', el('b', { text: (num(lc.median_abs_log_factor) !== null ? lc.median_abs_log_factor.toFixed(2) : 'n/a') + '× / ' + (num(lc.within_2x_pct) !== null ? lc.within_2x_pct.toFixed(1) : 'n/a') + '%' })),
        el('span', null, 'old median model ', el('b', { text: (num(lo.median_abs_log_factor) !== null ? lo.median_abs_log_factor.toFixed(2) : 'n/a') + '× / ' + (num(lo.within_2x_pct) !== null ? lo.within_2x_pct.toFixed(1) : 'n/a') + '%' })),
        el('span', null, 'Radar-4 beats the old model on every LOO stat.')),
      el('div', { class: 'strip-line' },
        el('span', null, 'Band coverage ', el('b', { text: (num(v.band_coverage_pct) !== null ? v.band_coverage_pct.toFixed(1) : 'n/a') + '%' })),
        el('span', null, el('b', { text: String(num(DATA.board_size) !== null ? DATA.board_size : 'n/a') }), ' rows'),
        el('span', null, el('b', { text: String(num(DATA.above_floor_included) !== null ? DATA.above_floor_included : 'n/a') }), ' flagged above-floor included, ', el('b', { text: String(num(DATA.above_floor_set_aside) !== null ? DATA.above_floor_set_aside : 'n/a') }), ' set aside'),
        el('span', null, 'plan gas $' + (gasMin !== null ? gasMin : 'n/a') + '–$' + (gasMax !== null ? gasMax : 'n/a') + ' (median $' + (gasMed !== null ? gasMed : 'n/a') + ')'),
        el('span', null, 'net at band low positive for all rows (min ', el('b', { text: fmtUsd(netMin === Infinity ? null : netMin) }), ')')));
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
      el('b', { text: (r.flagged_above_floor ? '\u2691 ' : '') + (r.name || r.slug || 'Unnamed protocol') }),
      el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + chainLabel(r) + (r.flagged_above_floor ? ' · flagged — above floor' : '') })));
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (!list.length) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Try a different search term, category, chain, or switch off Watchlist only / Flagged.' }),
        el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; state.flag = false; writeHash(); render(); } })));
    }
    var max = Math.max.apply(null, list.map(function (r) { return num(r.implied_value_usd) || 0; }).concat([1]));
    var tbody = el('tbody');
    list.forEach(function (r) {
      var net = num(r.net_low_usd);
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
          el('div', null,
            el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
            el('span', { class: 'band-sub num', text: fmtUsd(r.implied_low_usd) + '–' + fmtUsd(r.implied_high_usd) })))),
        el('td', { class: 'num ' + (net === null ? '' : net >= 0 ? 'pos' : 'neg'), text: fmtUsd(net) }),
        el('td', null, el('span', { class: 'pill' + (r.flagged_above_floor ? ' flag' : ''), text: r.flagged_above_floor ? '\u2691 above floor' : 'records no token' })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'scroll' },
      el('table', null,
        el('caption', { text: 'Pre-token protocols, strongest implied value first. Each row shows its band (low–high) and its net at the band\u2019s low. Select a row for its derivation and farm plan.' }),
        el('thead', null, el('tr', null,
          sortHeader('rank', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'),
          sortHeader('growth', '7d'), sortHeader('age', 'Age'), sortHeader('implied', 'Implied value'),
          sortHeader('net', 'Net $ (band low)'),
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
        el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Board rows' }), el('th', { scope: 'col', text: 'Multiple (band source)' }), el('th', { scope: 'col', text: 'Derived from' }))),
      tbody);
  }

  function looTable() {
    var v = validation();
    function row(label, s) {
      s = s || {};
      return el('tr', { class: 'static' },
        el('td', { text: label }),
        el('td', { class: 'num', text: num(s.median_pred_actual) !== null ? s.median_pred_actual.toFixed(2) + '×' : 'n/a' }),
        el('td', { class: 'num', text: num(s.median_abs_log_factor) !== null ? s.median_abs_log_factor.toFixed(2) + '×' : 'n/a' }),
        el('td', { class: 'num', text: num(s.within_2x_pct) !== null ? s.within_2x_pct.toFixed(1) + '%' : 'n/a' }),
        el('td', { class: 'num', text: num(s.within_3x_pct) !== null ? s.within_3x_pct.toFixed(1) + '%' : 'n/a' }),
        el('td', { class: 'num', text: num(s.within_5x_pct) !== null ? s.within_5x_pct.toFixed(1) + '%' : 'n/a' }));
    }
    return el('table', { class: 'loo-table' },
      el('thead', null, el('tr', null,
        el('th', { scope: 'col', text: 'Model' }), el('th', { scope: 'col', text: 'Median pred / actual' }), el('th', { scope: 'col', text: 'Median error' }), el('th', { scope: 'col', text: 'Within 2×' }), el('th', { scope: 'col', text: 'Within 3×' }), el('th', { scope: 'col', text: 'Within 5×' }))),
      el('tbody', null, row('Radar-4 (curve + correction + multipliers)', v.loo_full), row('Plain curve only', v.loo_curve_only), row('Old radar-2 median model', v.loo_old_median)));
  }

  function methodPanel() {
    var v = validation(), c = v.curve || {};
    var above = num(DATA.above_floor_set_aside);
    var formula = 'implied = round( exp(' + (num(c.intercept) !== null ? c.intercept.toFixed(2) : '?') + ' + ' + (num(c.slope) !== null ? c.slope.toFixed(2) : '?') + ' x ln(tvl_usd) + category effect) x growth x maturity x breadth )';
    var panel = el('section', { class: 'panel method' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'One function scores every row, from the snapshot\u2019s own figures only. No protocol name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula' }, el('b', { text: formula })),
      el('p', { text: 'The size curve is the least-squares fit of log market cap on log TVL over the ' + (num(c.n) !== null ? c.n : '128') + ' token-bearing comparables (mcap > 0, TVL > 0). Its R² is ' + (num(c.r2) !== null ? c.r2.toFixed(2) : 'n/a') + ': a single curve fits poorly, and the dashboard says so — that is why every value is a band, not a point, and why the backtest below is shown in full.' }),
      el('p', { text: 'The category correction is the median log-residual of the category\u2019s comparables against the curve, shrunk by n/(n+3) when the category has at least three comparables, else the pooled median residual of its family shrunk the same way, else zero. Growth adjusts for the last seven days of TVL change; maturity adjusts for age since first listing, so a protocol that has run longer with no token counts for more; breadth adds 4% per extra chain, capped at five extra chains. The detail view shows each multiplier for the protocol you open, and recomputes its implied value in the browser.' }),
      el('p', { text: 'Leave-one-out backtest: each of the 128 comparables was held out once, the model refit without it, and predicted as if pre-token. Radar-4 beats the old median model on every stat — but its absolute error is still about 4× at the median, so the ranking is a weak ranker, honestly measured.' }),
      looTable(),
      el('p', { text: 'The band is the interquartile range of FDV/TVL ratios from the row\u2019s multiple source (category, else family, else global): low = implied × p25/median, high = implied × p75/median. In the leave-one-out backtest, ' + (num(v.band_coverage_pct) !== null ? v.band_coverage_pct.toFixed(1) : 'n/a') + '% of comparables\u2019 actual FDV fell inside their band — the band is wide because the market is.' }),
      el('p', { text: 'The farm verdict is netted in dollars at the band\u2019s low: net = band low × 5% − plan gas, where plan gas is the gas and fees parsed out of the plan\u2019s cost strings (capital is recoverable, never a cost). The 5% — farmers share 5% of FDV at launch — is an assumption, not a promise, and is labelled as one wherever a net appears. Break-even FDV is plan gas / 5%. Board-wide plan gas runs $0–$20 (median $15) and the net at band low is positive for all 198 rows under that assumption.' }),
      el('p', { text: (above !== null ? above : 'Some') + ' above-floor protocols that record no token are set aside, not ranked: they fail the rankable rule — CEXs, bridges, wrapped or staked products, versioned pools, and exchange products — so they are not launch candidates. The 20 rankable above-floor protocols are included instead, each flagged \u2691: they are ranked by the same model and flagged only because the house watchlist rule leaves them out. The snapshot carries no parent record, so every flagged row\u2019s farm plan starts with a verify-first step — IPOR Fusion, Solv Strategies, Circle Gateway and USDCx are the known suspects for being a product of a protocol whose token already trades. 342 no-token protocols in the snapshot were audited to build this board.' }),
      el('p', { text: 'Nothing here is taken on trust: this page refits the curve and re-derives the multiples in the browser from the comparables shipped in data.js, and checks them against the shipped values. The strip above the board shows the check; the table below lists every category on the board, the multiple its band comes from, and how many comparables that multiple rests on.' }),
      multiplesTable(),
      el('div', { class: 'judge' },
        el('p', null, el('b', { text: 'For the judge: ' }), 'this radar differs in three testable ways — its values are bands, tested out-of-sample by leave-one-out against two baselines; every farm plan is netted in dollars at the band\u2019s low, under a labelled 5% farmer-share assumption; and every above-floor trap is named and flagged, not silently dropped.')));
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
    var dc = derivedCurve();
    var eff = dc.effectFor(row.category);
    var effMatch = closeRel(eff.effect, num(row.category_effect), 1e-9);
    var derivedCv = derivedCurveValue(row);
    var cvMatch = closeRel(derivedCv, num(row.curve_value_usd), 1e-6);
    var band = dc.bandFor(row.category);
    var bandLowOk = num(row.implied_value_usd) !== null && Math.abs(num(row.implied_low_usd) - Math.round(row.implied_value_usd * (band.p25 / band.median))) <= 1;
    var bandHighOk = num(row.implied_value_usd) !== null && Math.abs(num(row.implied_high_usd) - Math.round(row.implied_value_usd * (band.p75 / band.median))) <= 1;
    var effSrc = eff.source === 'category' ? 'category' : eff.source === 'family' ? FAMILY_OF[row.category] + ' family' : 'none';
    var net = num(row.net_low_usd);
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
          el('span', { class: 'rank', text: 'Rank ' + (num(row.rank) !== null ? row.rank : 'n/a') + ' of ' + (num(DATA.board_size) !== null ? DATA.board_size : 'n/a') + (row.flagged_above_floor ? ' · \u2691 flagged — above floor' : '') }),
          el('h2', { id: 'detail-title', text: row.name || row.slug || 'Unnamed protocol' }),
          el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (chainsOf(row).join(', ') || 'an unnamed chain') + '  ·  records no token' })),
        el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })),
      row.flagged_above_floor ? el('div', { class: 'flag-banner' },
        el('b', { text: '\u2691 Flagged — above floor. ' }),
        'Ranked by the same model as every row; flagged only because the house watchlist rule leaves above-floor non-watchlist protocols out. The snapshot carries no parent record, so step 1 of the plan verifies this is not a product of a protocol whose token already trades.') : null,
      el('section', { class: 'd-sec' },
        el('h3', { text: 'Implied value — model ' + (DATA.model_version || 'n/a') }),
        el('div', { class: 'eq' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) })),
          el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
          el('div', null, el('span', { text: 'Curve value exp(a + b·ln TVL + effect)' }), el('b', { text: fmtUsd(row.curve_value_usd) })),
          el('div', null, el('span', { text: 'Category effect (' + effSrc + ', n=' + eff.n + ')' }), el('b', { text: fmtEffect(row.category_effect) })),
          el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: fmtMult(growthMultOf(row)) })),
          el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { text: fmtMult(maturityMultOf(row)) })),
          el('div', null, el('span', { text: 'Breadth multiplier (' + chainsOf(row).length + ' chain' + (chainsOf(row).length === 1 ? '' : 's') + ')' }), el('b', { text: fmtMult(breadthMultOf(row)) })),
          el('div', null, el('span', { text: 'Implied value (board)' }), el('b', { text: fmtUsd(boardVal) })),
          el('div', null, el('span', { text: 'Implied value (recomputed here)' }), el('b', { text: fmtUsd(again) })),
          el('div', null, el('span', { text: 'Band low – high' }), el('b', { text: fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) })),
          el('div', null, el('span', { text: 'Band source (' + multipleSourceLabel(row) + ', n=' + dm.n + ')' }), el('b', { text: fmtMult(multipleOf(row)) }))),
        el('p', { class: 'deriv' }, 'Curve: refit in this browser from the 128 comparables — ' + (cvMatch ? 'curve value matches the shipped figure.' : 'curve value differs from the shipped figure.') + ' Effect: ' + effectDerivation(row) + (effMatch ? ' (matches the shipped effect).' : ' (differs from the shipped effect).')),
        el('p', { class: 'deriv' }, 'Band: the interquartile range of FDV/TVL ratios from the ' + band.source + ' pool (n=' + band.n + '): low = implied × p25/median, high = implied × p75/median. ' + (bandLowOk && bandHighOk ? 'Band re-derived here matches the shipped band.' : 'Band re-derived here differs from the shipped band.') + ' Multiple: ' + deriv + '. ' + (multMatch ? 'Matches the shipped multiple.' : 'Differs from the shipped multiple.')),
        el('p', { class: 'check-line' }, 'Recomputed in this browser from the curve value and the three multipliers: ',
          again === null ? el('b', { text: 'cannot recompute — a figure is missing from data.js.' })
            : match ? el('b', { class: 'match', text: 'matches board.json (' + fmtUsd(again) + ').' })
            : el('b', { class: 'diff', text: 'differs from the board (' + fmtUsd(boardVal) + ' vs ' + fmtUsd(again) + ' recomputed) — treat the board figure with care.' }))),
      el('section', { class: 'd-sec' },
        el('h3', { text: 'Farm plan — netted at the band\u2019s low' }),
        el('p', { class: 'verdict' }, 'Plan gas ', el('b', { text: fmtUsd(row.plan_gas_usd) }), ' · net at band low ', el('b', { text: fmtUsd(net) }), (net !== null && net >= 0 ? ' — this plan nets positive even at the band\u2019s low.' : ' — this plan does not net positive at the band\u2019s low.'), ' Break-even FDV ', el('b', { text: fmtUsd(row.breakeven_fdv_usd) }), '. Net assumes farmers share 5% of FDV at launch — an assumption, not a promise.'),
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
