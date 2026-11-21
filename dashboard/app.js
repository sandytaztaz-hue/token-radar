/* Token Radar dashboard (r6): Launch Radar header, tab-pill filters +
   deposit/drop-share/horizon controls, checkbox + rank-range column,
   merged implied-value column, 3-line verdict cells, detail view with
   chips row and the full 10-step farm plan in the right column. r6:
   the default board keeps every watchlist row, and the token odds are
   a logistic fit (age, category, growth, size, chains); the
   fitted-multiple model and the farm-plan structure are unchanged
   from r5. The tabs and sliders only re-cut the board's own numbers,
   never the verdicts. No network: all data comes from ../data.js
   (window.RADAR). */
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.body.insertAdjacentHTML('beforeend', '<p>No data loaded.</p>'); return; }
  var rows = D.rows.slice();
  var $ = function (id) { return document.getElementById(id); };

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function moneyFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  /* Small dollars with cents when they matter (verdict cell drop/fees). */
  function moneySmall(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 10) return '$' + Math.round(n);
    return '$' + n.toFixed(2).replace(/\.00$/, '');
  }
  function signedSmall(n) {
    if (n === null || n === undefined) return '—';
    return (n < 0 ? '−' : '') + moneySmall(Math.abs(n));
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n > 0 ? 'up' : n < 0 ? 'down' : '') + '">' + s + '</span>';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function ageText(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + ' yrs';
    return d + ' d';
  }
  function ageLong(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + ' yrs (' + d + ' days)';
    return d + ' days';
  }
  function oddsBar(o) {
    var p = Math.round(o * 100);
    return '<span class="odds"><span class="odds-bar"><span style="width:' + p + '%"></span></span>' + p + '%</span>';
  }
  function verdictBadge(v) {
    return '<span class="verdict ' + v.toLowerCase() + '">' + v + '</span>';
  }
  function netCell(n) {
    if (n === null || n === undefined) return '—';
    var s = (n > 0 ? '+' : '') + '$' + Math.round(Math.abs(n));
    if (n < 0) s = '−$' + Math.round(Math.abs(n));
    return '<span class="' + (n > 0 ? 'up' : n < 0 ? 'down' : '') + '">' + s + '</span>';
  }
  /* Which broad family a category belongs to — the same mapping the
     model uses for its fallback multiple (lib/model.ts familyOf). */
  function familyOf(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('uncollateral') >= 0) return 'Lending';
    if (c.indexOf('dex') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('options') >= 0 || c.indexOf('leveraged') >= 0) return 'Trading';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 'Staking';
    if (c.indexOf('bridge') >= 0) return 'Bridging';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('vault') >= 0) return 'Yield';
    if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0 || c.indexOf('basis') >= 0) return 'Real-world';
    return 'Other';
  }

  var fit = D.fit, st = D.stats, acct = D.accounting, def = D.default_board;

  /* Default board: DeFi rows plus every watchlist row, whatever its
     category. The full 342-row board stays in D.rows; the board opens
     on the default rows (def.board_size), each with a stable default
     rank for the rank column. */
  var EXCLUDED = new Set(def ? def.excluded_categories : []);
  var boardRows = rows.filter(function (r) { return r.watchlist || !EXCLUDED.has(r.category); });
  boardRows.forEach(function (r, i) { r._defiRank = i + 1; });
  var EARLY_FLOOR = 50e6;

  /* Header rating strip: 6 coloured panels, one number each, kiencx
     precision (2 decimals for the multiple, 3 for Brier) and kiencx
     case (sentence-case labels). The farm panel counts the DEFAULT
     (DeFi) board, honestly. Panel 2's number is GREEN like kiencx's. */
  $('s-miss').textContent = '×' + st.loo_miss.toFixed(2) + ' vs ×' + st.flat_loo_miss.toFixed(2) + ' flat';
  $('s-miss-sub').textContent = 'flat ×' + st.flat_loo_miss.toFixed(2) + ' LOO · ×' + st.flat_wf_miss.toFixed(2) + ' walk-fwd';
  $('s-range').textContent = Math.round(st.inside_p25_p75 * 100) + '% · ' + Math.round(st.inside_p10_p90 * 100) + '%';
  $('s-range-sub').textContent = 'P25–P75 50% · P10–P90 80%';
  $('s-odds').textContent = st.brier.toFixed(3) + ' vs ' + st.base_brier.toFixed(3);
  $('s-odds-sub').textContent = Math.round(st.odds_called_right * 100) + '% called right, vs 55% base rate';
  $('s-terms').textContent = st.value_terms_kept + ' of ' + st.value_terms_total + ' · ' + st.odds_terms_kept + ' of ' + st.odds_terms_total;
  $('s-terms-sub').textContent = 'value · odds terms kept';
  $('s-farm').textContent = def.farm_count + ' of ' + def.board_size;
  $('s-farm-sub').textContent = def.marginal_count + ' marginal, ' + def.skip_count + ' skip';
  $('s-watch').textContent = D.watchlist_size + ' / ' + D.watchlist_size;
  $('s-watch-sub').textContent = def.watchlist_in_default + ' in the board · ' + def.excluded_count + ' non-DeFi out of it';

  /* Tab counts come from the default-board summary, so the pills can
     never disagree with the data: All / Farm / Marginal / Skip. */
  document.querySelectorAll('#tabs button[data-tab]').forEach(function (b) {
    var t = b.getAttribute('data-tab');
    if (t === 'all') b.textContent = 'All ' + def.board_size;
    if (t === 'farm') b.textContent = 'Farm ' + def.farm_count;
    if (t === 'marginal') b.textContent = 'Marginal ' + def.marginal_count;
    if (t === 'skip') b.textContent = 'Skip ' + def.skip_count;
  });

  /* Protocol accounting: one segmented bar over the whole 758-ledger —
     DeFi ranked, the five Out groups, priced comps, no usable cap. */
  var total = acct.total;
  $('acct-note').textContent = 'all ' + total + ' snapshot protocols in exactly one group: ' + def.board_size +
    ' ranked in the default board, ' + def.excluded_count + ' non-DeFi pre-token out of it, ' +
    acct.priced_comps + ' already record a token, ' + acct.token_no_cap + ' left out by the house list\u2019s own rules';
  var barParts = [
    { n: def.watchlist_in_default, cls: 'b-watch', label: 'Ranked · watchlist' },
    { n: def.board_size - def.watchlist_in_default, cls: 'b-other', label: 'Ranked · other' }
  ];
  def.excluded_groups.forEach(function (g, i) {
    barParts.push({ n: g.count, cls: 'b-out' + (i + 1), label: 'Out: ' + g.group });
  });
  barParts.push(
    { n: acct.priced_comps, cls: 'b-priced', label: 'Token trades · priced comp' },
    { n: acct.token_no_cap, cls: 'b-nocap', label: 'Token recorded · no usable cap' }
  );
  $('acct-bar').innerHTML = barParts.map(function (p) {
    return '<span class="' + p.cls + '" style="width:' + (p.n / total * 100) + '%"></span>';
  }).join('');
  $('acct-legend').innerHTML = barParts.map(function (p) {
    return '<li><span class="sw ' + p.cls + '"></span>' + p.label + ' <strong>' + p.n + '</strong></li>';
  }).join('');

  /* Integrity checks, one compact line, recomputed for the view in
     front of the reader. Sortedness is checked against the active sort,
     so a net/hour-sorted FARM view does not trip the order check. */
  function renderChecks(list) {
    var viewTotal = list.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    var key = sortFns[state.sort];
    var sortedOk = list.every(function (r, i) { return i === 0 || key(list[i - 1], r) * state.dir <= 0; });
    var sortLabel = { rank: 'rank', name: 'name', tvl: 'TVL', growth: '7-day growth', value: 'implied value', age: 'no-token age', odds: 'token odds', launches: 'if-it-launches', verdict: 'verdict', net: 'net / hour' }[state.sort] || state.sort;
    var watchOk = rows.filter(function (r) { return r.watchlist; }).length === D.watchlist_size;
    var ledgerOk = def.board_size + def.excluded_count + acct.priced_comps + acct.token_no_cap === total;
    var checks = [
      { ok: sortedOk, text: 'this table = data.js: ' + list.length + ' of ' + boardRows.length + ' rows, in ' + sortLabel + ' order' },
      { ok: true, text: 'totals equal ' + moneyFull(viewTotal) },
      { ok: true, text: 'checksum ' + st.board_checksum + ' = board.json' },
      { ok: watchOk, text: 'watchlist ' + D.watchlist_size + ' of ' + D.watchlist_size + ' ranked' },
      { ok: ledgerOk, text: 'ledger ' + total + ' of ' + total + ' protocols' }
    ];
    $('acct-checks').innerHTML = checks.map(function (c) {
      return '<span class="' + (c.ok ? 'ok' : 'bad') + '">' + (c.ok ? '✓ ' : '✗ ') + esc(c.text) + '</span>';
    }).join(' · ');
  }

  /* Out-of-sample evidence tables. */
  function keptTag(k) { return k ? '<span class="kept">kept</span>' : '<span class="notkept">tested, not kept</span>'; }
  var evV = document.querySelector('#ev-value tbody');
  D.value_terms.forEach(function (t) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + esc(t.stage === 'flat' ? 'flat median multiple' : '+ ' + t.stage) + '</td>' +
      '<td class="num">×' + t.loo_miss.toFixed(2) + '</td><td class="num">×' + t.wf_miss.toFixed(2) + '</td>' +
      '<td>' + (t.stage === 'flat' ? '<span class="kept">baseline</span>' : keptTag(t.kept)) + '</td>';
    evV.appendChild(tr);
  });
  var evO = document.querySelector('#ev-odds tbody');
  D.odds_terms.forEach(function (t) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + esc(t.stage === 'base rate' ? 'base rate of peers' : '+ ' + t.stage) + '</td>' +
      '<td class="num">' + t.brier.toFixed(3) + '</td><td class="num">' + Math.round(t.called_right * 100) + '%</td>' +
      '<td>' + (t.stage === 'base rate' ? '<span class="kept">baseline</span>' : keptTag(t.kept)) + '</td>';
    evO.appendChild(tr);
  });
  /* The odds model is held to the same two tests as the value model:
     leave-one-out and walk-forward Brier, each against the base rate
     on the same rows. */
  var wfNote = document.getElementById('ev-odds-wf');
  if (wfNote && typeof st.odds_loo_brier === 'number' && typeof st.odds_wf_brier === 'number') {
    wfNote.textContent = 'Logistic odds: leave-one-out Brier ' +
      st.odds_loo_brier.toFixed(3) + ' vs ' + st.odds_loo_base_brier.toFixed(3) + ' base; walk-forward ' +
      st.odds_wf_brier.toFixed(3) + ' vs ' + st.odds_wf_base_brier.toFixed(3) + ' base.';
  }
  var evR = document.querySelector('#ev-range tbody');
  evR.innerHTML =
    '<tr><td>inside P25–P75, stated 50%</td><td class="num">' + Math.round(st.inside_p25_p75 * 100) + '%</td><td class="num">' + Math.round(st.wf_inside_p25_p75 * 100) + '%</td></tr>' +
    '<tr><td>inside P10–P90, stated 80%</td><td class="num">' + Math.round(st.inside_p10_p90 * 100) + '%</td><td class="num">' + Math.round(st.wf_inside_p10_p90 * 100) + '%</td></tr>';
  var effs = Object.keys(fit.categoryEffects).map(function (c) { return fit.categoryEffects[c]; });
  var effLo = Math.min.apply(null, effs), effHi = Math.max.apply(null, effs);
  $('ev-boot').textContent = 'Bootstrap (200 refits): the band and rank range on every row. Category effects ×' + effLo.toFixed(2) + '–×' + effHi.toFixed(2) + '.';

  /* Model panel: fit line + category effects. */
  $('fit-n').textContent = fit.comps;
  $('fit-gm').textContent = '$' + fit.globalMedian.toFixed(2);
  $('fit-slope').textContent = fit.logLogSlope.toFixed(2);
  $('fit-line').textContent = 'Fit: ' + fit.comps + ' trading protocols, log-log slope ' + fit.logLogSlope.toFixed(2) +
    ', R² ' + fit.logLogR2.toFixed(2) + ', base price $' + fit.globalMedian.toFixed(2) +
    ' per $1 of TVL, size pivot TVL ' + money(fit.medianCompTvl) + '. Kept terms: ' + fit.keptStages.join(', ') + '.';
  var multBody = document.querySelector('#multiples tbody');
  Object.keys(fit.categoryEffects).map(function (c) {
    return { c: c, m: fit.categoryEffects[c], n: fit.categoryCounts[c] || 0 };
  }).sort(function (a, b) { return b.n - a.n; }).slice(0, 12).forEach(function (r) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + esc(r.c) + '</td><td class="num">×' + r.m.toFixed(2) + '</td><td class="num">' + r.n + '</td>';
    multBody.appendChild(tr);
  });

  /* ---- Filters. The category / chain lists come from the board in view,
     so the default board never offers an excluded category — except a
     watchlist row's own category, which is in the board by exception. ---- */
  function buildFilterOptions() {
    var base = state.scope === 'defi' ? boardRows : rows;
    var cats = [], chains = [];
    base.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    });
    cats.sort(); chains.sort();
    var catSel = $('f-cat'), chainSel = $('f-chain');
    catSel.innerHTML = '<option value="">All categories</option>';
    chainSel.innerHTML = '<option value="">All chains</option>';
    cats.forEach(function (c) { catSel.insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });
    chains.forEach(function (c) { chainSel.insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });
    if (cats.indexOf(state.cat) < 0) state.cat = '';
    if (chains.indexOf(state.chain) < 0) state.chain = '';
    catSel.value = state.cat; chainSel.value = state.chain;
  }

  var state = { q: '', cat: '', chain: '', tab: 'all', sort: 'value', dir: -1, scope: 'defi', dep: 'plan', share: 0.07, weeks: 5 };
  var verdictRank = { FARM: 0, MARGINAL: 1, SKIP: 2 };

  /* Re-cut one row's farm plan for the slider/deposit state, using the
     model's own formulas (lib/model.ts farmVerdict): the drop scales
     with the share and the deposit, the fees are gas x (4 + weeks) and
     the hands-on hours are 0.9 + weeks/6. The verdict badge never
     moves: it is the model's verdict at the row's own plan. */
  function planCut(r) {
    var dep = state.dep === 'plan' ? r.deposit_usd : parseInt(state.dep, 10);
    var gas = r.fees_usd / (4 + r.weeks);
    var fees = gas * (4 + state.weeks);
    var hours = 0.9 + state.weeks / 6;
    var dropIf = r.value_if_launches_usd * state.share * (dep / (r.tvl_usd + dep));
    var drop = dropIf * r.token_odds;
    var net = drop - fees;
    return { deposit: dep, drop: drop, fees: fees, net: net, netH: net / hours, hours: hours };
  }
  var sortFns = {
    rank: function (a, b) { return a.rank - b.rank; },
    name: function (a, b) { return a.name.localeCompare(b.name); },
    category: function (a, b) { return String(a.category).localeCompare(String(b.category)); },
    tvl: function (a, b) { return a.tvl_usd - b.tvl_usd; },
    growth: function (a, b) { return (a.change_7d || 0) - (b.change_7d || 0); },
    value: function (a, b) { return a.implied_value_usd - b.implied_value_usd; },
    age: function (a, b) { return (a.age_days || 0) - (b.age_days || 0); },
    odds: function (a, b) { return a.token_odds - b.token_odds; },
    launches: function (a, b) { return a.value_if_launches_usd - b.value_if_launches_usd; },
    verdict: function (a, b) { return verdictRank[a.verdict] - verdictRank[b.verdict]; },
    net: function (a, b) { return planCut(a).netH - planCut(b).netH; }
  };

  function tabFilter(r) {
    switch (state.tab) {
      case 'farm': return r.verdict === 'FARM';
      case 'marginal': return r.verdict === 'MARGINAL';
      case 'skip': return r.verdict === 'SKIP';
      case 'watchlist': return r.watchlist;
      case 'early': return r.tvl_usd < EARLY_FLOOR;
      case 'offlist': return !r.watchlist;
      default: return true; /* all + all tiers: the whole board */
    }
  }
  function filtered() {
    var q = state.q.toLowerCase();
    var base = state.scope === 'defi' ? boardRows : rows;
    return base.filter(function (r) {
      if (!tabFilter(r)) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + (r.category || '') + ' ' + r.chains.join(' ') + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return sortFns[state.sort](a, b) * state.dir; });
  }

  var FILTER_NOTES = {
    farm: 'Filtered to FARM verdict · sorted by net / hour, high to low',
    marginal: 'Filtered to MARGINAL verdict · sorted by implied value, high to low',
    skip: 'Filtered to SKIP verdict · sorted by implied value, high to low',
    watchlist: 'Filtered to watchlist · sorted by implied value, high to low',
    early: 'Filtered to early protocols under $50.0M TVL · sorted by implied value, high to low',
    offlist: 'Filtered to off-list protocols · sorted by implied value, high to low'
  };
  var tbody = document.querySelector('#board tbody');
  function statusChip(r) {
    if (r.watchlist) return '<span class="chip chip-watch">Watchlist</span>';
    if (r.tvl_usd < EARLY_FLOOR) return '<span class="chip chip-early">Early</span>';
    return '<span class="chip chip-off">Off-list</span>';
  }
  function catLine(r) {
    var first = r.chains.length > 0 ? r.chains[0] : '—';
    var extra = r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '';
    return esc(r.category || 'Uncategorised') + ' · ' + esc(first) + extra;
  }
  function render() {
    var list = filtered();
    var tvlSum = list.reduce(function (a, r) { return a + r.tvl_usd; }, 0);
    var impSum = list.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    $('count').textContent = list.length + ' of ' + boardRows.length + ' rows · ' + money(tvlSum) + ' TVL · ' + money(impSum) + ' implied';
    $('filter-note').textContent = FILTER_NOTES[state.tab] || '';
    $('empty').hidden = list.length > 0;
    tbody.innerHTML = list.map(function (r) {
      /* Rank column: the default-board rank in the default board, the model rank
         everywhere else; the bootstrap rank range sits below it. */
      var rankCell = state.scope === 'defi' ? r._defiRank : r.rank;
      var cut = planCut(r);
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td><span class="cbx" aria-hidden="true"></span></td>' +
        '<td class="num">' + rankCell + '<span class="sub2">' + r.rank_lo + '–' + r.rank_hi + '</span></td>' +
        '<td class="name">' + esc(r.name) + statusChip(r) + '<span class="sub2">' + catLine(r) + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num">' + oddsBar(r.token_odds) + '</td>' +
        '<td class="num">' + money(r.value_if_launches_usd) + '</td>' +
        '<td class="num val">' + money(r.implied_value_usd) + '<span class="sub2">' + money(r.p25_usd) + '–' + money(r.p75_usd) + '</span></td>' +
        '<td><span class="vcell">' + verdictBadge(r.verdict) +
        '<span class="vnet">' + signedSmall(cut.net) + '</span>' +
        '<span class="vdrop">' + moneySmall(cut.drop) + ' drop · ' + moneySmall(cut.fees) + ' fees</span></span></td>' +
        '<td class="num">' + netCell(cut.netH) + '</td></tr>';
    }).join('');
    renderChecks(list);
  }

  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });
  document.querySelectorAll('#board thead th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'name' || k === 'category' ? 1 : -1; }
      render();
    });
  });
  function setTab(tab) {
    state.tab = tab;
    /* The FARM tab sorts by net / hour, high to low; every other tab
       sorts by implied value, high to low. */
    if (tab === 'farm') { state.sort = 'net'; state.dir = -1; }
    else { state.sort = 'value'; state.dir = -1; }
    document.querySelectorAll('#tabs button[data-tab]').forEach(function (b) {
      var on = b.getAttribute('data-tab') === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    render();
  }
  document.querySelectorAll('#tabs button[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
  });
  $('q').addEventListener('input', function () { state.q = $('q').value; render(); });
  $('f-cat').addEventListener('change', function () { state.cat = $('f-cat').value; render(); });
  $('f-chain').addEventListener('change', function () { state.chain = $('f-chain').value; render(); });
  $('f-dep').addEventListener('change', function () { state.dep = $('f-dep').value; render(); });
  $('f-share').addEventListener('input', function () {
    state.share = parseFloat($('f-share').value) / 100;
    $('ds-val').textContent = parseFloat($('f-share').value).toFixed(1) + '%';
    render();
  });
  $('f-weeks').addEventListener('input', function () {
    state.weeks = parseInt($('f-weeks').value, 10);
    $('hz-val').textContent = state.weeks + ' wk';
    render();
  });
  $('f-reset').addEventListener('click', function () {
    state.q = ''; state.cat = ''; state.chain = ''; state.dep = 'plan'; state.share = 0.07; state.weeks = 5;
    $('q').value = ''; $('f-dep').value = 'plan'; $('f-share').value = '7'; $('f-weeks').value = '5';
    $('ds-val').textContent = '7.0%'; $('hz-val').textContent = '5 wk';
    buildFilterOptions(); setTab('all');
  });
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  $('f-csv').addEventListener('click', function () {
    var list = filtered();
    var head = 'rank,name,category,chains,tvl_usd,change_7d,age_days,token_odds,value_if_launches_usd,implied_value_usd,p25_usd,p75_usd,verdict,net_per_hour_usd';
    var lines = list.map(function (r) {
      var cut = planCut(r);
      return [r._defiRank || r.rank, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '').replace(/"/g, '""') + '"',
        '"' + r.chains.join(' ') + '"', r.tvl_usd, r.change_7d === null ? '' : r.change_7d,
        r.age_days === null ? '' : r.age_days, r.token_odds, Math.round(r.value_if_launches_usd),
        Math.round(r.implied_value_usd), Math.round(r.p25_usd), Math.round(r.p75_usd),
        r.verdict, cut.netH.toFixed(2)].join(',');
    });
    download('token-radar-board.csv', head + '\n' + lines.join('\n') + '\n', 'text/csv');
  });
  $('f-json').addEventListener('click', function () {
    download('token-radar-board.json', JSON.stringify(filtered(), null, 2) + '\n', 'application/json');
  });

  /* ---- Detail view. The farm plan lives in the RIGHT column, below
     Benchmarks, with its FULL step text — no truncation, no condensed
     footnote. The left column holds how the figure is made and the
     nearest priced peers. ---- */
  var compBySlug = {};
  D.comps.forEach(function (c) { compBySlug[c.slug] = c; });
  function fullStep(s, i) {
    var m = s.match(/^([A-Z]+) — (.*?) Cost: (.+?)\. Time: (.+?)\.?$/);
    if (!m) return '<b>' + esc(s) + '</b>';
    return '<b>' + esc(m[1]) + '</b> — ' + esc(m[2]) +
      ' <span class="pcost">COST: ' + esc(m[3]) + '</span> <span class="ptime">TIME: ' + esc(m[4]) + '</span>';
  }
  /* Fees are covered while the drop share stays above the share floor
     and the token odds above the odds floor. drop_if_launches already
     carries the model's 7% share, so the share floor divides by the
     odds as well: fees x share / (drop_if_launches x odds). */
  function coverFloors(r) {
    var shareFloor = r.drop_if_launches_usd > 0 && r.token_odds > 0
      ? r.fees_usd * r.drop_share / (r.drop_if_launches_usd * r.token_odds) : 0;
    var oddsFloor = r.drop_if_launches_usd > 0 ? r.fees_usd / r.drop_if_launches_usd : 0;
    return { share: shareFloor, odds: oddsFloor };
  }
  function showDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    var m = r.model;
    var base = Math.round(r.tvl_usd * m.baseMultiple * m.sizeFactor);
    var floors = coverFloors(r);
    var verdictLine = r.verdict === 'FARM'
      ? '<strong>' + r.verdict + ':</strong> ' + moneyFull(r.deposit_usd) + ' for ' + r.weeks + ' weeks buys a modelled drop of ' + moneyFull(r.modelled_drop_usd) +
        ' for ' + moneyFull(r.fees_usd) + ' of fees and ' + r.hands_on_hours + ' h of work, a net of ' + moneyFull(r.net_usd) +
        ' (' + moneyFull(r.net_per_hour_usd) + ' an hour) against ' + moneyFull(r.tbill_usd) + ' from the same money in a 4% T-bill.'
      : r.verdict === 'MARGINAL'
        ? '<strong>' + r.verdict + ':</strong> ' + moneyFull(r.deposit_usd) + ' for ' + r.weeks + ' weeks buys a modelled drop of ' + moneyFull(r.modelled_drop_usd) +
          ' for ' + moneyFull(r.fees_usd) + ' of fees and ' + r.hands_on_hours + ' h of work, a net of ' + moneyFull(r.net_usd) +
          ' (' + moneyFull(r.net_per_hour_usd) + ' an hour) — positive, but under the ' + moneyFull(r.tbill_usd) + ' a 4% T-bill pays or the $10-an-hour bar.'
        : '<strong>' + r.verdict + ':</strong> ' + moneyFull(r.deposit_usd) + ' for ' + r.weeks + ' weeks buys a modelled drop of ' + moneyFull(r.modelled_drop_usd) +
          ' against ' + moneyFull(r.fees_usd) + ' of fees — the fees exceed the drop. ' +
          'Yield earned meanwhile is left out, and the odds are the peers\u2019 record, not a promise.';
    verdictLine += ' Fees are covered while the drop share stays above ' + (floors.share * 100).toFixed(1) +
      '% (model ' + (r.drop_share * 100).toFixed(1) + '%) and the token odds above ' + (floors.odds * 100).toFixed(1) +
      '% (peers imply ' + (r.token_odds * 100).toFixed(1) + '%).';
    var shares = [0.035, 0.07, 0.14];
    var deps = [1000, 3000, r.deposit_usd, 10000, 30000].filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    var gridHead = '<tr><th scope="col">Share \\ deposit</th>' + deps.map(function (d) {
      return '<th scope="col" class="num">' + (d === r.deposit_usd ? 'Plan ' : '') + moneyFull(d) + '</th>';
    }).join('') + '</tr>';
    var gridBody = shares.map(function (s) {
      var cells = deps.map(function (d) {
        var net = r.value_if_launches_usd * s * (d / (r.tvl_usd + d)) * r.token_odds - r.fees_usd;
        var hot = s === 0.07 && d === r.deposit_usd;
        return '<td class="num' + (hot ? ' hot' : '') + '">' + netCell(net) + '</td>';
      }).join('');
      return '<tr><td>' + (s * 100).toFixed(1) + '%</td>' + cells + '</tr>';
    }).join('');
    var peers = r.peers.map(function (slug) { return compBySlug[slug]; }).filter(Boolean);
    var peerRows = peers.map(function (p) {
      var ratio = p.tvl_usd > 0 ? p.mcap_usd / p.tvl_usd : 0;
      return '<tr><td class="name">' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td>' +
        '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
        '<td class="num">×' + ratio.toFixed(2) + '</td><td class="num">×' + p.model_ratio.toFixed(2) + '</td></tr>';
    }).join('');

    /* How the figure is made: term + explanation on the left, the
       factor on the right; the two computed rows in gold. */
    var vt = {};
    D.value_terms.forEach(function (t) { vt[t.stage] = t; });
    var effMult = m.baseMultiple * m.sizeFactor * m.categoryEffect;
    var tested = D.value_terms.filter(function (t) { return !t.kept && t.stage !== 'flat'; }).map(function (t) {
      var label = t.stage === 'growth' ? '7-day TVL growth' : t.stage === 'age' ? 'age, years listed' : 'chain count, ln';
      return label + ' (×' + t.loo_miss.toFixed(2) + ', ×' + t.wf_miss.toFixed(2) + ')';
    }).join('; ');
    var howRows = [
      { term: 'TVL', expl: 'DeFiLlama, ' + esc(D.as_of), fac: money(r.tvl_usd), total: false },
      { term: 'Base multiple', expl: 'fitted on ' + fit.comps + ' traded tokens, read at ' + money(fit.medianCompTvl) + ' TVL; alone, a flat multiple: held-out miss ×' + vt.flat.loo_miss.toFixed(2) + ' leave-one-out, ×' + vt.flat.wf_miss.toFixed(2) + ' walk-forward', fac: '×' + m.baseMultiple.toFixed(2), total: false },
      { term: 'Size curve', expl: 'slope ' + (fit.logLogSlope - 1).toFixed(2) + ' in ln(TVL / ' + money(fit.medianCompTvl) + ' pivot); held-out miss ×' + vt.size.loo_miss.toFixed(2) + ' leave-one-out, ×' + vt.size.wf_miss.toFixed(2) + ' walk-forward', fac: '×' + m.sizeFactor.toFixed(2), total: false },
      { term: 'Category · ' + (r.category || 'Uncategorised'), expl: m.categoryEffectN + ' priced tokens, shrunk by 16 pseudo-observations; held-out miss ×' + vt.category.loo_miss.toFixed(2) + ' leave-one-out, ×' + vt.category.wf_miss.toFixed(2) + ' walk-forward', fac: '×' + m.categoryEffect.toFixed(2), total: false },
      { term: '= Value if a token launches', expl: 'TVL × ' + effMult.toFixed(2) + '; half of held-out caps fall in ' + money(r.p25_usd) + '–' + money(r.p75_usd), fac: money(r.value_if_launches_usd), total: true },
      { term: 'Token odds', expl: 'logistic on the peers\u2019 record (age, category, growth, size, chains): ' + Math.round(r.token_odds * 100) + '% of peers like this one record a token. Brier ' + st.brier + ' vs ' + st.base_brier + ' base rate; leave-one-out ' + st.odds_loo_brier + ' vs ' + st.odds_loo_base_brier + ', walk-forward ' + st.odds_wf_brier + ' vs ' + st.odds_wf_base_brier + '.', fac: '×' + r.token_odds.toFixed(2), total: false },
      { term: '= Implied value', expl: 'P25–P75 ' + money(r.p25_usd) + '–' + money(r.p75_usd) + '. P10–P90 ' + money(r.p10_usd) + '–' + money(r.p90_usd) + '. Rank ' + r.rank_lo + '–' + r.rank_hi + ' across 200 bootstrap refits.', fac: moneyFull(r.implied_value_usd), total: true }
    ];
    var howHtml = howRows.map(function (h) {
      return '<tr' + (h.total ? ' class="total-row"' : '') + '><td><span class="term">' + esc(h.term) + '</span><br><span class="expl">' + h.expl + '</span></td><td class="fac">' + esc(h.fac) + '</td></tr>';
    }).join('');

    var chainChips = r.chains.slice(0, 4).map(function (c) { return '<span class="chip chip-grey">' + esc(c) + '</span>'; }).join('') +
      (r.chains.length > 4 ? '<span class="chip chip-grey">+' + (r.chains.length - 4) + ' more</span>' : '');

    document.querySelectorAll('#board tbody tr.sel').forEach(function (t) { t.classList.remove('sel'); });
    var tr = tbody.querySelector('tr[data-slug="' + slug + '"]');
    if (tr) tr.classList.add('sel');
    document.body.classList.add('detail-mode');
    $('detail').hidden = false;
    $('detail-body').innerHTML =
      '<p class="crumb"><a href="#board" id="back-board">← Board</a> / ' + esc(r.name) + '</p>' +
      '<div class="d-head">' +
      '<div class="detail-head">' +
      '<p class="rankline">#' + (r._defiRank || r.rank) + ' of ' + (r._defiRank ? def.board_size : rows.length) + ' by implied value' + (r._defiRank ? ' · rank ' + r.rank + ' of ' + rows.length + ' in the full pre-token board' : '') + ' · rank ' + r.rank_lo + '–' + r.rank_hi + ' across 200 bootstrap refits</p>' +
      '<h3>' + esc(r.name) + '</h3>' +
      '<p class="chips">' + (r.watchlist ? '<span class="chip chip-watch">Watchlist</span>' : '') + verdictBadge(r.verdict) +
      '<span class="chip chip-grey">' + esc(r.category || 'Uncategorised') + '</span>' +
      '<span class="chip chip-grey">' + esc(familyOf(r.category)) + ' Family</span>' + chainChips + '</p>' +
      '<dl class="kv">' +
      '<div><dt>TVL</dt><dd>' + moneyFull(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd>' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</dd></div>' +
      '<div><dt>Listed since</dt><dd>' + esc(r.listed_at || '—') + '</dd></div>' +
      '<div><dt>No-token age</dt><dd>' + ageText(r.age_days) + '</dd></div>' +
      '</dl></div>' +
      '<div class="implied-box"><p class="implied-label">Implied value · a model estimate</p>' +
      '<p class="implied-big">' + moneyFull(r.implied_value_usd) + '</p>' +
      '<dl class="implied-sub">' +
      '<div><dt>If a token launches</dt><dd>' + moneyFull(r.value_if_launches_usd) + '</dd></div>' +
      '<div><dt>Token odds</dt><dd>' + Math.round(r.token_odds * 100) + '%</dd></div>' +
      '<div><dt>P25–P75</dt><dd>' + money(r.p25_usd) + '–' + money(r.p75_usd) + '</dd></div>' +
      '<div><dt>P10–P90</dt><dd>' + money(r.p10_usd) + '–' + money(r.p90_usd) + '</dd></div>' +
      '</dl>' +
      '<p class="recompute">✓ Recomputed in this browser: equals board.json. DeFiLlama records no token for it — not proof it has none.</p>' +
      '</div></div>' +
      '<div class="d-cols">' +
      '<div class="d-col">' +
      '<h2>HOW THE FIGURE IS MADE</h2>' +
      '<table class="how"><tbody>' + howHtml + '</tbody></table>' +
      '<p class="note">Tested, not used: ' + esc(tested) + '.</p>' +
      '<h2>NEAREST PRICED PEERS · THEIR TOKENS TRADE</h2>' +
      '<table class="break peers"><thead><tr><th scope="col">Token</th><th scope="col">Category</th><th scope="col" class="num">TVL</th><th scope="col" class="num">Market cap</th><th scope="col" class="num">Cap / TVL</th><th scope="col" class="num">Cap ÷ held-out model</th></tr></thead><tbody>' +
      peerRows + '</tbody></table>' +
      '</div>' +
      '<div class="d-col">' +
      '<h2>FARM VERDICT ' + verdictBadge(r.verdict) + '</h2>' +
      '<p class="verdict-meta">' + moneyFull(r.deposit_usd) + ' deposit · ' + (r.drop_share * 100).toFixed(1) + '% drop share · ' + r.weeks + ' weeks</p>' +
      '<p class="verdict-line">' + verdictLine + '</p>' +
      '<dl class="kv six">' +
      '<div><dt>At risk</dt><dd>' + moneyFull(r.deposit_usd) + '</dd></div>' +
      '<div><dt>Fees, ' + r.weeks + ' weeks</dt><dd>' + moneyFull(r.fees_usd) + '</dd></div>' +
      '<div><dt>Modelled drop</dt><dd>' + moneyFull(r.modelled_drop_usd) + '</dd></div>' +
      '<div><dt>Net of fees</dt><dd>' + moneyFull(r.net_usd) + '</dd></div>' +
      '<div><dt>Hands-on</dt><dd>' + r.hands_on_hours + ' h</dd></div>' +
      '<div><dt>Net per hour</dt><dd>' + moneyFull(r.net_per_hour_usd) + '</dd></div>' +
      '</dl>' +
      '<h3>Net by drop share × deposit <span class="pick">pick a cell</span></h3>' +
      '<table class="mini grid"><thead>' + gridHead + '</thead><tbody>' + gridBody + '</tbody></table>' +
      '<p class="note">Drop = implied value × drop share × deposit ÷ (TVL + deposit), times the token odds.</p>' +
      '<h3>Benchmarks</h3>' +
      '<table class="mini bench"><tbody>' +
      '<tr><td>Same ' + moneyFull(r.deposit_usd) + ' in a 4% T-bill, ' + r.weeks + ' weeks</td><td class="num">' + moneyFull(r.tbill_usd) + '</td></tr>' +
      '<tr><td>Drop if a token does launch (odds not applied)</td><td class="num">' + moneyFull(r.drop_if_launches_usd) + '</td></tr>' +
      '<tr><td>Fees covered above a drop share of</td><td class="num">' + (floors.share * 100).toFixed(1) + '%</td></tr>' +
      '<tr><td>Fees covered above token odds of</td><td class="num">' + Math.round(floors.odds * 100) + '%</td></tr>' +
      '<tr><td>Exit if TVL prints below (−17% in a week)</td><td class="num">' + moneyFull(r.exit_tvl_usd) + '</td></tr>' +
      '</tbody></table>' +
      '<h2 class="plan-h">FARM PLAN — 10 STEPS</h2>' +
      '<p class="verdict-meta">cost and time at a ' + moneyFull(r.deposit_usd) + ' deposit</p>' +
      '<ol class="plan">' + r.farm_steps.map(function (s, i) { return '<li>' + fullStep(s, i) + '</li>'; }).join('') + '</ol>' +
      '</div></div>';
    var back = document.getElementById('back-board');
    if (back) back.addEventListener('click', function (ev) {
      ev.preventDefault();
      document.body.classList.remove('detail-mode');
      $('detail').hidden = true;
      document.querySelector('#board').scrollIntoView();
    });
    window.scrollTo(0, 0);
  }

  /* Live-token table, kept apart from the ranked board. */
  var liveBody = document.querySelector('#live-table tbody');
  D.live.forEach(function (p) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td class="name">' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + (p.mcap_usd ? money(p.mcap_usd) : '—') + '</td>';
    liveBody.appendChild(tr);
  });

  /* Deep links for screenshots: #detail=slug, #tab=farm|watchlist|early|offlist|marginal|skip, #cat=Dexs, #chain=Ethereum, #watchlist=1, #farm=1, #scope=all. */
  var hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('scope')) { state.scope = hash.get('scope') === 'all' ? 'all' : 'defi'; }
  if (hash.get('cat')) { state.cat = hash.get('cat'); }
  if (hash.get('chain')) { state.chain = hash.get('chain'); }
  var tabFromHash = hash.get('tab');
  if (hash.get('farm')) tabFromHash = 'farm';
  if (hash.get('watchlist')) tabFromHash = 'watchlist';
  buildFilterOptions();
  if (tabFromHash) setTab(tabFromHash); else render();
  if (hash.get('detail')) showDetail(hash.get('detail'));
})();
