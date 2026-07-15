/* ============================================================
   房贷计算器 · Application Logic
   ============================================================ */

// ----- Formatting helpers -----
const fmt = {
    // High-precision number with thousands separators
    money(n, decimals = 2) {
        if (!isFinite(n)) return '—';
        return n.toLocaleString('zh-CN', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    },
    // Full precision for verifying against Excel
    moneyFull(n) {
        if (!isFinite(n)) return '—';
        const fixed = n.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
        const parts = fixed.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.');
    },
    pct(n, decimals = 3) {
        if (!isFinite(n)) return '—';
        return (n * 100).toFixed(decimals) + '%';
    },
    date(d) {
        if (!(d instanceof Date) || isNaN(d)) return '—';
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    },
};

// ----- State -----
const state = {
    purchasePrice: 2514931.6,
    area: 59.93,
    assessedValue: 2300000,
    ltv: 0.7,
    loanType: 'commercial',
    fundPrincipal: 0,
    years: 22.5,
    repayMethod: 'equalPayment',
    lprRate: 0.036,
    bpRate: -0.003,
    fundRate: 0.031,
    startDate: new Date('2018-07-04'),
    currentDate: new Date(),
};

// ----- Derived values -----
function derive() {
    const totalPrincipal = state.purchasePrice * state.ltv;
    let commercialPrincipal = totalPrincipal;
    let fundPrincipal = 0;
    if (state.loanType === 'fund') {
        fundPrincipal = totalPrincipal;
        commercialPrincipal = 0;
    } else if (state.loanType === 'combo') {
        fundPrincipal = Math.min(state.fundPrincipal, totalPrincipal);
        commercialPrincipal = totalPrincipal - fundPrincipal;
    }
    const downPayment = state.purchasePrice - totalPrincipal;
    const totalMonths = Math.round(state.years * 12);
    const commercialRate = state.lprRate + state.bpRate;
    const fundRate = state.fundRate;
    return {
        totalPrincipal, commercialPrincipal, fundPrincipal,
        downPayment, totalMonths, commercialRate, fundRate,
    };
}

// ----- Combined schedule (commercial + fund) -----
function buildSchedule() {
    const d = derive();
    const method = state.repayMethod === 'equalPayment'
        ? Finance.scheduleEqualPayment
        : Finance.scheduleEqualPrincipal;

    const cSched = d.commercialPrincipal > 0
        ? method(d.commercialPrincipal, d.commercialRate, d.totalMonths)
        : { schedule: [], payment: 0, firstPayment: 0, lastPayment: 0 };
    const fSched = d.fundPrincipal > 0
        ? method(d.fundPrincipal, d.fundRate, d.totalMonths)
        : { schedule: [], payment: 0, firstPayment: 0, lastPayment: 0 };

    // Merge schedules period-by-period
    const merged = [];
    for (let i = 0; i < d.totalMonths; i++) {
        const c = cSched.schedule[i] || { payment: 0, interest: 0, principal: 0, balance: 0 };
        const f = fSched.schedule[i] || { payment: 0, interest: 0, principal: 0, balance: 0 };
        const dt = Finance.addMonths(state.startDate, i);
        merged.push({
            period: i + 1,
            date: dt,
            payment: c.payment + f.payment,
            interest: c.interest + f.interest,
            principal: c.principal + f.principal,
            balance: c.balance + f.balance,
            cPayment: c.payment, cInterest: c.interest, cPrincipal: c.principal, cBalance: c.balance,
            fPayment: f.payment, fInterest: f.interest, fPrincipal: f.principal, fBalance: f.balance,
        });
    }
    return { merged, cSched, fSched, derived: d };
}

// ----- Updates -----
function updateCalculator() {
    const { merged, cSched, fSched, derived: d } = buildSchedule();

    // Display rates
    document.getElementById('commercialRate').textContent = (d.commercialRate * 100).toFixed(3) + '%';

    // Property valuation
    const buyAvg = state.area > 0 ? state.purchasePrice / state.area : 0;
    const assessAvg = state.area > 0 ? state.assessedValue / state.area : 0;
    const apprec = state.purchasePrice > 0 ? (state.assessedValue - state.purchasePrice) / state.purchasePrice : 0;
    document.getElementById('r-buyAvg').textContent = fmt.money(buyAvg, 2) + ' 元/㎡';
    document.getElementById('r-assessAvg').textContent = fmt.money(assessAvg, 2) + ' 元/㎡';
    const apprEl = document.getElementById('r-appreciation');
    apprEl.textContent = (apprec >= 0 ? '+' : '') + fmt.pct(apprec, 3);
    apprEl.className = 'num ' + (apprec >= 0 ? 'positive' : 'negative');

    // Rates
    document.getElementById('r-cRate').textContent =
        d.commercialPrincipal > 0 ? fmt.pct(d.commercialRate, 3) : 'N/A';
    document.getElementById('r-fRate').textContent =
        d.fundPrincipal > 0 ? fmt.pct(d.fundRate, 3) : 'N/A';

    // Down payment / principal
    document.getElementById('r-down').textContent = '¥' + fmt.money(d.downPayment, 2);
    document.getElementById('r-principal').textContent = '¥' + fmt.money(d.totalPrincipal, 2);

    let subParts = [];
    if (d.fundPrincipal > 0) subParts.push('公积金 ¥' + fmt.money(d.fundPrincipal, 0));
    if (d.commercialPrincipal > 0) subParts.push('商业 ¥' + fmt.money(d.commercialPrincipal, 0));
    document.getElementById('r-principal-sub').textContent = subParts.join(' · ');

    // Monthly payment
    let monthlyText, monthlySub;
    if (state.repayMethod === 'equalPayment') {
        const monthly = (cSched.payment || 0) + (fSched.payment || 0);
        monthlyText = '¥' + fmt.money(monthly, 2);
        const monthlyParts = [];
        if (fSched.payment) monthlyParts.push('公积金 ¥' + fmt.money(fSched.payment, 2));
        if (cSched.payment) monthlyParts.push('商业 ¥' + fmt.money(cSched.payment, 2));
        monthlySub = monthlyParts.join(' · ');
    } else {
        const first = merged[0]?.payment || 0;
        const last = merged[merged.length - 1]?.payment || 0;
        monthlyText = '¥' + fmt.money(first, 2);
        monthlySub = '末月 ¥' + fmt.money(last, 2) + ' · 月递减';
    }
    document.getElementById('r-monthly').textContent = monthlyText;
    document.getElementById('r-monthly-sub').textContent = monthlySub;

    // Totals
    let totalPay = 0, totalInt = 0;
    for (const m of merged) { totalPay += m.payment; totalInt += m.interest; }
    document.getElementById('r-total').textContent = '¥' + fmt.money(totalPay, 2);
    document.getElementById('r-interest').textContent = '¥' + fmt.money(totalInt, 2);

    // Periods
    document.getElementById('r-periods').textContent = d.totalMonths;
    document.getElementById('r-periods-sub').textContent = state.years + ' 年 · ' + fmt.date(state.startDate) +
        ' ~ ' + fmt.date(Finance.addMonths(state.startDate, d.totalMonths - 1));

    return { merged, derived: d, totalPay, totalInt };
}

function updateStatus(ctx) {
    const { merged, derived: d, totalPay, totalInt } = ctx;
    const cur = state.currentDate;
    const monthsElapsed = Finance.monthsBetween(state.startDate, cur);
    const currentPeriod = Math.max(1, Math.min(monthsElapsed + 1, d.totalMonths));

    // Beginning of current period accumulations
    let paidPrincipal = 0, paidInterest = 0;
    for (let i = 0; i < currentPeriod - 1; i++) {
        paidPrincipal += merged[i].principal;
        paidInterest += merged[i].interest;
    }
    const beginBalance = d.totalPrincipal - paidPrincipal;
    const curRow = merged[currentPeriod - 1] || merged[merged.length - 1];
    const endBalance = Math.max(beginBalance - curRow.principal, 0);
    const progress = (paidPrincipal + curRow.principal) / d.totalPrincipal;

    document.getElementById('s-period').textContent = currentPeriod + ' / ' + d.totalMonths;
    document.getElementById('s-period-sub').textContent =
        '还剩 ' + (d.totalMonths - currentPeriod) + ' 期 · ' +
        ((d.totalMonths - currentPeriod) / 12).toFixed(1) + ' 年';
    document.getElementById('s-balance').textContent = '¥' + fmt.money(beginBalance, 2);
    document.getElementById('s-paid-principal').textContent = '¥' + fmt.money(paidPrincipal, 2);
    document.getElementById('s-paid-interest').textContent = '¥' + fmt.money(paidInterest, 2);
    document.getElementById('s-paid-total').textContent = '¥' + fmt.money(paidPrincipal + paidInterest, 2);
    document.getElementById('s-progress').textContent = (progress * 100).toFixed(2) + '%';
    document.getElementById('s-progress-bar').style.width = (progress * 100) + '%';

    document.getElementById('s-period-info').textContent =
        '· 第 ' + currentPeriod + ' 期 (' + fmt.date(curRow.date) + ')';
    document.getElementById('s-due').textContent = '¥' + fmt.money(curRow.payment, 2);
    document.getElementById('s-due-interest').textContent = '¥' + fmt.money(curRow.interest, 2);
    document.getElementById('s-due-principal').textContent = '¥' + fmt.money(curRow.principal, 2);
    document.getElementById('s-end-balance').textContent = '¥' + fmt.money(endBalance, 2);
}

function updateSchedule(ctx) {
    const { merged, derived: d, totalPay, totalInt } = ctx;
    const tbody = document.getElementById('scheduleBody');
    const summary = document.getElementById('scheduleSummary');

    summary.innerHTML = `
        <div><div class="label">总期数</div><div class="val">${d.totalMonths}</div></div>
        <div><div class="label">起始日期</div><div class="val">${fmt.date(state.startDate)}</div></div>
        <div><div class="label">结束日期</div><div class="val">${fmt.date(merged[merged.length - 1].date)}</div></div>
        <div><div class="label">月供总额</div><div class="val">¥${fmt.money(totalPay, 2)}</div></div>
        <div><div class="label">总利息</div><div class="val">¥${fmt.money(totalInt, 2)}</div></div>
    `;

    // Use document fragment for performance
    const frag = document.createDocumentFragment();
    let curYear = null;
    for (const row of merged) {
        const tr = document.createElement('tr');
        const yr = row.date.getFullYear();
        if (yr !== curYear && row.period > 1 && row.date.getMonth() === 0) {
            tr.className = 'year-marker';
        }
        curYear = yr;
        tr.innerHTML = `
            <td>${row.period}</td>
            <td>${fmt.date(row.date)}</td>
            <td class="num">${fmt.money(row.payment, 2)}</td>
            <td class="num">${fmt.money(row.interest, 2)}</td>
            <td class="num">${fmt.money(row.principal, 2)}</td>
            <td class="num">${fmt.money(row.balance, 2)}</td>
        `;
        frag.appendChild(tr);
    }
    tbody.innerHTML = '';
    tbody.appendChild(frag);
}

// ----- Early repayment analysis -----
function computePrepayment() {
    const ctx = buildSchedule();
    const { merged, derived: d } = ctx;

    const prepayDate = new Date(document.getElementById('prepayDate').value);
    const prepayAmount = parseFloat(document.getElementById('prepayAmount').value) || 0;
    const method = document.getElementById('prepayMethod').value;

    const monthsElapsed = Finance.monthsBetween(state.startDate, prepayDate);
    const prepayPeriod = Math.max(1, Math.min(monthsElapsed + 1, d.totalMonths));

    // Balance at start of prepay period (before that period's payment)
    let paidPrincipal = 0, paidInterest = 0;
    for (let i = 0; i < prepayPeriod - 1; i++) {
        paidPrincipal += merged[i].principal;
        paidInterest += merged[i].interest;
    }
    const balBefore = d.totalPrincipal - paidPrincipal;
    const newBalance = Math.max(balBefore - prepayAmount, 0);

    // Original totals
    let oldTotalInt = 0, oldTotalPay = 0;
    for (const m of merged) { oldTotalInt += m.interest; oldTotalPay += m.payment; }
    const oldPayment = merged[0].payment;
    const oldEndDate = merged[merged.length - 1].date;

    // For the combined loan, weight by share for simplified prepayment
    // Apply prepayment proportionally to commercial and housing-fund loans
    const cShare = d.totalPrincipal > 0 ? d.commercialPrincipal / d.totalPrincipal : 0;
    const fShare = d.totalPrincipal > 0 ? d.fundPrincipal / d.totalPrincipal : 0;
    const cBalAfter = Math.max((ctx.cSched.schedule[prepayPeriod - 2]?.balance ?? d.commercialPrincipal) - prepayAmount * cShare, 0);
    const fBalAfter = Math.max((ctx.fSched.schedule[prepayPeriod - 2]?.balance ?? d.fundPrincipal) - prepayAmount * fShare, 0);

    let newPayment, newEndPeriod, newTotalInt, savings, earlyDate;
    const remainingMonths = d.totalMonths - prepayPeriod + 1;

    if (method === 'shortenTerm') {
        // Keep payment ~same, find new term
        // For combined loan, compute for each separately; here use combined approach
        let monthsNeeded = 0, intSaved = 0;
        let cBal = cBalAfter, fBal = fBalAfter;
        const cPay = ctx.cSched.payment;
        const fPay = ctx.fSched.payment;
        const cR = d.commercialRate / 12, fR = d.fundRate / 12;
        while ((cBal > 0.01 || fBal > 0.01) && monthsNeeded < remainingMonths) {
            if (cBal > 0.01) {
                const ci = cBal * cR;
                const cp = Math.min(cPay - ci, cBal);
                cBal -= cp;
            }
            if (fBal > 0.01) {
                const fi = fBal * fR;
                const fp = Math.min(fPay - fi, fBal);
                fBal -= fp;
            }
            monthsNeeded++;
        }
        newEndPeriod = prepayPeriod - 1 + monthsNeeded;
        earlyDate = Finance.addMonths(state.startDate, newEndPeriod - 1);
        newPayment = oldPayment;
        // Recompute total interest
        newTotalInt = paidInterest;
        cBal = cBalAfter; fBal = fBalAfter;
        for (let i = 0; i < monthsNeeded; i++) {
            if (cBal > 0.01) {
                const ci = cBal * cR; newTotalInt += ci;
                const cp = Math.min(cPay - ci, cBal); cBal -= cp;
            }
            if (fBal > 0.01) {
                const fi = fBal * fR; newTotalInt += fi;
                const fp = Math.min(fPay - fi, fBal); fBal -= fp;
            }
        }
        savings = oldTotalInt - newTotalInt;
    } else {
        // reducePayment: keep term, recalculate payment from new balance
        const newC = d.commercialPrincipal > 0
            ? Math.abs(Finance.pmt(d.commercialRate / 12, remainingMonths, cBalAfter))
            : 0;
        const newF = d.fundPrincipal > 0
            ? Math.abs(Finance.pmt(d.fundRate / 12, remainingMonths, fBalAfter))
            : 0;
        newPayment = newC + newF;
        const newRemainingInt = (newC * remainingMonths - cBalAfter) + (newF * remainingMonths - fBalAfter);
        newTotalInt = paidInterest + newRemainingInt;
        savings = oldTotalInt - newTotalInt;
        newEndPeriod = d.totalMonths;
        earlyDate = oldEndDate;
    }

    // Render
    document.getElementById('p-savings').textContent = '¥' + fmt.money(savings, 2);
    document.getElementById('p-old-payment').textContent = '¥' + fmt.money(oldPayment, 2);
    document.getElementById('p-new-payment').textContent = '¥' + fmt.money(newPayment, 2);
    document.getElementById('p-old-int').textContent = '¥' + fmt.money(oldTotalInt, 2);
    document.getElementById('p-new-int').textContent = '¥' + fmt.money(newTotalInt, 2);

    if (method === 'shortenTerm') {
        const monthsSaved = d.totalMonths - newEndPeriod;
        document.getElementById('p-early').textContent = monthsSaved + ' 个月';
    } else {
        const reduction = oldPayment - newPayment;
        document.getElementById('p-early').textContent = '月供减少 ¥' + fmt.money(reduction, 2);
    }

    document.getElementById('prepayDetail').innerHTML = `
        <tr><th>提前还款期数</th><td class="num">第 ${prepayPeriod} 期 (${fmt.date(prepayDate)})</td></tr>
        <tr><th>还款前本金余额</th><td class="num">¥${fmt.money(balBefore, 2)}</td></tr>
        <tr><th>提前还款金额</th><td class="num">¥${fmt.money(prepayAmount, 2)}</td></tr>
        <tr><th>还款后本金余额</th><td class="num">¥${fmt.money(newBalance, 2)}</td></tr>
        <tr><th>原结清日期</th><td class="num">${fmt.date(oldEndDate)}</td></tr>
        <tr><th>新结清日期</th><td class="num">${fmt.date(earlyDate)}</td></tr>
        <tr><th>剩余期数</th><td class="num">${method === 'shortenTerm' ? (newEndPeriod - prepayPeriod + 1) : remainingMonths} 期</td></tr>
    `;
}

// ----- LPR table -----
const LPR_HISTORY = [
    ['2025-10-20', 0.030, 0.035], ['2025-09-22', 0.030, 0.035],
    ['2025-08-20', 0.030, 0.035], ['2025-07-21', 0.030, 0.035],
    ['2025-06-20', 0.030, 0.035], ['2025-05-20', 0.030, 0.035],
    ['2025-04-21', 0.031, 0.036], ['2025-03-20', 0.031, 0.036],
    ['2025-02-20', 0.031, 0.036], ['2025-01-20', 0.031, 0.036],
    ['2024-12-20', 0.031, 0.036], ['2024-11-20', 0.031, 0.036],
    ['2024-10-21', 0.031, 0.036], ['2024-09-20', 0.0335, 0.0385],
    ['2024-08-20', 0.0335, 0.0385], ['2024-07-22', 0.0335, 0.0385],
    ['2024-06-20', 0.0345, 0.0395], ['2024-05-20', 0.0345, 0.0395],
    ['2024-04-22', 0.0345, 0.0395], ['2024-03-20', 0.0345, 0.0395],
    ['2024-02-20', 0.0345, 0.0395], ['2024-01-22', 0.0345, 0.042],
    ['2023-12-20', 0.0345, 0.042], ['2023-11-20', 0.0345, 0.042],
    ['2023-10-20', 0.0345, 0.042], ['2023-09-20', 0.0345, 0.042],
    ['2023-08-21', 0.0345, 0.042], ['2023-07-20', 0.0355, 0.042],
    ['2023-06-20', 0.0355, 0.042], ['2023-05-22', 0.0365, 0.043],
    ['2023-04-20', 0.0365, 0.043], ['2023-03-20', 0.0365, 0.043],
    ['2023-02-20', 0.0365, 0.043], ['2023-01-20', 0.0365, 0.043],
    ['2022-12-20', 0.0365, 0.043], ['2022-11-21', 0.0365, 0.043],
    ['2022-10-20', 0.0365, 0.043], ['2022-09-20', 0.0365, 0.043],
    ['2022-08-22', 0.0365, 0.043], ['2022-07-20', 0.037, 0.0445],
    ['2022-06-20', 0.037, 0.0445], ['2022-05-20', 0.037, 0.0445],
    ['2022-04-20', 0.037, 0.046], ['2022-03-21', 0.037, 0.046],
    ['2022-02-21', 0.037, 0.046], ['2022-01-20', 0.037, 0.046],
    ['2021-12-20', 0.038, 0.0465], ['2021-11-22', 0.0385, 0.0465],
    ['2021-10-20', 0.0385, 0.0465], ['2021-09-22', 0.0385, 0.0465],
    ['2021-08-20', 0.0385, 0.0465], ['2021-07-20', 0.0385, 0.0465],
    ['2021-06-21', 0.0385, 0.0465], ['2021-05-20', 0.0385, 0.0465],
    ['2021-04-20', 0.0385, 0.0465], ['2021-03-22', 0.0385, 0.0465],
    ['2021-02-22', 0.0385, 0.0465], ['2021-01-20', 0.0385, 0.0465],
    ['2020-12-21', 0.0385, 0.0465], ['2020-11-20', 0.0385, 0.0465],
    ['2020-10-20', 0.0385, 0.0465], ['2020-09-21', 0.0385, 0.0465],
    ['2020-08-20', 0.0385, 0.0465], ['2020-07-20', 0.0385, 0.0465],
    ['2020-06-22', 0.0385, 0.0465], ['2020-05-20', 0.0385, 0.0465],
    ['2020-04-20', 0.0385, 0.0465], ['2020-02-20', 0.0405, 0.0475],
    ['2020-01-20', 0.0415, 0.048], ['2019-12-20', 0.0415, 0.048],
    ['2019-11-20', 0.0415, 0.048], ['2019-10-21', 0.042, 0.0485],
    ['2019-09-20', 0.042, 0.0485], ['2019-08-20', 0.0425, 0.0485],
];

function renderLPR() {
    const tbody = document.getElementById('lprBody');
    const frag = document.createDocumentFragment();
    for (let i = 0; i < LPR_HISTORY.length; i++) {
        const [date, one, five] = LPR_HISTORY[i];
        const prev = LPR_HISTORY[i + 1];
        const oneChanged = prev && one !== prev[1];
        const fiveChanged = prev && five !== prev[2];
        const tr = document.createElement('tr');
        if (oneChanged || fiveChanged) tr.className = 'rate-change';
        tr.innerHTML = `
            <td>${date}</td>
            <td class="num${oneChanged ? ' changed' : ''}">${(one * 100).toFixed(2)}%</td>
            <td class="num${fiveChanged ? ' changed' : ''}">${(five * 100).toFixed(2)}%</td>
        `;
        frag.appendChild(tr);
    }
    tbody.innerHTML = '';
    tbody.appendChild(frag);
}

// ----- CSV export -----
function exportCSV() {
    const ctx = buildSchedule();
    const rows = [['期数', '还款日', '月供', '利息', '本金', '剩余本金']];
    for (const r of ctx.merged) {
        rows.push([
            r.period, fmt.date(r.date),
            r.payment.toFixed(2), r.interest.toFixed(2),
            r.principal.toFixed(2), r.balance.toFixed(2),
        ]);
    }
    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '房贷还款明细.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}

// ----- Wiring -----
function readInputs() {
    state.purchasePrice = parseFloat(document.getElementById('purchasePrice').value) || 0;
    state.area = parseFloat(document.getElementById('area').value) || 0;
    state.assessedValue = parseFloat(document.getElementById('assessedValue').value) || 0;
    state.ltv = parseFloat(document.getElementById('ltv').value) || 0;
    state.loanType = document.getElementById('loanType').value;
    state.fundPrincipal = parseFloat(document.getElementById('fundPrincipal').value) || 0;
    state.years = parseFloat(document.getElementById('years').value) || 0;
    state.repayMethod = document.getElementById('repayMethod').value;
    state.lprRate = (parseFloat(document.getElementById('lprRate').value) || 0) / 100;
    state.bpRate = (parseFloat(document.getElementById('bpRate').value) || 0) / 100;
    state.fundRate = (parseFloat(document.getElementById('fundRate').value) || 0) / 100;
    state.startDate = new Date(document.getElementById('startDate').value);
    state.currentDate = new Date(document.getElementById('currentDate').value);

    // Show/hide based on loan type
    document.getElementById('commercialRateFs').classList.toggle('hidden', state.loanType === 'fund');
    document.getElementById('fundRateFs').classList.toggle('hidden', state.loanType === 'commercial');
    document.querySelectorAll('.combo-only').forEach(el => {
        el.classList.toggle('hidden', state.loanType !== 'combo');
    });
}

function recompute() {
    readInputs();
    const ctx = updateCalculator();
    updateStatus(ctx);
    updateSchedule(ctx);
}

function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.panel');
    tabs.forEach(t => t.addEventListener('click', () => {
        tabs.forEach(x => x.classList.remove('active'));
        panels.forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.querySelector(`[data-panel="${t.dataset.tab}"]`).classList.add('active');
    }));
}

function init() {
    // Initialize dates
    const today = new Date();
    const isoToday = today.toISOString().split('T')[0];
    document.getElementById('currentDate').value = isoToday;
    document.getElementById('prepayDate').value = isoToday;

    initTabs();

    // Re-compute on every input change
    document.querySelectorAll('.inputs input, .inputs select, #currentDate').forEach(el => {
        el.addEventListener('input', recompute);
        el.addEventListener('change', recompute);
    });

    document.getElementById('setToday').addEventListener('click', () => {
        document.getElementById('currentDate').value = new Date().toISOString().split('T')[0];
        recompute();
    });

    document.getElementById('computePrepay').addEventListener('click', computePrepayment);
    document.getElementById('exportCsv').addEventListener('click', exportCSV);

    renderLPR();
    recompute();
    computePrepayment();
}

document.addEventListener('DOMContentLoaded', init);
