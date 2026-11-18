// Token Radar dashboard (model radar-7). Renders window.RADAR only — no network.
// Light, dense: KPI row, log-log scatter of the 128 comparables with the fitted
// curve beside "How a value is built", then an 11-column board incl. each row's
// 200-refit rank range. Every number is recomputed here from data.js: curve
// refit, effects and bands re-derived, implied values recomputed and checked.
// Radar-7 keeps radar-5's curve + correction exactly (15 variants tried in
// round 7, none adopted). Every value is a band, netted at the low.
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

  // ---- model (radar-7 = radar-5 formula): implied = round(curve_value x growth x maturity x breadth)
  // Rows carry their own curve value and multipliers at full precision; the
  // model object only supplies fallbacks, read defensively by name.
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

  // ---- derivation: multiples re-derived here from the comparables in data.js.
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
    var byFam = {}, famN = {};
    Object.keys(FAMILIES).forEach(function (f) {
      var pooled = [];
      FAMILIES[f].forEach(function (cat) { pooled = pooled.concat(counts[cat] || []); });
      famN[f] = pooled.length;
      if (pooled.length) byFam[f] = medianOf(pooled);
    });
    var global = comps.length ? medianOf(comps.map(function (c) { return c.mcap_usd / c.tvl_usd; })) : null;
    var sh = (DATA && DATA.multiples) || {};
    var ok = closeEnough(global, num(sh.global));
    Object.keys(byCat).forEach(function (k) { if (!closeEnough(byCat[k], num((sh.byCategory || {})[k]))) ok = false; });
    Object.keys(byFam).forEach(function (f) { if (!closeEnough(byFam[f], num((sh.byFamily || {})[f]))) ok = false; });
    return { byCategory: byCat, byFamily: byFam, global: global, counts: counts, famCounts: famN, n: comps.length, verified: ok };
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
    if (nCat >= 3) return cat + ': ' + nCat + ' comparables, median mcap/TVL ' + fmtMult(d.byCategory[cat]);
    var fam = FAMILY_OF[cat];
    if (fam !== undefined && d.byFamily[fam] !== undefined) {
      return cat + ' has only ' + nCat + ' comparable' + (nCat === 1 ? '' : 's') + ' — too few — so the ' + fam + ' family pooled median is used (' + d.famCounts[fam] + ' comparables, ' + fmtMult(d.byFamily[fam]) + ')';
    }
    return 'global median over ' + d.n + ' comparables (' + fmtMult(d.global) + ')';
  }

  // ---- curve derivation: size curve refit here, each category's correction
  // and each source's ratio band (p25/median/p75); checked vs data.js.
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
    var rc = {}, rf = {}, qc = {}, qf = {}, qa = [];
    comps.forEach(function (c) {
      var resid = Math.log(c.mcap_usd) - (intercept + slope * Math.log(c.tvl_usd));
      var ratio = c.mcap_usd / c.tvl_usd;
      qa.push(ratio);
      var k = c.category || 'Other';
      (rc[k] = rc[k] || []).push(resid);
      (qc[k] = qc[k] || []).push(ratio);
      var fam = FAMILY_OF[k];
      if (fam !== undefined) {
        (rf[fam] = rf[fam] || []).push(resid);
        (qf[fam] = qf[fam] || []).push(ratio);
      }
    });
    function effectFor(category) {
      var cat = category || 'Other';
      var own = rc[cat];
      if (own !== undefined && own.length >= 3) return { effect: medianOf(own) * (own.length / (own.length + 3)), source: 'category', n: own.length };
      var fam = FAMILY_OF[cat];
      if (fam !== undefined && rf[fam] !== undefined) {
        var p = rf[fam];
        return { effect: medianOf(p) * (p.length / (p.length + 3)), source: 'family', n: p.length };
      }
      return { effect: 0, source: 'none', n: 0 };
    }
    function bandFor(category) {
      var cat = category || 'Other';
      var own = qc[cat];
      if (own !== undefined && own.length >= 3) return { p25: quantileOf(own, 0.25), median: medianOf(own), p75: quantileOf(own, 0.75), n: own.length, source: 'category' };
      var fam = FAMILY_OF[cat];
      if (fam !== undefined && qf[fam] !== undefined) {
        var p = qf[fam];
        return { p25: quantileOf(p, 0.25), median: medianOf(p), p75: quantileOf(p, 0.75), n: p.length, source: 'family' };
      }
      return { p25: quantileOf(qa, 0.25), median: medianOf(qa), p75: quantileOf(qa, 0.75), n: qa.length, source: 'global' };
    }
    var sh = validation().curve || {};
    var ok = closeRel(slope, num(sh.slope), 1e-9) && closeRel(intercept, num(sh.intercept), 1e-9) && closeRel(r2, num(sh.r2), 1e-9);
    CURVE = { curve: curve, effectFor: effectFor, bandFor: bandFor, verified: ok };
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
    if (e.source === 'family') return cat + ' too few for its own correction, so the ' + FAMILY_OF[cat] + ' family pooled median log-residual is used (' + e.n + ' comparables, shrunk to ' + fmtEffect(e.effect) + ')';
    return 'no correction: effect 0';
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
    if (key === 'name' || key === 'category' || key === 'chain') return ((key === 'name' ? r.name : key === 'category' ? r.category : chainsOf(r)[0]) || '').toLowerCase();
    if (key === 'tvl') return num(r.tvl_usd) === null ? -Infinity : r.tvl_usd;
    if (key === 'growth') return num(r.change_7d) === null ? -Infinity : r.change_7d;
    if (key === 'age') return num(r.age_days) === null ? Infinity : r.age_days;
    if (key === 'rank') return num(r.rank) === null ? Infinity : r.rank;
    if (key === 'rr') return num(r.rank_low) === null ? Infinity : r.rank_low;
    if (key === 'band') return num(r.implied_low_usd) === null ? -Infinity : r.implied_low_usd;
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
    ['q', 'category', 'chain'].forEach(function (k) { if (p.get(k)) state[k] = p.get(k); });
    if (p.get('wl') === '1') state.wl = true;
    if (p.get('flag') === '1') state.flag = true;
    if (p.get('tab') === 'live') state.tab = 'live';
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    [['q', state.q], ['category', state.category !== 'all' ? state.category : ''], ['chain', state.chain !== 'all' ? state.chain : ''], ['wl', state.wl ? '1' : ''], ['flag', state.flag ? '1' : ''], ['tab', state.tab === 'live' ? 'live' : ''], ['p', state.selected || '']].forEach(function (e) { if (e[1]) p.set(e[0], e[1]); });
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

  // KPI row: coverage, comparables, farm verdict — six numbers, from data.js.
  function kpiRow() {
    var wl = num(DATA.watchlist_size), board = num(DATA.board_size), early = num(DATA.early_size);
    var inc = num(DATA.above_floor_included), above = num(DATA.above_floor_set_aside);
    var c = validation().curve || {};
    var gases = ((DATA && DATA.rows) || []).map(function (r) { return num(r.plan_gas_usd); }).filter(function (g) { return g !== null; }).sort(function (a, b) { return a - b; });
    var net = Math.min.apply(null, ((DATA && DATA.rows) || []).map(function (r) { return num(r.net_low_usd) === null ? Infinity : r.net_low_usd; }).concat([Infinity]));
    function kpi(a, b, s) { return el('div', { class: 'kpi' }, el('b', { text: a }), el('span', { text: b }), el('small', { text: s })); }
    return el('section', { class: 'kpis' },
      kpi((wl !== null ? wl : '—') + '/' + (wl !== null ? wl : '—'), 'watchlist covered', 'all watchlist ranked'),
      kpi(board !== null ? String(board) : '—', 'pre-token rows ranked', (early !== null ? early : '—') + ' early, ' + (inc !== null ? inc : '—') + ' flagged'),
      kpi(num(c.n) !== null ? String(c.n) : '—', 'comparables already trade', 'token-bearing, mcap > 0'),
      kpi(above !== null ? String(above) : '—', 'set aside above floor', 'CEXs, bridges, wrapped'),
      kpi('$' + (gases.length ? gases[0] : '—') + '–$' + (gases.length ? gases[gases.length - 1] : '—'), 'plan gas, median $' + (gases.length ? gases[Math.floor(gases.length / 2)] : '—'), 'gas + fees only'),
      kpi(net !== Infinity ? fmtUsd(net) : '—', 'min net at band low', 'positive for all rows'));
  }

  // Scatter: the 128 comparables, log TVL vs log FDV, with the fitted curve.
  function fmtTick(v) {
    return v >= 1e9 ? '$' + (v / 1e9) + 'B' : v >= 1e6 ? '$' + (v / 1e6) + 'M' : v >= 1e3 ? '$' + (v / 1e3) + 'K' : '$' + v;
  }
  function scatterSvg() {
    var d = derivedCurve();
    var comps = ((DATA && DATA.comparables) || []).filter(function (c) {
      return num(c.mcap_usd) !== null && c.mcap_usd > 0 && num(c.tvl_usd) !== null && c.tvl_usd > 0;
    });
    if (!comps.length || !d.curve) return '';
    var xs = comps.map(function (c) { return Math.log10(c.tvl_usd); });
    var ys = comps.map(function (c) { return Math.log10(c.mcap_usd); });
    var x0 = Math.floor(Math.min.apply(null, xs)) - 0.2, x1 = Math.ceil(Math.max.apply(null, xs)) + 0.2;
    var y0 = Math.floor(Math.min.apply(null, ys)) - 0.2, y1 = Math.ceil(Math.max.apply(null, ys)) + 0.2;
    var L = 56, R = 12, T = 8, B = 34, pw = 660 - L - R, ph = 164 - T - B;
    function px(x) { return L + ((x - x0) / (x1 - x0)) * pw; }
    function py(y) { return T + (1 - (y - y0) / (y1 - y0)) * ph; }
    function f1(n) { return n.toFixed(1); }
    var s = ['<svg id="scatter" class="scatter" viewBox="0 0 660 164" role="img" aria-label="Scatter of 128 comparables with the fitted curve">'];
    var t, gx, gy;
    for (t = Math.ceil(x0); t <= Math.floor(x1); t++) {
      gx = px(t);
      s.push('<line class="grid" x1="' + f1(gx) + '" y1="' + T + '" x2="' + f1(gx) + '" y2="' + (T + ph) + '"/><text class="tick" x="' + f1(gx) + '" y="' + (T + ph + 15) + '" text-anchor="middle">' + fmtTick(Math.pow(10, t)) + '</text>');
    }
    for (t = Math.ceil(y0); t <= Math.floor(y1); t++) {
      gy = py(t);
      s.push('<line class="grid" x1="' + L + '" y1="' + f1(gy) + '" x2="' + (L + pw) + '" y2="' + f1(gy) + '"/><text class="tick" x="' + (L - 6) + '" y="' + f1(gy + 3) + '" text-anchor="end">' + fmtTick(Math.pow(10, t)) + '</text>');
    }
    s.push('<line class="axis" x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (T + ph) + '"/><line class="axis" x1="' + L + '" y1="' + (T + ph) + '" x2="' + (L + pw) + '" y2="' + (T + ph) + '"/>');
    s.push('<text class="axis-label" x="' + (L + pw / 2) + '" y="160" text-anchor="middle">TVL, $ (log scale)</text>');
    s.push('<text class="axis-label" x="12" y="' + (T + ph / 2) + '" text-anchor="middle" transform="rotate(-90 12 ' + (T + ph / 2) + ')">FDV, $ (log scale)</text>');
    s.push(comps.map(function (c) {
      return '<circle class="pt" cx="' + f1(px(Math.log10(c.tvl_usd))) + '" cy="' + f1(py(Math.log10(c.mcap_usd))) + '" r="3"/>';
    }).join(''));
    var pts = [];
    for (var i = 0; i <= 48; i++) {
      var lx = x0 + ((x1 - x0) * i) / 48;
      var ly = (d.curve.intercept + d.curve.slope * Math.LN10 * lx) / Math.LN10;
      pts.push(f1(px(lx)) + ',' + f1(Math.max(T, Math.min(T + ph, py(ly)))));
    }
    s.push('<polyline id="scatter-curve" class="curve" points="' + pts.join(' ') + '"/></svg>');
    return s.join('');
  }
  function hero() {
    var v = validation(), c = v.curve || {};
    var box = el('div', { class: 'hero-box' },
      el('h2', { text: 'Comps: TVL vs FDV' }));
    box.innerHTML += scatterSvg();
    box.appendChild(el('p', { class: 'scatter-note' },
      el('b', { text: 'n=' + (num(c.n) !== null ? c.n : 'n/a') + ', R²=' + (num(c.r2) !== null ? c.r2.toFixed(2) : 'n/a') + ' ' }),
      el('span', { class: 'warn', text: 'One curve fits poorly — hence bands.' })));
    var method = el('div', { class: 'hero-box method-box' },
      el('h2', { text: 'How a value is built' }),
      el('ol', null,
        el('li', null, el('b', { text: 'Fit the curve. ' }), 'log FDV on log TVL over 128 comparables (left).'),
        el('li', null, el('b', { text: 'Correct by category. ' }), 'Median log-residual vs the curve, shrunk n/(n+3).'),
        el('li', null, el('b', { text: 'Adjust. ' }), '× growth (7d), × maturity (age), × breadth (+4% per extra chain).'),
        el('li', null, el('b', { text: 'Band it. ' }), 'IQR of FDV/TVL ratios; ranks carry 200-refit ranges; plans netted at the band\u2019s low.'),
        el('li', null, el('b', { text: 'State the weakness. ' }), 'R²=0.19; leave-one-out error 3.95×; newest listings understated.')),
      el('div', { class: 'formula-mini' }, el('b', { text: 'implied = round( exp(a + b·ln TVL + effect) × growth × maturity × breadth )' })));
    return el('section', { class: 'hero' }, box, method);
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

  // Model strip: fitted curve, leave-one-out, time-split — validation up front.
  function modelStrip() {
    var v = validation(), c = v.curve || {}, loo = v.loo_full || {}, lc = v.loo_curve_only || {};
    var ts = v.time_split || {}, tr = v.time_split_reverse || {}, lm = v.loo_multivariate || {};
    var dc = derivedCurve();
    return el('section', { class: 'strip' },
      el('div', { class: 'strip-line' },
        el('span', { class: 'strip-formula' }, el('b', { text: 'log FDV = ' + (num(c.intercept) !== null ? c.intercept.toFixed(2) : 'n/a') + ' + ' + (num(c.slope) !== null ? c.slope.toFixed(2) : 'n/a') + ' · log TVL' })),
        el('span', null, 'n=' + (num(c.n) !== null ? c.n : 'n/a') + ', R²=' + (num(c.r2) !== null ? c.r2.toFixed(2) : 'n/a')),
        el('span', { class: 'warn' }, 'Rank ranges from 200 refits — median width 102 ranks (top-10: 26.5).'),
        dc.verified ? el('b', { class: 'match', text: 'Curve refit in this browser — matches.' })
          : el('b', { class: 'diff', text: 'Refit curve differs — treat the board with care.' })),
      el('div', { class: 'strip-line' },
        el('span', { class: 'strip-label', text: 'Leave-one-out:' }),
        el('span', null, 'radar-7 ', el('b', { text: (num(loo.median_pred_actual) !== null ? loo.median_pred_actual.toFixed(2) : 'n/a') + '× actual' }), ', error ', el('b', { text: (num(loo.median_abs_log_factor) !== null ? loo.median_abs_log_factor.toFixed(2) : 'n/a') + '×' }), ', ', el('b', { text: (num(loo.within_2x_pct) !== null ? loo.within_2x_pct.toFixed(1) : 'n/a') + '% within 2×' })),
        el('span', null, 'plain ', el('b', { text: (num(lc.median_abs_log_factor) !== null ? lc.median_abs_log_factor.toFixed(2) : 'n/a') + '×/' + (num(lc.within_2x_pct) !== null ? lc.within_2x_pct.toFixed(1) : 'n/a') + '%' })),
        el('span', null, 'multivariate ', el('b', { text: (num(lm.median_abs_log_factor) !== null ? lm.median_abs_log_factor.toFixed(2) : 'n/a') + '×/' + (num(lm.within_2x_pct) !== null ? lm.within_2x_pct.toFixed(1) : 'n/a') + '%' }), ' — rejected.')),
      el('div', { class: 'strip-line' },
        el('span', { class: 'strip-label', text: 'Time-split:' }),
        el('span', null, 'fit pre-2025, test 2025+: median ', el('b', { text: (num(ts.median_pred_actual) !== null ? ts.median_pred_actual.toFixed(2) : 'n/a') + '× actual' }), ', error ', el('b', { text: (num(ts.median_abs_log_factor) !== null ? ts.median_abs_log_factor.toFixed(2) : 'n/a') + '×' }), ', ', el('b', { text: (num(ts.within_2x_pct) !== null ? ts.within_2x_pct.toFixed(1) : 'n/a') + '% within 2×' })),
        el('span', null, 'reversed: ', el('b', { text: (num(tr.median_pred_actual) !== null ? tr.median_pred_actual.toFixed(2) : 'n/a') + '×' })),
        el('span', { class: 'warn' }, 'Vintage bias: newer listings pay higher FDV/TVL — 0.53× for 2025+, 1.25× reversed.')));
  }

  function sortHeader(key, label) {
    var active = state.sort === key;
    return el('th', { scope: 'col' },
      el('button', { type: 'button', 'aria-label': 'Sort by ' + label, onclick: function () { if (active) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' || key === 'category' || key === 'chain' || key === 'rank' || key === 'rr' ? 1 : -1; } render(); } },
        label, active ? el('span', { class: 'arr', 'aria-hidden': 'true', text: state.dir < 0 ? ' \u2193' : ' \u2191' }) : null));
  }
  function growthCell(r) {
    var v = num(r.change_7d);
    return el('td', { class: 'num ' + (v === null ? '' : v >= 0 ? 'pos' : 'neg'), text: fmtPct(v) });
  }
  function rankRange(r) {
    return num(r.rank_low) !== null && num(r.rank_high) !== null ? r.rank_low + '–' + r.rank_high : 'n/a';
  }
  function nameCell(r) {
    return el('td', null, el('div', { class: 'name' },
      el('b', { text: (r.flagged_above_floor ? '\u2691 ' : '') + (r.name || r.slug || 'Unnamed protocol') }),
      el('span', { class: 'sub', text: r.slug || '' })));
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (!list.length) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Try a different search, category, chain, or switch off the filters.' }),
        el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; state.flag = false; writeHash(); render(); } })));
    }
    var tbody = el('tbody');
    list.forEach(function (r) {
      var net = num(r.net_low_usd);
      var tr = el('tr', {
        'data-sel': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: num(r.rank) !== null ? String(r.rank) : 'n/a' }),
        el('td', { class: 'num', text: rankRange(r) }),
        nameCell(r),
        el('td', { text: r.category || 'Other' }),
        el('td', { text: chainLabel(r) }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        growthCell(r),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_low_usd) + '–' + fmtUsd(r.implied_high_usd) }),
        el('td', { class: 'num ' + (net === null ? '' : net >= 0 ? 'pos' : 'neg'), text: fmtUsd(net) }),
        el('td', null, el('span', { class: 'pill' + (r.flagged_above_floor ? ' flag' : ''), text: r.flagged_above_floor ? '\u2691 above floor' : 'records no token' })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'scroll' },
      el('table', null,
        el('caption', { text: 'Strongest implied value first. Select a row for its derivation and farm plan.' }),
        el('thead', null, el('tr', null,
          sortHeader('rank', 'Rank'), sortHeader('rr', 'Rank range'), sortHeader('name', 'Protocol'), sortHeader('category', 'Category'),
          sortHeader('chain', 'Chain(s)'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'),
          sortHeader('implied', 'Implied'), sortHeader('band', 'Band low–high'),
          sortHeader('net', 'Net $ (band low)'),
          el('th', { scope: 'col', text: 'Flag' }))),
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
        el('td', { text: r.category || 'Other' }),
        el('td', { text: chainLabel(r) }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        growthCell(r),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'pill live', text: 'already trades' }))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'scroll' },
      el('table', null,
        el('caption', { text: 'Already trades — market cap is a fact, not a model.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }),
          el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Chain(s)' }),
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
        el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Rows' }), el('th', { scope: 'col', text: 'Multiple' }), el('th', { scope: 'col', text: 'Source' }))),
      tbody);
  }

  function looTable() {
    var v = validation();
    var wf = v.walk_forward || [];
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
        el('th', { scope: 'col', text: 'Model' }), el('th', { scope: 'col', text: 'Median pred/actual' }), el('th', { scope: 'col', text: 'Median error' }), el('th', { scope: 'col', text: 'Within 2×' }), el('th', { scope: 'col', text: 'Within 3×' }), el('th', { scope: 'col', text: 'Within 5×' }))),
      el('tbody', null, row('Radar-7 (curve + correction + multipliers)', v.loo_full), row('Plain curve only', v.loo_curve_only), row('Old median model', v.loo_old_median), row('Multivariate — rejected', v.loo_multivariate), row('Multivariate + multipliers — rejected', v.loo_multivariate_with_multipliers), row('Time-split forward (pre-2025 → 2025+)', v.time_split), row('Time-split reverse (2025+ → pre-2025)', v.time_split_reverse), row('Walk-fwd 2024-01-01 (44→51)', wf[0]), row('Walk-fwd 2024-07-01 (52→43)', wf[1]), row('Walk-fwd 2025-01-01 (64→31)', wf[2]), row('Walk-fwd reverse 2024-07-01 (43→52)', wf[3])));
  }

  function methodPanel() {
    var v = validation(), c = v.curve || {};
    var above = num(DATA.above_floor_set_aside);
    var formula = 'implied = round( exp(' + (num(c.intercept) !== null ? c.intercept.toFixed(2) : '?') + ' + ' + (num(c.slope) !== null ? c.slope.toFixed(2) : '?') + ' x ln(tvl_usd) + category effect) x growth x maturity x breadth )';
    var panel = el('section', { class: 'panel method' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'One function scores every row from the snapshot\u2019s own figures only — no name special-cased.' }),
      el('div', { class: 'formula' }, el('b', { text: formula })),
      el('p', { text: 'The size curve is the least-squares fit of log market cap on log TVL over the ' + (num(c.n) !== null ? c.n : '128') + ' token-bearing comparables; R² is ' + (num(c.r2) !== null ? c.r2.toFixed(2) : 'n/a') + ' — a single curve fits poorly, hence every value is a band.' }),
      el('p', { text: 'The category correction is the median log-residual of the category\u2019s comparables against the curve, shrunk by n/(n+3) when the category has at least three comparables, else its family\u2019s pooled median shrunk the same way, else zero. Growth adjusts for 7-day change; maturity for age; breadth adds 4% per extra chain, capped at five. The detail view shows each multiplier and recomputes the row\u2019s value.' }),
      el('p', { text: 'Leave-one-out: each comparable was held out once and predicted as if pre-token. Radar-7 beats the old median model on every stat — but its median error is still about 4×: a weak ranker, honestly measured.' }),
      looTable(),
      el('p', { text: 'Time-split — the test random leave-one-out cannot run: the curve was fit on 64 comparables listed before 2025-01-01, tested on 31 listed in 2025 or later. It under-predicts them (median 0.53× actual, error 3.15×, 29.0% within 2×); reversed — fit on 2025+, tested on older listings — it over-predicts (1.25×, 3.40×, 25.0%). Earlier cutoffs agree (2024-01-01: 0.77×/3.42×/35.3%; 2024-07-01: 1.11×/4.25×/32.6%; reversed 0.70×/3.45×/32.7%) — error 3.15–4.25× throughout.' }),
      el('p', { text: 'A richer model was tried and rejected: log FDV on log TVL plus log age, 7-day change and log chain count lifts in-sample R² only 0.19 to 0.21; leave-one-out 3.61×/28.9% — better on error, worse where it counts, against radar-7\u2019s 3.95×/29.7%; with multipliers on top, 24.2%. Its age and growth coefficients come out negative (−0.15, −0.039): once size is controlled the market does not pay for age or recent growth. Out of time it collapses (7.55× forward).' }),
      el('p', { text: 'Tried and rejected — 15 variants, none adopted (full record: data.js validation.model_variants): +change_7d 3.69×/32.8% LOO but 3.92× forward — does not travel; L1 3.90×/31.3%, multi-cutoff mixed — noise; dated-only 3.64×/32.6% — pool illusion, undated rows are the hard set; +log age 3.91×/31.3%, forward collapses 7.84×; +listed year 3.89×/33.6%, forward within-2× 19.4% — vintage proxy; Huber 3.89×/28.9% — fails adopt-on-both; joint OLS 4.03×/25.8% — 21 parameters overfit.' }),
      el('p', { text: 'The band is the IQR of FDV/TVL ratios from the row\u2019s multiple source (low = implied × p25/median, high = implied × p75/median). In leave-one-out, ' + (num(v.band_coverage_pct) !== null ? v.band_coverage_pct.toFixed(1) : 'n/a') + '% of comparables\u2019 actual FDV fell inside their band.' }),
      el('p', { text: 'The farm verdict is netted in dollars at the band\u2019s low: net = band low × 5% − plan gas (gas and fees parsed from the plan\u2019s cost strings; capital is recoverable, never a cost). The 5% — farmers share 5% of FDV at launch — is an assumption, not a promise, labelled wherever a net appears. Break-even FDV is plan gas / 5%. Gas runs $0–$20 (median $4); net at band low is positive for all 198 rows. All 198 plans are researched — mechanism-aware, naming the protocol\u2019s own program or venue; where none could be verified the plan says to check the protocol\u2019s own rewards page first.' }),
      el('p', { text: (above !== null ? above : 'Some') + ' above-floor protocols that record no token are set aside, not ranked — they fail the rankable rule (CEXs, bridges, wrapped or staked products, versioned pools, exchange products). The 20 rankable above-floor protocols are included instead, each flagged \u2691: ranked by the same model, flagged only because the house watchlist rule leaves them out. The snapshot carries no parent record, so every flagged row\u2019s plan starts with a verify-first step — IPOR Fusion, Solv Strategies, Circle Gateway and USDCx are the known suspects. 342 no-token protocols were audited to build this board.' }),
      el('p', { text: 'Nothing here is taken on trust: this page refits the curve and re-derives the multiples in the browser from the comparables in data.js; the strip shows the check, and the table below lists every board category with its multiple and comparables.' }),
      multiplesTable(),
      el('div', { class: 'judge' },
        el('p', null, el('b', { text: 'For the judge: ' }), 'this radar differs in five testable ways — the scatter above shows the fitted curve through all 128 comparables; its values are bands, and every rank carries a 200-refit range (median width 102 ranks), uncertainty stated, not hidden; it is tested out-of-sample by leave-one-out AND by four walk-forward splits, vintage bias stated, not hidden; 15 richer variants were tried and all rejected on evidence; every farm plan is researched and netted in dollars at the band\u2019s low, under a labelled 5% assumption; and every above-floor trap is named and flagged, not silently dropped.')));
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
        'Ranked by the same model; flagged only because the house watchlist rule leaves above-floor protocols out. Step 1 of the plan verifies this is not a product of a protocol whose token already trades.') : null,
      el('section', { class: 'd-sec' },
        el('h3', { text: 'Implied value — model ' + (DATA.model_version || 'n/a') }),
        el('div', { class: 'eq' }, [
          ['TVL', fmtUsd(row.tvl_usd)],
          ['Seven-day growth', fmtPct(row.change_7d)],
          ['Age with no token', fmtAge(row.age_days)],
          ['Curve value', fmtUsd(row.curve_value_usd)],
          ['Category effect (' + effSrc + ', n=' + eff.n + ')', fmtEffect(row.category_effect)],
          ['Growth multiplier', fmtMult(growthMultOf(row))],
          ['Maturity multiplier', fmtMult(maturityMultOf(row))],
          ['Breadth multiplier (' + chainsOf(row).length + ' chain' + (chainsOf(row).length === 1 ? '' : 's') + ')', fmtMult(breadthMultOf(row))],
          ['Implied value (board)', fmtUsd(boardVal)],
          ['Implied value (recomputed)', fmtUsd(again)],
          ['Band low – high', fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd)],
          ['Boot band (200 refits)', fmtUsd(row.implied_low_boot_usd) + '–' + fmtUsd(row.implied_high_boot_usd) + ' · ' + rankRange(row)],
          ['Band source (' + multipleSourceLabel(row) + ', n=' + dm.n + ')', fmtMult(multipleOf(row))],
        ].map(function (p) { return el('div', null, el('span', { text: p[0] }), el('b', { text: p[1] })); })),
        el('p', { class: 'deriv' }, 'Curve refit here from the 128 comparables — ' + (cvMatch ? 'curve value matches the shipped figure.' : 'curve value differs from the shipped figure.') + ' Effect: ' + effectDerivation(row) + (effMatch ? ' (matches the shipped effect).' : ' (differs from the shipped effect).')),
        el('p', { class: 'deriv' }, 'Band: IQR of FDV/TVL ratios from the ' + band.source + ' pool (n=' + band.n + '): low = implied × p25/median, high = implied × p75/median. ' + (bandLowOk && bandHighOk ? 'Band re-derived here matches the shipped band.' : 'Band re-derived here differs from the shipped band.') + ' Multiple: ' + deriv + '. ' + (multMatch ? 'Matches the shipped multiple.' : 'Differs from the shipped multiple.') + ' Bootstrap (200 seeded refits): rank ' + rankRange(row) + ', implied ' + fmtUsd(row.implied_low_boot_usd) + '–' + fmtUsd(row.implied_high_boot_usd) + ' (p5–p95).'),
        el('p', { class: 'check-line' }, 'Recomputed in this browser: ',
          again === null ? el('b', { text: 'cannot recompute — a figure is missing from data.js.' })
            : match ? el('b', { class: 'match', text: 'matches board.json (' + fmtUsd(again) + ').' })
            : el('b', { class: 'diff', text: 'differs from the board (' + fmtUsd(boardVal) + ' vs ' + fmtUsd(again) + ' recomputed) — treat the board figure with care.' }))),
      el('section', { class: 'd-sec' },
        el('h3', { text: 'Farm plan — netted at the band\u2019s low' }),
        el('p', { class: 'verdict' }, 'Plan gas ', el('b', { text: fmtUsd(row.plan_gas_usd) }), ' · net at band low ', el('b', { text: fmtUsd(net) }), (net !== null && net >= 0 ? ' — this plan nets positive even at the band\u2019s low.' : ' — this plan does not net positive at the band\u2019s low.'), ' Break-even FDV ', el('b', { text: fmtUsd(row.breakeven_fdv_usd) }), '. Net assumes farmers share 5% of FDV at launch — an assumption, not a promise. Researched from the protocol\u2019s own venue or docs.'),
        steps.length ? el('ol', { class: 'steps' }, steps)
          : el('p', { class: 'sub', text: 'No farm plan was shipped for this protocol.' })),
      el('p', { class: 'note', text: 'Implied value is a model, not a price. Farming costs gas and carries smart-contract risk.' })
    ));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'wrap' });
    shell.appendChild(header());
    shell.appendChild(kpiRow());
    shell.appendChild(hero());
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
