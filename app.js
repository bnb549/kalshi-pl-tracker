let charts = {};

document.getElementById('csvFile').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      processData(results.data);
    }
  });
});

function processData(rows) {
  rows.forEach(r => { r._date = new Date(r.Original_Date); });

  const trades = rows.filter(r => r.type === 'Trade');
  const tradeMap = {};
  trades.forEach(r => {
    const ticker = r.Market_Ticker;
    const contracts = parseFloat(r.Amount_In_Dollars) || 0;
    const priceCents = parseFloat(r.Price_In_Cents) || 0;
    const fee = parseFloat(r.Fee_In_Dollars) || 0;
    const cost = contracts * (priceCents / 100) + fee;
    if (!tradeMap[ticker]) tradeMap[ticker] = { cost: 0, fees: 0, contracts: 0 };
    tradeMap[ticker].cost += cost;
    tradeMap[ticker].fees += fee;
    tradeMap[ticker].contracts += contracts;
  });

  const setts = rows.filter(r => r.type === 'Settlement');
  const settMap = {};
  setts.forEach(r => {
    const ticker = r.Market_Ticker;
    const payout = parseFloat(r.Profit_In_Dollars) || 0;
    const result = r.Result || '';
    if (!settMap[ticker]) settMap[ticker] = { payout: 0, result: result, date: r._date };
    settMap[ticker].payout += payout;
    if (r._date > settMap[ticker].date) settMap[ticker].date = r._date;
  });

  const pnlRows = [];
  for (const ticker in tradeMap) {
    if (!settMap[ticker]) continue;
    const t = tradeMap[ticker];
    const s = settMap[ticker];
    const netProfit = s.payout - t.cost;
    pnlRows.push({
      ticker,
      date: s.date,
      contracts: t.contracts,
      avgEntry: t.contracts > 0 ? (t.cost / t.contracts) : 0,
      cost: t.cost,
      payout: s.payout,
      fees: t.fees,
      netProfit,
      result: s.result
    });
  }

  pnlRows.sort((a, b) => a.date - b.date);

  let cumPnL = 0, cumFees = 0;
  pnlRows.forEach(r => {
    cumPnL += r.netProfit;
    cumFees += r.fees;
    r.cumPnL = cumPnL;
    r.cumFees = cumFees;
  });

  renderStats(pnlRows);
  renderCharts(pnlRows);
  renderTable(pnlRows);

  document.getElementById('stats').classList.remove('hidden');
  document.getElementById('charts').classList.remove('hidden');
  document.getElementById('table-section').classList.remove('hidden');
}

function fmt(v) { return '$' + v.toFixed(2); }
function fmtPct(v) { return v.toFixed(1) + '%'; }

function renderStats(rows) {
  const totalCost = rows.reduce((s,r) => s + r.cost, 0);
  const totalPayout = rows.reduce((s,r) => s + r.payout, 0);
  const netPnL = totalPayout - totalCost;
  const totalFees = rows.reduce((s,r) => s + r.fees, 0);
  const wins = rows.filter(r => r.result === 'yes').length;
  const winRate = rows.length > 0 ? (wins / rows.length) * 100 : 0;

  document.getElementById('totalInvested').textContent = fmt(totalCost);
  document.getElementById('totalPayout').textContent = fmt(totalPayout);
  document.getElementById('totalFees').textContent = fmt(totalFees);
  document.getElementById('marketsSettled').textContent = rows.length;

  const pnlEl = document.getElementById('netPnL');
  pnlEl.textContent = (netPnL >= 0 ? '+' : '') + fmt(netPnL);
  pnlEl.className = 'stat-value ' + (netPnL >= 0 ? 'positive' : 'negative');

  const wrEl = document.getElementById('winRate');
  wrEl.textContent = fmtPct(winRate);
  wrEl.className = 'stat-value ' + (winRate >= 50 ? 'positive' : 'negative');
}

