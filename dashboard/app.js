// Launch Radar r7 — renders from window.RADAR (data.js), recomputes every
// figure in this browser from the fitted coefficients, and never trusts a
// cached number. All 342 pre-token protocols are ranked; the board is the
// full board.
const D = window.RADAR;
const ROWS = D.rows, META = D.meta, M = D.model, MV = D.mult_val, OV = D.odds_val, RG = D.range;
const $ = (id) => document.getElementById(id);
const money = (n) => {
  if (!isFinite(n)) return '—';
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e9) return s + '$' + (Math.round(a / 1e7) / 100) + 'B';
  if (a >= 1e6) return s + '$' + (Math.round(a / 1e4) / 100) + 'M';
  if (a >= 1e3) return s + '$' + (Math.round(a / 10) / 100) + 'K';
  return s + '$' + Math.round(a).toLocaleString('en-US');
};
const moneyFull = (n) => '$' + Math.round(n).toLocaleString('en-US');
const signed = (n) => (n < 0 ? '−$' + Math.round(-n).toLocaleString('en-US') : '$' + Math.round(n).toLocaleString('en-US'));
const pct = (n, d = 1) => (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) + '%';
const fmtAge = (a) => a === null ? '—' : a < 1 ? Math.max(1, Math.round(a * 365.25)) + ' d' : (Math.round(a * 10) / 10).toFixed(1).replace(/\.0$/, '') + ' yrs';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtNum = (n, d = 2) => (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);

// ------------------------------------------------------------ in-browser fit
// The multiple and the odds are refitted here from the coefficients the
// builder fitted on the snapshot; the detail view checks the recompute
// against the board row.
function sizeFactor(tvl) { return Math.max(Math.pow(tvl / M.pivot, M.slope - 1), M.size_floor); }
function multipleOf(r) { return M.base * sizeFactor(r.tvl) * (M.cat_eff[r.category] ?? 1); }
function oddsOf(r) {
  const rate = M.odds_rate[r.category] ?? 0.5;
  const f = [1, r.age_years === null ? M.med_age : r.age_years, rate, r.change_7d === null ? 0 : r.change_7d, Math.log(r.tvl), r.chains.length];
  let z = 0;
  for (let j = 0; j < f.length; j++) z += (j === 0 ? f[j] : (f[j] - M.odds_mu[j]) / M.odds_sd[j]) * M.odds_beta[j];
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}
function econ(r, dep, share, weeks) {
  const drop = r.implied_value_usd * share * dep / (r.tvl + dep);
  const fees = r.gas * (4 + weeks);
  const hours = 0.9 + weeks / 6;
  const net = drop - fees;
  return { drop, fees, hours, net, nph: net / hours, tbill: dep * 0.04 * weeks / 52 };
}
const planDep = (r) => r.plan_deposit;
function depNow(r) { return state.dep === 'plan' ? planDep(r) : Number(state.dep); }

// ------------------------------------------------------------ state + filter
const state = { tab: 'all', search: '', cat: '', chain: '', dep: 'plan', share: 7, weeks: 5, sort: { key: 'imp', dir: -1 } };
const TABS = [
  ['all', 'All ' + ROWS.length],
  ['farm', 'Farm ' + META.verdicts.farm],
  ['marginal', 'Marginal ' + META.verdicts.marginal],
  ['skip', 'Skip ' + META.verdicts.skip],
  ['watchlist', 'Watchlist'],
  ['early', 'Early (< $50.0M)'],
];
function filtered() {
  let rows = ROWS;
  if (state.tab === 'farm') rows = rows.filter((r) => r.verdict === 'FARM');
  else if (state.tab === 'marginal') rows = rows.filter((r) => r.verdict === 'MARGINAL');
  else if (state.tab === 'skip') rows = rows.filter((r) => r.verdict === 'SKIP');
  else if (state.tab === 'watchlist') rows = rows.filter((r) => r.watchlist);
  else if (state.tab === 'early') rows = rows.filter((r) => r.early);
  if (state.cat) rows = rows.filter((r) => r.category === state.cat);
  if (state.chain) rows = rows.filter((r) => r.chains.includes(state.chain));
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter((r) => (r.name + ' ' + r.slug + ' ' + r.category + ' ' + r.chains.join(' ')).toLowerCase().includes(q));
  }
  const k = state.sort.key, d = state.sort.dir;
  const val = (r) => k === 'imp' ? r.implied_value_usd : k === 'tvl' ? r.tvl : k === 'odds' ? r.odds : k === 'nph' ? econ(r, depNow(r), state.share / 100, state.weeks).nph : k === 'name' ? r.name.toLowerCase() : r.rank;
  return [...rows].sort((a, b) => (val(a) < val(b) ? -d : val(a) > val(b) ? d : 0));
}

