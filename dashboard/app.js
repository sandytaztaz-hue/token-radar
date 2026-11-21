/* Token Radar dashboard: sortable, filterable board + detail view.
   No network: all data comes from ../data.js (window.RADAR). */
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
    if (d >= 365) return (d / 365).toFixed(1) + ' yrs (' + d + ' days)';
    return d + ' days';
  }

  /* Header stats + model panel. */
  $('stat-rows').textContent = D.board_size;
  $('stat-board').textContent = D.board_size;
  $('stat-watch').textContent = D.watchlist_size + ' / ' + D.watchlist_size;
  $('stat-date').textContent = D.as_of;
  $('stat-top').textContent = money(rows[0] ? rows[0].implied_value_usd : 0);
  var fit = D.fit;
  $('fit-n').textContent = fit.comps;
  $('fit-line').textContent = 'Fit: ' + fit.comps + ' trading protocols, log-log slope ' + fit.logLogSlope.toFixed(2) +
    ', R² ' + fit.logLogR2.toFixed(2) + ', global middle price $' + fit.globalMedian.toFixed(2) +
    ' per $1 of TVL, size pivot TVL ' + money(fit.medianCompTvl) + '.';
  var multBody = document.querySelector('#multiples tbody');
  Object.keys(fit.categoryMedians).map(function (c) {
    return { c: c, m: fit.categoryMedians[c], n: fit.categoryCounts[c] || 0 };
  }).sort(function (a, b) { return b.n - a.n; }).slice(0, 10).forEach(function (r) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + esc(r.c) + '</td><td class="num">$' + r.m.toFixed(2) + '</td><td class="num">' + r.n + '</td>';
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
  var sortFns = {
    rank: function (a, b) { return a.rank - b.rank; },
    name: function (a, b) { return a.name.localeCompare(b.name); },
    category: function (a, b) { return String(a.category).localeCompare(String(b.category)); },
    tvl: function (a, b) { return a.tvl_usd - b.tvl_usd; },
    growth: function (a, b) { return (a.change_7d || 0) - (b.change_7d || 0); },
    value: function (a, b) { return a.implied_value_usd - b.implied_value_usd; },
    age: function (a, b) { return (a.age_days || 0) - (b.age_days || 0); }
  };

  function filtered() {
    var q = state.q.toLowerCase();
    return rows.filter(function (r) {
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.status === 'watchlist' && !r.watchlist) return false;
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
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num val">' + money(r.implied_value_usd) + '</td>' +
        '<td><span class="tag">Pre-token</span></td></tr>';
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

  /* Detail view: every number behind the estimate + the farm plan. */
  function showDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    var m = r.model;
    var step = r.tvl_usd * m.categoryMultiple;
    document.querySelectorAll('#board tbody tr.sel').forEach(function (t) { t.classList.remove('sel'); });
    var tr = tbody.querySelector('tr[data-slug="' + slug + '"]');
    if (tr) tr.classList.add('sel');
    $('detail').hidden = false;
    $('detail-body').innerHTML =
      '<h3>' + esc(r.name) + (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</h3>' +
      '<p class="sub">Rank #' + r.rank + ' of ' + rows.length + ' · ' + esc(r.category || 'Uncategorised') +
      ' · Chains: ' + esc(r.chains.slice(0, 6).join(', ') || '—') + (r.chains.length > 6 ? ' +' + (r.chains.length - 6) + ' more' : '') +
      ' · Listed ' + esc(r.listed_at || 'date unknown') + '</p>' +
      '<dl class="kv">' +
      '<div><dt>Implied value</dt><dd>' + moneyFull(r.implied_value_usd) + '</dd></div>' +
      '<div><dt>TVL</dt><dd>' + moneyFull(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day growth</dt><dd>' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</dd></div>' +
      '<div><dt>Age with no token</dt><dd>' + ageText(r.age_days) + '</dd></div>' +
      '<div><dt>Farm plan cost</dt><dd>~' + moneyFull(r.plan_cost_usd) + '</dd></div>' +
      '</dl>' +
      '<h2>How the ' + moneyFull(r.implied_value_usd) + ' is built</h2>' +
      '<table class="break"><thead><tr><th scope="col">Input</th><th scope="col">Figure</th><th scope="col" class="num">Factor</th><th scope="col">What it means</th></tr></thead><tbody>' +
      '<tr><td>TVL</td><td>' + moneyFull(r.tvl_usd) + '</td><td class="num">—</td><td>The money already locked in the protocol.</td></tr>' +
      '<tr><td>Category price (' + esc(m.multipleSource) + ')</td><td>$' + m.categoryMultiple.toFixed(4) + ' per $1 TVL</td><td class="num">× ' + m.categoryMultiple.toFixed(4) + '</td><td>Base value: ' + money(step) + '.</td></tr>' +
      '<tr><td>Size factor</td><td>TVL vs ' + money(fit.medianCompTvl) + ' pivot</td><td class="num">× ' + m.sizeFactor.toFixed(2) + '</td><td>Bigger protocols earn less per dollar (slope ' + fit.logLogSlope.toFixed(2) + ').</td></tr>' +
      '<tr><td>7-day growth</td><td>' + (r.change_7d === null ? 'no data' : r.change_7d.toFixed(1) + '%') + '</td><td class="num">× ' + m.growthMultiplier.toFixed(2) + '</td><td>Growth counts, but the log keeps a wild week in check.</td></tr>' +
      '<tr><td>Age with no token</td><td>' + ageText(r.age_days) + '</td><td class="num">× ' + m.ageMultiplier.toFixed(2) + '</td><td>Longer without a token, more pent-up value, capped at 3 years.</td></tr>' +
      '<tr><td>Chain breadth</td><td>' + m.chainCount + ' chain' + (m.chainCount === 1 ? '' : 's') + '</td><td class="num">× ' + m.chainMultiplier.toFixed(2) + '</td><td>More chains, wider distribution.</td></tr>' +
      '</tbody></table>' +
      '<h2>Farm plan — about ' + moneyFull(r.plan_cost_usd) + ' all-in</h2>' +
      '<ol class="plan">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    $('detail').scrollIntoView({ block: 'start' });
  }

  /* Live-token table, kept apart from the ranked board. */
  var liveBody = document.querySelector('#live-table tbody');
  D.live.forEach(function (p) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td class="name">' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + (p.mcap_usd ? money(p.mcap_usd) : '—') + '</td>';
    liveBody.appendChild(tr);
  });

  /* Deep links for screenshots: #detail=slug, #cat=Dexs, #chain=Ethereum, #watchlist=1. */
  var hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('cat')) { state.cat = hash.get('cat'); $('f-cat').value = state.cat; }
  if (hash.get('chain')) { state.chain = hash.get('chain'); $('f-chain').value = state.chain; }
  if (hash.get('watchlist')) { state.status = 'watchlist'; $('f-status').value = 'watchlist'; }
  render();
  if (hash.get('detail')) showDetail(hash.get('detail'));
})();