function renderCharts(rows) {
  const labels = rows.map(r => r.date.toLocaleDateString());
  const gridColor = 'rgba(255,255,255,0.07)';
  const defaultFont = { color: '#94a3b8' };

  function makeChart(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }

  makeChart('cumulativePnLChart', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Cumulative Net P/L',
        data: rows.map(r => r.cumPnL.toFixed(2)),
        borderColor: '#63b3ed',
        backgroundColor: 'rgba(99,179,237,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 3
      }]
    },
    options: {
      plugins: { legend: { labels: defaultFont } },
      scales: {
        x: { ticks: defaultFont, grid: { color: gridColor } },
        y: { ticks: { ...defaultFont, callback: v => '$'+v }, grid: { color: gridColor } }
      }
    }
  });

  makeChart('tradePnLChart', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Net P/L',
        data: rows.map(r => r.netProfit.toFixed(2)),
        backgroundColor: rows.map(r => r.netProfit >= 0 ? 'rgba(104,211,145,0.75)' : 'rgba(252,129,129,0.75)')
      }]
    },
    options: {
      plugins: { legend: { labels: defaultFont } },
      scales: {
        x: { ticks: defaultFont, grid: { color: gridColor } },
        y: { ticks: { ...defaultFont, callback: v => '$'+v }, grid: { color: gridColor } }
      }
    }
  });

  makeChart('feesChart', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Cumulative Fees',
        data: rows.map(r => r.cumFees.toFixed(2)),
        borderColor: '#f6ad55',
        backgroundColor: 'rgba(246,173,85,0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 3
      }]
    },
    options: {
      plugins: { legend: { labels: defaultFont } },
      scales: {
        x: { ticks: defaultFont, grid: { color: gridColor } },
        y: { ticks: { ...defaultFont, callback: v => '$'+v }, grid: { color: gridColor } }
      }
    }
  });

  const wins = rows.filter(r => r.result === 'yes').length;
  const losses = rows.filter(r => r.result === 'no').length;
  const scalars = rows.filter(r => r.result === 'scalar').length;
  makeChart('winLossChart', {
    type: 'doughnut',
    data: {
      labels: ['Win', 'Loss', 'Scalar/Push'],
      datasets: [{
        data: [wins, losses, scalars],
        backgroundColor: ['rgba(104,211,145,0.8)', 'rgba(252,129,129,0.8)', 'rgba(251,211,141,0.8)']
      }]
    },
    options: {
      plugins: { legend: { position: 'right', labels: defaultFont } }
    }
  });

  const binLabels = ['<60¢', '60-70¢', '70-80¢', '80-90¢', '90-95¢', '>95¢'];
  const binCounts = [0,0,0,0,0,0];
  rows.forEach(r => {
    const p = r.avgEntry * 100;
    if (p < 60) binCounts[0]++;
    else if (p < 70) binCounts[1]++;
    else if (p < 80) binCounts[2]++;
    else if (p < 90) binCounts[3]++;
    else if (p < 95) binCounts[4]++;
    else binCounts[5]++;
  });
  makeChart('priceDistChart', {
    type: 'bar',
    data: {
      labels: binLabels,
      datasets: [{ label: '# Trades', data: binCounts, backgroundColor: 'rgba(99,179,237,0.7)' }]
    },
    options: {
      plugins: { legend: { labels: defaultFont } },
      scales: {
        x: { title: { display: true, text: 'Avg Entry Price', color: '#94a3b8' }, ticks: defaultFont, grid: { color: gridColor } },
        y: { title: { display: true, text: 'Count', color: '#94a3b8' }, ticks: defaultFont, grid: { color: gridColor } }
      }
    }
  });
}

function renderTable(rows) {
  const tbody = document.getElementById('tradeTableBody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    const short = r.ticker.length > 28 ? r.ticker.slice(0,25)+'...' : r.ticker;
    const resultClass = r.result === 'yes' ? 'win' : r.result === 'no' ? 'loss' : 'scalar';
    tr.innerHTML = `
      <td title="${r.ticker}">${short}</td>
      <td>${r.date.toLocaleDateString()}</td>
      <td>${r.contracts}</td>
      <td>${(r.avgEntry * 100).toFixed(0)}¢</td>
      <td>${fmt(r.cost)}</td>
      <td>${fmt(r.payout)}</td>
      <td>${fmt(r.fees)}</td>
      <td class="${r.netProfit >= 0 ? 'win' : 'loss'}">${(r.netProfit >= 0 ? '+' : '') + fmt(r.netProfit)}</td>
      <td class="${resultClass}">${r.result.toUpperCase()}</td>
    `;
    tbody.appendChild(tr);
  });
}