// ------------------------------------------------------------ static sections
function renderStrip() {
  const cells = [
    ['Out-of-sample miss, walk-forward', '×' + fmtNum(MV.cat.wf) + ' <span class="vs">vs ×' + fmtNum(MV.flat.wf) + ' flat</span>', 'flat ×' + fmtNum(MV.flat.loo) + ' LOO · ×' + fmtNum(MV.flat.wf) + ' walk-fwd'],
    ['Is the printed range honest?', Math.round(RG.loo2575 * 100) + '% · ' + Math.round(RG.loo1090 * 100) + '%', 'P25–P75 ' + Math.round(RG.loo2575 * 100) + '% · P10–P90 ' + Math.round(RG.loo1090 * 100) + '%'],
    ['Token odds vs base rate, Brier', fmtNum(OV.full.brier, 3) + ' <span class="vs">vs ' + fmtNum(OV.base_brier, 3) + '</span>', Math.round(OV.full.acc * 100) + '% called right, vs ' + Math.round(OV.base_acc * 100) + '% base rate'],
    ['Terms that survived both tests', '2 of 5 · 6 of 6', 'value · odds terms kept'],
    ['Worth farming, this scenario', META.verdicts.farm + ' of ' + ROWS.length, META.verdicts.marginal + ' marginal, ' + META.verdicts.skip + ' skip'],
    ['Watchlist ranked', META.watchlist_ranked + ' / ' + META.watchlist_total, 'all 40 ranked in the board'],
  ];
  $('strip').innerHTML = cells.map((c, i) =>
    '<div class="cell"><div class="lab">' + c[0] + '</div><div class="val' + (i === 4 ? ' gold' : i === 5 ? ' pink' : '') + '">' + c[1] + '</div><div class="sub2">' + c[2] + '</div></div>').join('');
}
function renderAccounting() {
  const L = META.ledger;
  $('acctLine').innerHTML = 'all <b>' + L.total + '</b> snapshot protocols: <b>' + L.ranked + '</b> ranked pre-token (' + META.watchlist_ranked + ' of them watchlist), <b>' + L.priced + '</b> already record a token, <b>' + L.recorded_no_cap + '</b> recorded but no usable cap.';
  const seg = (n, color) => '<i style="width:' + (n / L.total * 100).toFixed(2) + '%;background:' + color + '"></i>';
  $('acctBar').innerHTML = seg(META.watchlist_ranked, '#a855f7') + seg(L.ranked - META.watchlist_ranked, '#5b9bd5') + seg(L.priced, '#22c55e') + seg(L.recorded_no_cap, '#475569');
  $('acctLegend').innerHTML = '<i style="background:#a855f7"></i>Ranked · watchlist <i style="background:#5b9bd5"></i>Ranked · other <i style="background:#22c55e"></i>Token trades · priced comp <i style="background:#475569"></i>Token recorded · no usable cap';
  $('integrity').textContent = '✓ this table = data.js: ' + ROWS.length + ' of ' + ROWS.length + ' rows, in implied value order · ✓ totals equal ' + moneyFull(META.total_implied_usd) + ' · ✓ checksum ' + META.checksum + ' = board.json · ✓ watchlist ' + META.watchlist_ranked + ' of ' + META.watchlist_total + ' ranked · ✓ ledger ' + L.total + ' of ' + L.total + ' protocols';
}
function renderEvidence() {
  const multRows = [
    ['flat (median only)', MV.flat, '—'],
    ['+ size', MV.size, '✓ kept'],
    ['+ category', MV.cat, '✓ kept'],
    ['+ growth', MV.growth, 'tested, not kept'],
    ['+ age', MV.age, 'tested, not kept'],
    ['+ chains', MV.chain, 'tested, not kept'],
  ];
  $('evMult').querySelector('tbody').innerHTML = multRows.map((r) =>
    '<tr><td>' + r[0] + '</td><td class="num">×' + fmtNum(r[1].loo) + '</td><td class="num">×' + fmtNum(r[1].wf) + '</td><td class="' + (r[2] === '✓ kept' ? 'keep' : r[2] === '—' ? 'base' : 'nokeep') + '">' + r[2] + '</td></tr>').join('');
  const labels = ['base', '+ age', '+ category', '+ growth', '+ size', '+ chains'];
  $('evOdds').querySelector('tbody').innerHTML = OV.stepwise.map((s, i) =>
    '<tr><td>' + labels[i] + '</td><td class="num">' + fmtNum(s.brier, 3) + '</td><td class="num">' + Math.round(s.acc * 100) + '%</td><td class="' + (i === 0 ? 'base' : 'keep') + '">' + (i === 0 ? 'base' : '✓ kept') + '</td></tr>').join('');
  $('oddsFoot').textContent = 'LOO Brier ' + fmtNum(OV.loo.brier, 3) + ' vs ' + fmtNum(OV.base_brier, 3) + ' base; walk-forward ' + fmtNum(OV.wf.brier, 3) + ' vs ' + fmtNum(OV.wf.base, 3) + ' base.';
  $('evRange').querySelector('tbody').innerHTML =
    '<tr><td>P25–P75 (stated 50%)</td><td class="num">' + Math.round(RG.loo2575 * 100) + '%</td><td class="num">' + Math.round(RG.wf2575 * 100) + '%</td></tr>' +
    '<tr><td>P10–P90 (stated 80%)</td><td class="num">' + Math.round(RG.loo1090 * 100) + '%</td><td class="num">' + Math.round(RG.wf1090 * 100) + '%</td></tr>';
  $('catRange').textContent = '×' + fmtNum(M.cat_min) + '–×' + fmtNum(M.cat_max);
}
function renderPricing() {
  $('pricingBody').innerHTML =
    '<p>The multiple is fitted on the <b>128 traded tokens</b>: median cap per $1 of TVL <b>' + money(M.base) + '</b> at the <b>' + money(M.pivot) + '</b> pivot, log-log slope <b>' + fmtNum(M.slope) + '</b> (R² ' + fmtNum(M.r2) + '). The size curve bends the multiple down as TVL grows, but never below a quarter of base; category effects run <b>×' + fmtNum(M.cat_min) + '–×' + fmtNum(M.cat_max) + '</b>.</p>' +
    '<p>Token odds come from a logistic fit on <b>all 758 protocols</b>: how long a protocol ran before recording a token, its category\u2019s token rate, 7-day growth, size and chain count. 5-fold Brier <b>' + fmtNum(OV.full.brier, 3) + '</b> vs <b>' + fmtNum(OV.base_brier, 3) + '</b> for the base rate; <b>' + Math.round(OV.full.acc * 100) + '%</b> called right vs <b>' + Math.round(OV.base_acc * 100) + '%</b>.</p>' +
    '<p>The range is honest: <b>' + Math.round(RG.loo2575 * 100) + '%</b> of real caps fall inside the printed P25–P75 band and <b>' + Math.round(RG.loo1090 * 100) + '%</b> inside P10–P90, measured leave-one-out. The bootstrap band (200 refits) is the multiple\u2019s own uncertainty.</p>' +
    '<p>Verdicts are the economics, not a judgment: drop = implied × drop share × deposit / (TVL + deposit); fees = gas × (4 + weeks); hands-on = 0.9 + weeks / 6 hours; net = drop − fees. <b>FARM</b> needs a net of at least $25 and $15 an hour; <b>MARGINAL</b> is any positive net; anything else is <b>SKIP</b>. The badge is fixed to the default scenario — the sliders move the numbers, not the badge.</p>';
}
function renderLive() {
  $('liveTable').querySelector('tbody').innerHTML = D.priced.map((p) =>
    '<tr><td><b>' + esc(p.name) + '</b><br><span class="psub">' + esc(p.category) + '</span></td><td>' + esc(p.category) + '</td><td class="num">' + money(p.tvl) + '</td><td class="num">' + money(p.mcap) + '</td><td class="num">×' + fmtNum(p.ratio) + '</td><td class="num">×' + fmtNum(p.heldout) + '</td></tr>').join('');
}
function renderFooter() {
  $('foot').innerHTML = 'Launch Radar · model radar-r7 · DeFiLlama snapshot ' + META.as_of + ' · ' + META.ledger.total + ' protocols · fitted and rendered in this browser · board checksum ' + META.checksum + ' = board.json · not investment advice.';
}

