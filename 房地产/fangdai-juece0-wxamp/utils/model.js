/**
 * 置换决策 · 计算模型(纯函数,无 UI 依赖,可在 node 下单测)
 * ------------------------------------------------------------
 * 单位约定:
 *   - 房价/首付/额度/资金/安全垫/杂费 …… 万元
 *   - 月供/月收入/月支出(返回值) …… 元
 *   - 利率 …… 年化百分数(如 3.05 表示 3.05%)
 * 月供公式与 Excel PMT 完全一致(见 finance.js,已对账验证)。
 */
const F = require('./finance.js');

function monthlyPmt(principalWan, annualRatePct, months) {
  if (principalWan <= 0) return 0;
  return Math.abs(F.pmt(annualRatePct / 100 / 12, months, principalWan * 1e4));
}

/**
 * 决策模型
 * p = { price, wife, available, fundQuota, fundRate, commRate,
 *       downPct, years, living, cushionT, misc, over140, rStar }
 */
function computeDecision(p) {
  const n = Math.round(p.years * 12);
  const price = p.price;

  // ---- 路径 A:最低首付,公积金打满 + 商贷补足 ----
  const downA = price * p.downPct / 100;
  const deedRate = p.over140 ? 0.015 : 0.01;        // 契税:首套 ≤140㎡ 1%,>140㎡ 1.5%
  const deedTax = price * deedRate;
  const oneTimeA = downA + deedTax + p.misc;
  const loanTotal = price - downA;
  const fundLoan = Math.min(p.fundQuota, loanTotal);
  const commLoan = Math.max(0, loanTotal - fundLoan);

  const pmtFund = monthlyPmt(fundLoan, p.fundRate, n);
  const pmtComm = monthlyPmt(commLoan, p.commRate, n);
  const pmtTotal = pmtFund + pmtComm;

  const wifeYuan = p.wife * 1e4;
  const livingYuan = p.living * 1e4;
  const ratio = wifeYuan > 0 ? pmtTotal / wifeYuan : Infinity;
  const surplus = wifeYuan - pmtTotal - livingYuan;          // 元/月,可为负

  const remainA = p.available - oneTimeA;                    // 万
  const cushionA = Math.max(0, Math.min(p.cushionT, remainA));
  const investA = Math.max(0, remainA - cushionA);
  const outA = pmtTotal + livingYuan;                        // 元/月 总支出
  const cushionMonthsA = outA > 0 ? (cushionA * 1e4) / outA : 0;

  // ---- 路径 B:只贷公积金,商贷部分改为现金首付 ----
  // 首付仍需满足政策下限,故公积金贷款额 = min(额度, 房价×(1−最低首付比例))
  const fundLoanB = Math.min(p.fundQuota, price * (1 - p.downPct / 100));
  const downB = price - fundLoanB;
  const oneTimeB = downB + deedTax + p.misc;
  const pmtB = monthlyPmt(fundLoanB, p.fundRate, n);
  const remainB = p.available - oneTimeB;
  const cushionB = Math.max(0, Math.min(p.cushionT, remainB));
  const investB = Math.max(0, remainB - cushionB);
  const outB = pmtB + livingYuan;
  const cushionMonthsB = outB > 0 ? (cushionB * 1e4) / outB : 0;
  const surplusB = wifeYuan - pmtB - livingYuan;

  // ---- 两路径净现值差(A − B),折现率 = 境内再投资收益率 r* ----
  // A 相对 B:手里多留 commLoan 现金(可按 r* 增值),代价是未来 n 期商贷月供流。
  // NPV(A−B) = commLoan − PV(商贷月供流 @ r*/12)
  const i2 = p.rStar / 100 / 12;
  const af = i2 === 0 ? n : (1 - Math.pow(1 + i2, -n)) / i2; // 年金现值系数
  const pvComm = pmtComm * af;                               // 元
  const npvDiff = commLoan * 1e4 - pvComm;                   // 元,>0 → A 占优

  // ---- 判定 ----
  // 红线逻辑与分析一致:月供必须能由妻子税后收入独立覆盖,
  // 投资收益只能是加分项,不能成为生存现金流的必要项。
  let verdict;
  if (remainA < 0) verdict = 'nocash';
  else if (pmtTotal > wifeYuan) verdict = 'redline';
  else if (surplus >= 3000) verdict = 'comfort';
  else if (surplus >= 0) verdict = 'edge';
  else verdict = 'reliant';

  return {
    n, downA, deedTax, oneTimeA, loanTotal, fundLoan, commLoan,
    pmtFund, pmtComm, pmtTotal, ratio, surplus,
    remainA, cushionA, investA, cushionMonthsA,
    fundLoanB, downB, oneTimeB, pmtB, remainB, cushionB, investB,
    cushionMonthsB, surplusB,
    pvComm, npvDiff, verdict,
    cushionUnderfunded: remainA >= 0 && remainA < p.cushionT,
  };
}

/**
 * 测算模型(通用组合贷)
 * c = { price, downPct, fundQuota, fundRate, commRate, years, method }
 * method: 'annuity' 等额本息 | 'principal' 等额本金
 */
function computeCalc(c) {
  const n = Math.round(c.years * 12);
  const down = c.price * c.downPct / 100;
  const loanTotal = Math.max(0, c.price - down);
  const fundLoan = Math.min(c.fundQuota, loanTotal);
  const commLoan = Math.max(0, loanTotal - fundLoan);

  // 等额本息
  const aPmtF = monthlyPmt(fundLoan, c.fundRate, n);
  const aPmtC = monthlyPmt(commLoan, c.commRate, n);
  const aIntF = aPmtF * n - fundLoan * 1e4;
  const aIntC = aPmtC * n - commLoan * 1e4;
  const aInt = aIntF + aIntC;

  // 等额本金:每月本金恒定,利息递减
  // 总利息 = P · (r/12) · (n+1)/2;首月 = P/n + P·r/12;每月递减 (P/n)·(r/12)
  function principalAgg(P, ratePct) {
    if (P <= 0) return { first: 0, dec: 0, last: 0, int: 0 };
    const Py = P * 1e4, i = ratePct / 100 / 12, mp = Py / n;
    return {
      first: mp + Py * i,
      dec: mp * i,
      last: mp * (1 + i),
      int: Py * i * (n + 1) / 2,
    };
  }
  const pF = principalAgg(fundLoan, c.fundRate);
  const pC = principalAgg(commLoan, c.commRate);
  const pInt = pF.int + pC.int;

  const weightedRate = loanTotal > 0
    ? (fundLoan * c.fundRate + commLoan * c.commRate) / loanTotal
    : 0;

  const isA = c.method === 'annuity';
  return {
    n, down, loanTotal, fundLoan, commLoan, weightedRate,
    // 当前所选方式
    pmtFund: isA ? aPmtF : pF.first,
    pmtComm: isA ? aPmtC : pC.first,
    pmtTotal: isA ? aPmtF + aPmtC : pF.first + pC.first,
    firstPay: pF.first + pC.first,
    monthlyDec: pF.dec + pC.dec,
    lastPay: pF.last + pC.last,
    totalInterest: isA ? aInt : pInt,
    totalPayment: loanTotal * 1e4 + (isA ? aInt : pInt),
    // 两种方式对比
    annuityInterest: aInt,
    principalInterest: pInt,
    interestDiff: aInt - pInt, // 本息比本金多付的利息
  };
}

module.exports = { computeDecision, computeCalc, monthlyPmt };
