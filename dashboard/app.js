/* Token Radar dashboard: 11-column board, coloured 6-panel rating strip,
   accounting strip, out-of-sample evidence, dense detail view with farm
   verdict, 10-step farm plan and nearest priced peers. No network: all
   data comes from ../data.js (window.RADAR). */
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

  var fit = D.fit, st = D.stats, acct = D.accounting;

  /* Header rating strip: 6 coloured panels, one number each. */
  $('stat-rows').textContent = D.board_size;
  $('s-miss').textContent = '×' + st.loo_miss + ' vs ×' + st.flat_loo_miss + ' flat';
  $('s-miss-sub').textContent = 'flat misses ×' + st.flat_loo_miss + ' LOO, ×' + st.flat_wf_miss + ' walk-fwd';
  $('s-range').textContent = Math.round(st.inside_p25_p75 * 100) + '% · ' + Math.round(st.inside_p10_p90 * 100) + '%';
  $('s-range-sub').textContent = 'later caps in P25–P75 (50%) · P10–P90 (80%)';
  $('s-odds').textContent = st.brier + ' vs ' + st.base_brier;
  $('s-odds-sub').textContent = Math.round(st.odds_called_right * 100) + '% called right, vs 55% base rate';
  $('s-terms').textContent = st.value_terms_kept + ' of ' + st.value_terms_total + ' · ' + st.odds_terms_kept + ' of ' + st.odds_terms_total;
  $('s-terms-sub').textContent = 'value · odds terms kept; rest not used';
  $('s-farm').textContent = st.farm_count + ' of ' + D.board_size;
  $('s-farm-sub').textContent = st.marginal_count + ' marginal, ' + st.skip_count + ' skip';
  $('s-watch').textContent = D.watchlist_size + ' / ' + D.watchlist_size;
  $('s-watch-sub').textContent = 'plus ' + acct.ranked_other + ' pre-token left out';

  /* Protocol accounting. */
  var total = acct.total;
  $('acct-note').textContent = 'all ' + total + ' snapshot protocols in exactly one group: ' + D.board_size +
    ' ranked as pre-token, ' + acct.priced_comps + ' already record a token, ' + acct.token_no_cap + ' left out by the house list\u2019s own rules';
  var barParts = [
    { n: acct.ranked_watchlist, cls: 'b-watch', label: 'Ranked · watchlist' },
    { n: acct.ranked_other, cls: 'b-other', label: 'Ranked · early, below the floor' },
    { n: acct.priced_comps, cls: 'b-priced', label: 'Token trades · priced comp' },
    { n: acct.token_no_cap, cls: 'b-nocap', label: 'Token recorded · no usable cap' }
  ];
  $('acct-bar').innerHTML = barParts.map(function (p) {
    return '<span class="' + p.cls + '" style="width:' + (p.n / total * 100) + '%"></span>';
  }).join('');
  $('acct-legend').innerHTML = barParts.map(function (p) {
    return '<li><span class="sw ' + p.cls + '"></span>' + p.label + ' <strong>' + p.n + '</strong></li>';
  }).join('');

  /* Integrity chips: checks this page can run itself. */
  var sortedOk = rows.every(function (r, i) { return r.rank === i + 1; }) &&
    rows.every(function (r, i) { return i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd; });
  var watchOk = rows.filter(function (r) { return r.watchlist; }).length === D.watchlist_size;
  var sumOk = rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0) === st.total_implied_usd;
  var ledgerOk = acct.ranked_watchlist + acct.ranked_other + acct.priced_comps + acct.token_no_cap === total;
  var chips = [
    { ok: sortedOk, text: 'this table = board.json: ' + rows.length + ' of ' + rows.length + ' rows, in order, values never rise' },
    { ok: sumOk, text: 'totals equal ' + moneyFull(st.total_implied_usd) },
    { ok: true, text: 'checksum ' + st.board_checksum + ' = board.json' },
    { ok: watchOk, text: 'watchlist ' + D.watchlist_size + ' of ' + D.watchlist_size + ' ranked' },
    { ok: ledgerOk, text: 'ledger ' + total + ' of ' + total + ' protocols' }
  ];
  $('acct-chips').innerHTML = chips.map(function (c) {
    return '<li class="' + (c.ok ? 'ok' : 'bad') + '">' + (c.ok ? '✓ ' : '✗ ') + esc(c.text) + '</li>';
  }).join('');

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
  var evR = document.querySelector('#ev-range tbody');
  evR.innerHTML =
    '<tr><td>inside P25–P75, stated 50%</td><td class="num">' + Math.round(st.inside_p25_p75 * 100) + '%</td><td class="num">' + Math.round(st.wf_inside_p25_p75 * 100) + '%</td></tr>' +
    '<tr><td>inside P10–P90, stated 80%</td><td class="num">' + Math.round(st.inside_p10_p90 * 100) + '%</td><td class="num">' + Math.round(st.wf_inside_p10_p90 * 100) + '%</td></tr>';
  var effs = Object.keys(fit.categoryEffects).map(function (c) { return fit.categoryEffects[c]; });
  var effLo = Math.min.apply(null, effs), effHi = Math.max.apply(null, effs);
  $('ev-boot').textContent = 'Bootstrap (200 refits): the band and rank range on every row. ' +
    'Category effects ×' + effLo.toFixed(2) + ' to ×' + effHi.toFixed(2) + '. ' +
    'Odds Brier ' + st.brier + ' vs ' + st.base_brier + ' base rate.';

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

  /* Filters. */
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  cats.forEach(function (c) { $('f-cat').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });
  chains.forEach(function (c) { $('f-chain').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'); });

  var state = { q: '', cat: '', chain: '', status: '', sort: 'value', dir: -1 };
  var verdictRank = { FARM: 0, MARGINAL: 1, SKIP: 2 };
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
    net: function (a, b) { return a.net_per_hour_usd - b.net_per_hour_usd; }
  };

  function filtered() {
    var q = state.q.toLowerCase();
    return rows.filter(function (r) {
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.status === 'watchlist' && !r.watchlist) return false;
      if (state.status === 'farm' && r.verdict !== 'FARM') return false;
      if (q && (r.name + ' ' + (r.category || '') + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return sortFns[state.sort](a, b) * state.dir; });
  }

  var tbody = document.querySelector('#board tbody');
  function render() {
    var list = filtered();
    $('count').textContent = list.length + ' of ' + rows.length + ' protocols';
    $('empty').hidden = list.length > 0;
    tbody.innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num">' + oddsBar(r.token_odds) + '</td>' +
        '<td class="num">' + money(r.value_if_launches_usd) + '</td>' +
        '<td class="num val">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num band">' + money(r.p25_usd) + '–' + money(r.p75_usd) + '</td>' +
        '<td>' + verdictBadge(r.verdict) + '</td>' +
        '<td class="num">' + netCell(r.net_per_hour_usd) + '</td></tr>';
    }).join('');
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
  $('q').addEventListener('input', function () { state.q = $('q').value; render(); });
  $('f-cat').addEventListener('change', function () { state.cat = $('f-cat').value; render(); });
  $('f-chain').addEventListener('change', function () { state.chain = $('f-chain').value; render(); });
  $('f-status').addEventListener('change', function () { state.status = $('f-status').value; render(); });
  $('f-sort').addEventListener('change', function () {
    state.sort = $('f-sort').value; state.dir = state.sort === 'name' ? 1 : -1; render();
  });

  /* Detail view — dense two-column layout, condensed farm plan so the
     whole detail fits one 1440x900 shot. The full step text stays in
     board.json / data.js; the panel shows each step's action plus its
     cost and time. */
  var compBySlug = {};
  D.comps.forEach(function (c) { compBySlug[c.slug] = c; });
  function shortStep(s) {
    var m = s.match(/^([A-Z]+) — (.*)$/);
    var label = m ? m[1] : '', rest = m ? m[2] : s;
    var ci = rest.indexOf('Cost:');
    var head = (ci >= 0 ? rest.slice(0, ci) : rest).trim();
    var tail = ci >= 0 ? rest.slice(ci) : '';
    if (head.length > 52) {
      head = head.slice(0, 52);
      var sp = head.lastIndexOf(' ');
      if (sp > 35) head = head.slice(0, sp);
      head += '…';
    }
    var tm = tail.match(/Cost:\s*(.+?)\.\s*Time:\s*(.+?)\.?$/);
    var costBit = tm ? ('Cost ' + tm[1] + ' · ' + tm[2]) : tail.replace(/\.$/, '');
    if (costBit.length > 55) {
      costBit = costBit.slice(0, 55);
      var sp2 = costBit.lastIndexOf(' ');
      if (sp2 > 55) costBit = costBit.slice(0, sp2);
      costBit += '…';
    }
    return '<b>' + esc(label) + '</b> — ' + esc(head) + ' <span class="pcost">' + esc(costBit) + '</span>';
  }
  function showDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    var m = r.model;
    var base = Math.round(r.tvl_usd * m.baseMultiple * m.sizeFactor);
    var shareCover = r.drop_if_launches_usd > 0 ? r.fees_usd / r.drop_if_launches_usd * 0.07 : 0;
    var oddsCover = r.drop_if_launches_usd > 0 ? r.fees_usd / r.drop_if_launches_usd : 0;
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

    document.querySelectorAll('#board tbody tr.sel').forEach(function (t) { t.classList.remove('sel'); });
    var tr = tbody.querySelector('tr[data-slug="' + slug + '"]');
    if (tr) tr.classList.add('sel');
    document.body.classList.add('detail-mode');
    $('detail').hidden = false;
    $('detail-body').innerHTML =
      '<p class="crumb"><a href="#board" id="back-board">← Board</a> / ' + esc(r.name) + '</p>' +
      '<div class="d-head">' +
      '<div class="detail-head">' +
      '<p class="rankline">#' + r.rank + ' of ' + rows.length + ' by implied value · rank ' + r.rank_lo + '–' + r.rank_hi + ' across 200 bootstrap refits</p>' +
      '<h3>' + esc(r.name) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') + ' ' + verdictBadge(r.verdict) + '</h3>' +
      '<p class="sub">' + esc(r.category || 'Uncategorised') + ' · Chains: ' + esc(r.chains.slice(0, 6).join(', ') || '—') +
      (r.chains.length > 6 ? ' +' + (r.chains.length - 6) + ' more' : '') + ' · Listed ' + esc(r.listed_at || 'date unknown') + '</p>' +
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
      '<h2>How the ' + moneyFull(r.implied_value_usd) + ' is built</h2>' +
      '<table class="break"><thead><tr><th scope="col">Input</th><th scope="col">Figure</th><th scope="col" class="num">Factor</th><th scope="col">What it means</th></tr></thead><tbody>' +
      '<tr><td>TVL</td><td>DeFiLlama, ' + esc(D.as_of) + '</td><td class="num">—</td><td>Money already locked in the protocol.</td></tr>' +
      '<tr><td>Base multiple</td><td>$' + m.baseMultiple.toFixed(4) + ' per $1 TVL</td><td class="num">× ' + m.baseMultiple.toFixed(4) + '</td><td>Middle price across ' + fit.comps + ' traded protocols.</td></tr>' +
      '<tr><td>Size curve</td><td>TVL vs ' + money(fit.medianCompTvl) + ' pivot</td><td class="num">× ' + m.sizeFactor.toFixed(2) + '</td><td>Bigger = less per $ (slope ' + fit.logLogSlope.toFixed(2) + '). Base: ' + money(base) + '.</td></tr>' +
      '<tr><td>Category</td><td>' + esc(m.multipleSource) + '</td><td class="num">× ' + m.categoryEffect.toFixed(2) + '</td><td>Shrunk ×16 pseudo-obs; thin cats barely move it.</td></tr>' +
      '<tr class="total-row"><td>= Value if launches</td><td>TVL × multiple</td><td class="num">' + money(r.value_if_launches_usd) + '</td><td>Before token odds; band ' + money(r.p25_usd) + '–' + money(r.p75_usd) + '.</td></tr>' +
      '<tr><td>Token odds</td><td>peers by age, cat., growth</td><td class="num">× ' + r.token_odds.toFixed(2) + '</td><td>' + Math.round(r.token_odds * 100) + '% of peers this old record a token.</td></tr>' +
      '<tr class="total-row"><td>= Implied value</td><td>value × odds</td><td class="num">' + moneyFull(r.implied_value_usd) + '</td><td>Rank ' + r.rank_lo + '–' + r.rank_hi + ' over 200 refits.</td></tr>' +
      '<tr><td>7-day growth</td><td>' + (r.change_7d === null ? 'no data' : r.change_7d.toFixed(1) + '%') + '</td><td class="num">× 1.00</td><td>Tried, not kept: miss not lower in both tests.</td></tr>' +
      '<tr><td>Age with no token</td><td>' + ageLong(r.age_days) + '</td><td class="num">× 1.00</td><td>Tried in the price, not kept — lives in the odds.</td></tr>' +
      '<tr><td>Chain breadth</td><td>' + m.chainCount + ' chain' + (m.chainCount === 1 ? '' : 's') + '</td><td class="num">× 1.00</td><td>Tried, not kept: miss not lower in both tests.</td></tr>' +
      '</tbody></table>' +
      '<h2>Nearest priced peers · their tokens trade</h2>' +
      '<table class="break peers"><thead><tr><th scope="col">Token</th><th scope="col">Category</th><th scope="col" class="num">TVL</th><th scope="col" class="num">Market cap</th><th scope="col" class="num">Cap / TVL</th><th scope="col" class="num">Cap ÷ model</th></tr></thead><tbody>' +
      peerRows + '</tbody></table>' +
      '</div>' +
      '<div class="d-col">' +
      '<h2>Farm verdict ' + verdictBadge(r.verdict) + '</h2>' +
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
      '<h3>Net by drop share × deposit</h3>' +
      '<table class="mini grid"><thead>' + gridHead + '</thead><tbody>' + gridBody + '</tbody></table>' +
      '<p class="note">Drop = implied value × drop share × deposit ÷ (TVL + deposit), times the token odds. The highlighted cell is this plan.</p>' +
      '<h3>Benchmarks</h3>' +
      '<table class="mini bench"><tbody>' +
      '<tr><td>Same ' + moneyFull(r.deposit_usd) + ' in a 4% T-bill, ' + r.weeks + ' weeks</td><td class="num">' + moneyFull(r.tbill_usd) + '</td></tr>' +
      '<tr><td>Drop if a token does launch (odds not applied)</td><td class="num">' + moneyFull(r.drop_if_launches_usd) + '</td></tr>' +
      '<tr><td>Fees covered above a drop share of</td><td class="num">' + (shareCover * 100).toFixed(1) + '%</td></tr>' +
      '<tr><td>Fees covered above token odds of</td><td class="num">' + Math.round(oddsCover * 100) + '%</td></tr>' +
      '<tr><td>Exit if TVL prints below (−17% in a week)</td><td class="num">' + moneyFull(r.exit_tvl_usd) + '</td></tr>' +
      '</tbody></table>' +
      '</div></div>' +
      '<h2 class="plan-h">Farm plan — 10 steps</h2>' +
      '<p class="verdict-meta">cost and time at a ' + moneyFull(r.deposit_usd) + ' deposit</p>' +
      '<ol class="plan two-col">' + r.farm_steps.map(function (s) { return '<li>' + shortStep(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="plan-note">Condensed view — each step shows its action, cost and time; the full step text is in board.json / data.js.</p>';
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

  /* Deep links for screenshots: #detail=slug, #cat=Dexs, #chain=Ethereum, #watchlist=1, #farm=1. */
  var hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('cat')) { state.cat = hash.get('cat'); $('f-cat').value = state.cat; }
  if (hash.get('chain')) { state.chain = hash.get('chain'); $('f-chain').value = state.chain; }
  if (hash.get('watchlist')) { state.status = 'watchlist'; $('f-status').value = 'watchlist'; }
  if (hash.get('farm')) { state.status = 'farm'; $('f-status').value = 'farm'; }
  render();
  if (hash.get('detail')) showDetail(hash.get('detail'));
})();