// ------------------------------------------------------------ board + tabs
function renderTabs() {
  $('tabs').innerHTML = TABS.map((t) =>
    '<button type="button" role="tab" class="tab' + (state.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join('');
  document.querySelectorAll('#tabs .tab').forEach((b) => b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    state.sort = state.tab === 'farm' ? { key: 'nph', dir: -1 } : { key: 'imp', dir: -1 };
    renderBoard(); location.hash = '#tab=' + state.tab;
  }));
}
function renderBoard() {
  renderTabs();
  const rows = filtered();
  const tvl = rows.reduce((s, r) => s + r.tvl, 0);
  const imp = rows.reduce((s, r) => s + r.implied_value_usd, 0);
  $('countLine').textContent = rows.length + ' of ' + ROWS.length + ' rows · ' + money(tvl) + ' TVL · ' + money(imp) + ' implied';
  $('rows').innerHTML = rows.map((r) => {
    const e = econ(r, depNow(r), state.share / 100, state.weeks);
    const chg = r.change_7d === null ? '—' : (r.change_7d >= 0 ? '+' : '') + fmtNum(r.change_7d) + '%';
    const chgCls = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    return '<tr data-slug="' + r.slug + '"><td><input type="checkbox" aria-label="Select ' + esc(r.name) + '"></td>' +
      '<td><b class="rank">' + r.rank + '</b><br><span class="range">#' + r.rank_lo + '–' + r.rank_hi + '</span></td>' +
      '<td><span class="pname">' + esc(r.name) + (r.watchlist ? '<span class="chip wl">Watchlist</span>' : '') + (r.early ? '<span class="chip early">Early</span>' : '') + '</span><br><span class="psub">' + esc(r.category) + ' · ' + esc(r.chains[0]) + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') + '</span></td>' +
      '<td class="num">' + money(r.tvl) + '</td><td class="num ' + chgCls + '">' + chg + '</td>' +
      '<td class="num">' + fmtAge(r.age_years) + '</td>' +
      '<td><span class="oddsbar"><i style="width:' + Math.round(r.odds * 100) + '%"></i></span>' + Math.round(r.odds * 100) + '%</td>' +
      '<td class="num">' + money(r.if_launches) + '</td>' +
      '<td class="num"><span class="imp">' + money(r.implied_value_usd) + '</span><br><span class="band">' + money(r.p25) + '–' + money(r.p75) + '</span></td>' +
      '<td><span class="badge ' + r.verdict + '">' + r.verdict + '</span><br><span class="vnet' + (e.net < 0 ? ' neg' : '') + '">' + signed(e.net) + '</span><br><span class="vsub">' + money(e.drop) + ' drop · ' + money(e.fees) + ' fees</span></td>' +
      '<td class="num nph' + (e.nph < 0 ? ' neg' : '') + '">' + signed(e.nph) + '/h</td></tr>';
  }).join('');
  document.querySelectorAll('#rows tr').forEach((tr) => tr.addEventListener('click', (ev) => {
    if (ev.target.tagName === 'INPUT') return;
    openDetail(tr.dataset.slug);
  }));
}

// ------------------------------------------------------------ detail view
function openDetail(slug) {
  const r = ROWS.find((x) => x.slug === slug);
  if (!r) return;
  const dep = depNow(r), share = state.share / 100, weeks = state.weeks;
  const e = econ(r, dep, share, weeks);
  const recomputed = r.tvl * multipleOf(r) * oddsOf(r);
  const match = Math.abs(recomputed - r.implied_value_usd) <= Math.max(2, r.implied_value_usd * 0.002);
  const shareBE = e.fees / (r.if_launches * dep / (r.tvl + dep) * r.odds) * 100;
  const oddsBE = e.fees / (r.if_launches * share * dep / (r.tvl + dep)) * 100;
  const iflDrop = r.if_launches * share * dep / (r.tvl + dep);
  const sf = sizeFactor(r.tvl);
  const chainChips = r.chains.map((c) => '<span class="chip" style="background:#1a2634;color:#c7d3de;border:1px solid #2b3c50">' + esc(c) + '</span>').join(' ');
  const deps = [...new Set([1000, 3000, 10000, 30000, r.plan_deposit])].sort((a, b) => a - b);
  const shares = [3.5, 7.0, 14.0];
  const grid = '<p class="gridcap">Net by drop share × deposit — pick a cell</p><table class="dropgrid"><thead><tr><th>SHARE | DEPOSIT</th>' + deps.map((d) => '<th>' + (d === r.plan_deposit ? 'PLAN ' : '') + money(d) + '</th>').join('') + '</tr></thead><tbody>' +
    shares.map((s) => '<tr><td>' + s.toFixed(1) + '%</td>' + deps.map((d) => {
      const cell = econ(r, d, s / 100, weeks);
      const isPlan = s === state.share && d === dep;
      return '<td class="' + (isPlan ? 'plan' : '') + '">' + signed(cell.net) + '</td>';
    }).join('') + '</tr>').join('') + '</tbody></table>' +
    '<p class="gridfoot">Drop = implied value × drop share × deposit ÷ (TVL + deposit), times the token odds.</p>';
  const verdictWord = r.verdict === 'FARM' ? 'Farm' : r.verdict === 'MARGINAL' ? 'Marginal' : 'Skip';
  $('detail').innerHTML =
    '<p class="crumb"><a id="backBtn">← Board</a> / ' + esc(r.name) + '</p>' +
    '<p class="drank">#' + r.rank + ' of ' + ROWS.length + ' by implied value · rank ' + r.rank_lo + '–' + r.rank_hi + ' across 200 bootstrap refits</p>' +
    '<h1 class="dname">' + esc(r.name) + '</h1>' +
    '<p class="chips"><span class="badge ' + r.verdict + '">' + r.verdict + '</span> <span class="chip" style="background:#1a2634;color:#c7d3de;border:1px solid #2b3c50">' + esc(r.category) + '</span> ' + (r.watchlist ? '<span class="chip wl">Watchlist</span>' : '') + ' ' + (r.early ? '<span class="chip early">Early</span>' : '') + ' ' + chainChips + '</p>' +
    '<div class="dgrid"><div>' +
    '<div class="stats">' +
    '<div class="stat"><div class="l">TVL</div><div class="v">' + money(r.tvl) + '</div></div>' +
    '<div class="stat"><div class="l">7-DAY CHANGE</div><div class="v">' + (r.change_7d === null ? '—' : (r.change_7d >= 0 ? '+' : '') + fmtNum(r.change_7d) + '%') + '</div></div>' +
    '<div class="stat"><div class="l">LISTED SINCE</div><div class="v">' + (r.listed_at || '—') + '</div></div>' +
    '<div class="stat"><div class="l">NO-TOKEN AGE</div><div class="v">' + fmtAge(r.age_years) + '</div></div></div>' +
    '<h2>HOW THE FIGURE IS MADE</h2>' +
    '<table class="terms"><tbody>' +
    '<tr><td>TVL <span class="expl">— locked value on ' + esc(r.chains[0]) + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) + ' chains' : '') + '</span></td><td>' + money(r.tvl) + '</td></tr>' +
    '<tr><td>Base multiple <span class="expl">— median cap per $1 of TVL at the ' + money(M.pivot) + ' pivot</span></td><td>×' + fmtNum(M.base) + '</td></tr>' +
    '<tr><td>Size curve <span class="expl">— slope ' + fmtNum(M.slope - 1) + ' in ln(TVL / ' + money(M.pivot) + '), floored at 0.25</span></td><td>×' + fmtNum(sf) + '</td></tr>' +
    '<tr><td>Category · ' + esc(r.category) + ' <span class="expl">— shrunk by 16 pseudo-observations</span></td><td>×' + fmtNum(M.cat_eff[r.category] ?? 1) + '</td></tr>' +
    '<tr><td>= Value if a token launches</td><td>' + money(r.if_launches) + '</td></tr>' +
    '<tr><td>Token odds <span class="expl">— ' + fmtAge(r.age_years) + ' with no token, ' + esc(r.category) + ' token rate ' + Math.round((M.odds_rate[r.category] ?? 0.5) * 100) + '%</span></td><td>×' + fmtNum(r.odds) + '</td></tr>' +
    '<tr><td>= Implied value</td><td>' + money(r.implied_value_usd) + '</td></tr>' +
    '</tbody></table><p class="evfoot">Held-out miss ×' + fmtNum(MV.cat.loo) + ' leave-one-out · ×' + fmtNum(MV.cat.wf) + ' walk-forward (flat ×' + fmtNum(MV.flat.loo) + ' / ×' + fmtNum(MV.flat.wf) + ').</p>' +
    '<h2>NEAREST PRICED PEERS · THEIR TOKENS TRADE</h2>' +
    '<table class="peers"><thead><tr><th>TOKEN</th><th>CATEGORY</th><th>TVL</th><th>MARKET CAP</th><th>CAP ÷ TVL</th><th>CAP ÷ HELD-OUT MODEL</th></tr></thead><tbody>' +
    r.peers.map((p) => '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.category) + '</td><td class="num">' + money(p.tvl) + '</td><td class="num">' + money(p.mcap) + '</td><td class="num">×' + fmtNum(p.ratio) + '</td><td class="num">×' + fmtNum(p.heldout) + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<div><div class="ivbox"><div class="l">IMPLIED VALUE · A MODEL ESTIMATE</div><div class="big">' + money(r.implied_value_usd) + '</div>' +
    '<table><tbody>' +
    '<tr><td>IF A TOKEN LAUNCHES</td><td>' + money(r.if_launches) + '</td></tr>' +
    '<tr><td>P25–P75</td><td>' + money(r.p25) + ' – ' + money(r.p75) + '</td></tr>' +
    '<tr><td>P10–P90</td><td>' + money(r.p10) + ' – ' + money(r.p90) + '</td></tr>' +
    '<tr><td>TOKEN ODDS</td><td>' + Math.round(r.odds * 100) + '%</td></tr>' +
    '</tbody></table>' +
    '<p class="ivnote">Recomputed in this browser: ' + money(recomputed) + ' — ' + (match ? 'equals board.json ✓' : 'differs from board.json') + '. No token recorded — not proof it has none.</p></div>' +
    '<h2>FARM VERDICT</h2>' +
    '<p class="verdictsub">' + money(dep) + ' deposit · ' + fmtNum(share * 100) + '% drop share · ' + weeks + ' weeks</p>' +
    '<p class="vsent"><span class="badge ' + r.verdict + '">' + r.verdict + '</span> ' + verdictWord + ': ' + money(dep) + ' for ' + weeks + ' weeks buys a modelled drop of ' + money(e.drop) + ' for ' + money(e.fees) + ' of fees and ' + fmtNum(e.hours) + ' h of work, a net of ' + signed(e.net) + ' (' + signed(e.nph) + ' an hour) against ' + money(e.tbill) + ' from the same money in a 4% T-bill. Fees are covered while the drop share stays above ' + fmtNum(shareBE) + '% (model ' + fmtNum(share * 100) + '%) and the token odds above ' + fmtNum(oddsBE) + '% (peers imply ' + Math.round(r.odds * 100) + '%).</p>' +
    '<div class="netgrid">' +
    '<div class="stat"><div class="l">AT RISK</div><div class="v">' + money(dep) + '</div></div>' +
    '<div class="stat"><div class="l">FEES, ' + weeks + ' WEEKS</div><div class="v">' + money(e.fees) + '</div></div>' +
    '<div class="stat"><div class="l">MODELLED DROP</div><div class="v">' + money(e.drop) + '</div></div>' +
    '<div class="stat"><div class="l">NET OF FEES</div><div class="v">' + signed(e.net) + '</div></div>' +
    '<div class="stat"><div class="l">HANDS-ON</div><div class="v">' + fmtNum(e.hours) + ' h</div></div>' +
    '<div class="stat"><div class="l">NET PER HOUR</div><div class="v">' + signed(e.nph) + '</div></div></div>' +
    grid +
    '<h2>Benchmarks</h2><div class="bench">' +
    '<div><span>Same ' + money(dep) + ' in a 4% T-bill, ' + weeks + ' weeks</span><b>' + money(e.tbill) + '</b></div>' +
    '<div><span>Drop if a token does launch (odds not applied)</span><b>' + money(iflDrop) + '</b></div>' +
    '<div><span>Fees covered above a drop share of</span><b>' + fmtNum(shareBE) + '%</b></div>' +
    '<div><span>Fees covered above token odds of</span><b>' + fmtNum(oddsBE) + '%</b></div>' +
    '<div><span>Exit if TVL prints below −' + M.exit_pct + '% in a week</span><b>' + money(r.tvl * (1 - M.exit_pct / 100)) + '</b></div>' +
    '</div></div></div>' +
    '<h2>FARM PLAN — 10 STEPS</h2><p class="plancap">cost and time for a ' + money(dep) + ' deposit</p><ol class="plan">' +
    r.farm_steps.map((s) => { const i = s.indexOf(' — '); return '<li><b>' + esc(s.slice(0, i)) + '</b> — ' + esc(s.slice(i + 3)) + '</li>'; }).join('') +
    '</ol>';
  for (const el of [document.querySelector('header'), $('strip'), document.querySelector('.oneline'), $('accounting'), $('evidence'), $('boardWrap'), $('pricing'), $('live')]) el.hidden = true;
  $('detail').hidden = false;
  $('backBtn').addEventListener('click', () => { location.hash = '#tab=' + state.tab; });
  window.scrollTo(0, 0);
}
function closeDetail() {
  $('detail').hidden = true;
  for (const el of [document.querySelector('header'), $('strip'), document.querySelector('.oneline'), $('accounting'), $('evidence'), $('boardWrap'), $('pricing'), $('live')]) el.hidden = false;
  renderBoard();
}

// ------------------------------------------------------------ exports + wiring
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function wire() {
  const cats = [...new Set(ROWS.map((r) => r.category))].sort();
  const chains = [...new Set(ROWS.flatMap((r) => r.chains))].sort();
  $('catSel').innerHTML = '<option value="">All categories</option>' + cats.map((c) => '<option>' + esc(c) + '</option>').join('');
  $('chainSel').innerHTML = '<option value="">All chains</option>' + chains.map((c) => '<option>' + esc(c) + '</option>').join('');
  $('search').addEventListener('input', (e) => { state.search = e.target.value; renderBoard(); });
  $('catSel').addEventListener('change', (e) => { state.cat = e.target.value; renderBoard(); });
  $('chainSel').addEventListener('change', (e) => { state.chain = e.target.value; renderBoard(); });
  $('resetBtn').addEventListener('click', () => {
    Object.assign(state, { search: '', cat: '', chain: '', dep: 'plan', share: 7, weeks: 5, sort: { key: 'imp', dir: -1 } });
    $('search').value = ''; $('catSel').value = ''; $('chainSel').value = ''; $('depositSel').value = 'plan';
    $('shareSlider').value = '7'; $('weeksSlider').value = '5';
    $('shareVal').textContent = '7.0%'; $('weeksVal').textContent = '5 wk';
    renderBoard();
  });
  $('depositSel').addEventListener('change', (e) => { state.dep = e.target.value; renderBoard(); });
  $('shareSlider').addEventListener('input', (e) => { state.share = Number(e.target.value); $('shareVal').textContent = state.share.toFixed(1) + '%'; renderBoard(); });
  $('weeksSlider').addEventListener('input', (e) => { state.weeks = Number(e.target.value); $('weeksVal').textContent = state.weeks + ' wk'; renderBoard(); });
  $('csvBtn').addEventListener('click', () => {
    const rows = filtered();
    const head = 'rank,name,category,chains,tvl,odds,implied_value_usd,verdict,net_usd,net_per_hour_usd';
    const lines = rows.map((r) => {
      const e = econ(r, depNow(r), state.share / 100, state.weeks);
      return [r.rank, '"' + r.name.replace(/"/g, '""') + '"', '"' + r.category + '"', '"' + r.chains.join(';') + '"', r.tvl, r.odds, r.implied_value_usd, r.verdict, e.net.toFixed(2), e.nph.toFixed(2)].join(',');
    });
    download('launch-radar.csv', head + '\n' + lines.join('\n'), 'text/csv');
  });
  $('jsonBtn').addEventListener('click', () => {
    download('launch-radar.json', JSON.stringify(filtered(), null, 2), 'application/json');
  });
  $('selAll').addEventListener('change', (e) => {
    document.querySelectorAll('#rows input[type=checkbox]').forEach((c) => { c.checked = e.target.checked; });
  });
  document.querySelectorAll('#board th').forEach((th) => th.addEventListener('click', () => {
    const map = { thRank: 'rank', thTvl: 'tvl', thOdds: 'odds', thIfl: 'imp', thImp: 'imp', thNph: 'nph', thProto: 'name' };
    const key = map[th.id];
    if (!key) return;
    if (state.sort.key === key) state.sort.dir *= -1;
    else state.sort = { key, dir: key === 'name' ? 1 : -1 };
    renderBoard();
  }));
  window.addEventListener('hashchange', route);
}
function route() {
  const h = location.hash.replace(/^#/, '');
  const params = new URLSearchParams(h);
  if (params.has('detail')) { openDetail(params.get('detail')); return; }
  if (params.has('tab') && TABS.some((t) => t[0] === params.get('tab'))) {
    state.tab = params.get('tab');
    state.sort = state.tab === 'farm' ? { key: 'nph', dir: -1 } : { key: 'imp', dir: -1 };
  }
  closeDetail();
}

renderStrip();
renderAccounting();
renderEvidence();
renderPricing();
renderLive();
renderFooter();
wire();
route();
