const M = require('../../utils/model.js');

/* ============================================================
 * 默认参数 —— 全部可在界面"参数"区修改;改这里则成为新的默认值
 * ------------------------------------------------------------
 * price      房产总价(万)
 * wife       妻子税后月收入(万/月)
 * available  可用人民币资金(万)= 现金 350 + 卖旧房净得约 30
 * fundQuota  公积金可贷额度(万):209 = 家庭基数110×(1+首套40%+二孩50%)
 *            114 = 妻子单独申请(60×1.9);260 = 待核实的 2026-06 新政口径
 * fundRate   公积金年利率 %(首套 5 年以上 2.6)
 * commRate   商贷年利率 %(LPR3.5 − 45BP = 3.05,以放款行为准)
 * downPct    首付比例 %(政策下限 20)
 * years      年限(30)
 * living     非房月生活支出(万/月)
 * cushionT   应急安全垫目标(万)
 * misc       中介评估杂费(万)
 * over140    建面是否 >140㎡(契税 1% → 1.5%)
 * rStar      境内人民币再投资年化收益率 %(决定路径 A/B 的净现值比较)
 * ============================================================ */
const DEFAULTS = {
  price: 420, wife: 3.0,
  available: 380, fundQuota: 209, fundRate: 2.6, commRate: 3.05,
  downPct: 20, years: 30, living: 1.0, cushionT: 80, misc: 3,
  over140: false, rStar: 4.0,
};

const CALC_DEFAULTS = {
  price: 420, downPct: 20, fundQuota: 209,
  fundRate: 2.6, commRate: 3.05, years: 30, method: 'annuity',
};

/* ---------- 格式化 ---------- */
function thousands(x, dec) {
  if (!isFinite(x)) return '—';
  const neg = x < 0 ? '-' : '';
  const s = Math.abs(x).toFixed(dec);
  const parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg + parts.join('.');
}
const yuan = (x) => thousands(x, 2);        // 元,两位小数
const yuan0 = (x) => thousands(x, 0);       // 元,取整
const wan = (x) => thousands(x, 1);         // 万,一位小数
const pct1 = (x) => thousands(x, 1);

const VERDICT = {
  comfort: { word: '舒适区', line: '妻子税后收入可独立覆盖月供与全部生活支出' },
  edge:    { word: '临界',   line: '收入恰好覆盖月供与生活,结余所剩无几' },
  reliant: { word: '依赖投资', line: '月供未超收入,但生活缺口需投资收益补足' },
  redline: { word: '越线',   line: '月供已超过妻子税后收入' },
  nocash:  { word: '现金不足', line: '一次性支出超过可用人民币资金' },
};

Page({
  data: {
    tab: 'decision',
    showParams: false,
    p: Object.assign({}, DEFAULTS),
    ps: {},          // 参数输入框的原始字符串(保证输入流畅)
    c: Object.assign({}, CALC_DEFAULTS),
    cs: {},
    v: {},           // 决策视图
    cv: {},          // 测算视图
  },

  onLoad() {
    const ps = {}, cs = {};
    ['available', 'fundQuota', 'fundRate', 'commRate', 'downPct',
     'years', 'living', 'cushionT', 'misc'].forEach(k => ps[k] = String(DEFAULTS[k]));
    ['price', 'downPct', 'fundQuota', 'fundRate', 'commRate', 'years']
      .forEach(k => cs[k] = String(CALC_DEFAULTS[k]));
    this.setData({ ps, cs });
    this.recompute();
    this.recomputeCalc();
  },

  /* ---------- 决策页 ---------- */
  onTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); },
  toggleParams() { this.setData({ showParams: !this.data.showParams }); },

  onMainSlider(e) {
    const k = e.currentTarget.dataset.key;
    const raw = e.detail.value;
    const p = this.data.p;
    if (k === 'price') p.price = raw;          // 300–600,步长 5
    if (k === 'wife') p.wife = raw / 10;       // 滑杆 15–50 → 1.5–5.0
    if (k === 'rstar') p.rStar = raw / 10;     // 滑杆 10–150 → 1.0–15.0
    this.setData({ p });
    this.recompute();
  },

  onParamInput(e) {
    const k = e.currentTarget.dataset.key;
    const val = e.detail.value;
    const ps = this.data.ps; ps[k] = val;
    const n = parseFloat(val);
    const patch = { ps };
    if (isFinite(n) && n >= 0) { const p = this.data.p; p[k] = n; patch.p = p; }
    this.setData(patch);
    this.recompute();
  },

  onPreset(e) {
    const q = Number(e.currentTarget.dataset.q);
    const p = this.data.p; p.fundQuota = q;
    const ps = this.data.ps; ps.fundQuota = String(q);
    this.setData({ p, ps });
    this.recompute();
  },

  onOver140(e) {
    const p = this.data.p; p.over140 = e.detail.value;
    this.setData({ p });
    this.recompute();
  },

  recompute() {
    const p = this.data.p;
    const d = M.computeDecision(p);

    const vd = VERDICT[d.verdict];
    let verdictSub = '';
    if (d.verdict === 'comfort') verdictSub = '月结余 +' + yuan0(d.surplus) + ' 元 · 投资收益为纯加分项';
    if (d.verdict === 'edge') verdictSub = '月结余 +' + yuan0(d.surplus) + ' 元 · 建议下调总价或确认收入上沿';
    if (d.verdict === 'reliant') verdictSub = '月缺口 ' + yuan0(d.surplus) + ' 元 · 与安全目标冲突';
    if (d.verdict === 'redline') verdictSub = '不稳定的投资收益被焊进生存现金流';
    if (d.verdict === 'nocash') verdictSub = '缺口 ' + wan(-d.remainA) + ' 万';

    const ratioPct = d.ratio * 100;
    const ratioCls = ratioPct <= 45 ? 'ok' : (ratioPct <= 55 ? 'warn' : 'bad');

    // 路径 B 提示
    let bWarn = '';
    if (d.remainB < 0) bWarn = '现金不足以走此路径';
    else if (d.remainB < p.cushionT) bWarn = '留存 ' + wan(d.remainB) + ' 万,已低于安全垫目标';

    // NPV 文案
    const npvWan = d.npvDiff / 1e4;
    let npvLine, npvCls;
    if (d.commLoan <= 0.0001) {
      npvLine = '当前总价下公积金额度已覆盖全部贷款,两条路径相同。';
      npvCls = 'tie';
    } else if (Math.abs(npvWan) < 0.5) {
      npvLine = 'r* = ' + pct1(p.rStar) + '% 时两条路径基本打平(差 ' + wan(npvWan) + ' 万)';
      npvCls = 'tie';
    } else if (npvWan > 0) {
      npvLine = 'r* = ' + pct1(p.rStar) + '%:路径 A 净现值领先 +' + wan(npvWan)
        + ' 万 — 留住现金按 r* 增值,快过 ' + p.commRate + '% 的商贷成本';
      npvCls = 'pa';
    } else {
      npvLine = 'r* = ' + pct1(p.rStar) + '%:路径 B 净现值领先 +' + wan(-npvWan)
        + ' 万 — 境内收益跑不过商贷利率,先消灭商贷更划算';
      npvCls = 'pb';
    }

    const v = {
      priceStr: String(p.price),
      wifeStr: p.wife.toFixed(1),
      rStarStr: p.rStar.toFixed(1),
      priceSlider: p.price,
      wifeSlider: Math.round(p.wife * 10),
      rStarSlider: Math.round(p.rStar * 10),
      pricePct: (((p.price - 300) / 300) * 100).toFixed(1),

      verdictKey: d.verdict,
      verdictWord: vd.word,
      verdictLine: vd.line,
      verdictSub,

      loanLine: '公积金 ' + wan(d.fundLoan) + ' 万 @' + p.fundRate
        + '% + 商贷 ' + wan(d.commLoan) + ' 万 @' + p.commRate + '%',
      pmtTotal: yuan(d.pmtTotal),
      pmtFund: yuan(d.pmtFund),
      pmtComm: yuan(d.pmtComm),
      ratio: pct1(ratioPct),
      ratioCls,
      surplusStr: (d.surplus >= 0 ? '+' : '') + yuan0(d.surplus),
      surplusCls: d.surplus >= 3000 ? 'ok' : (d.surplus >= 0 ? 'warn' : 'bad'),
      oneTime: wan(d.oneTimeA),
      oneTimeSub: '首付 ' + wan(d.downA) + ' + 契税 ' + wan(d.deedTax) + ' + 杂费 ' + wan(p.misc),
      remain: wan(d.remainA),
      cushionStr: wan(d.cushionA),
      cushionMonths: d.cushionMonthsA.toFixed(1),
      invest: wan(d.investA),
      cushionWarn: d.cushionUnderfunded,

      a: {
        down: wan(d.downA), oneTime: wan(d.oneTimeA),
        pmt: yuan(d.pmtTotal), remain: wan(d.remainA),
        months: d.cushionMonthsA.toFixed(1),
      },
      b: {
        down: wan(d.downB), oneTime: wan(d.oneTimeB),
        pmt: yuan(d.pmtB), remain: wan(d.remainB),
        months: d.cushionMonthsB.toFixed(1),
        warn: bWarn,
      },
      npvLine, npvCls,
      breakeven: '盈亏临界点恰为商贷利率 ' + p.commRate + '%:r* 高于它 → A 占优;低于它 → B 占优。',
    };
    this.setData({ v });
  },

  /* ---------- 测算页 ---------- */
  onCalcInput(e) {
    const k = e.currentTarget.dataset.key;
    const val = e.detail.value;
    const cs = this.data.cs; cs[k] = val;
    const n = parseFloat(val);
    const patch = { cs };
    if (isFinite(n) && n >= 0) { const c = this.data.c; c[k] = n; patch.c = c; }
    this.setData(patch);
    this.recomputeCalc();
  },

  onMethod(e) {
    const c = this.data.c; c.method = e.currentTarget.dataset.m;
    this.setData({ c });
    this.recomputeCalc();
  },

  recomputeCalc() {
    const c = this.data.c;
    const r = M.computeCalc(c);
    const isA = c.method === 'annuity';
    const cv = {
      isAnnuity: isA,
      down: wan(r.down),
      loanTotal: wan(r.loanTotal),
      fundLoan: wan(r.fundLoan),
      commLoan: wan(r.commLoan),
      weightedRate: r.weightedRate.toFixed(3),
      pmtFund: yuan(r.pmtFund),
      pmtComm: yuan(r.pmtComm),
      pmtTotal: yuan(r.pmtTotal),
      monthlyDec: yuan(r.monthlyDec),
      lastPay: yuan(r.lastPay),
      totalInterest: wan(r.totalInterest / 1e4),
      totalPayment: wan(r.totalPayment / 1e4),
      n: r.n,
    };
    if (isA) {
      cv.otherLine = '若改用等额本金:总利息 ' + wan(r.principalInterest / 1e4)
        + ' 万,省 ' + wan(r.interestDiff / 1e4) + ' 万;代价是首月月供 '
        + yuan(r.firstPay) + ' 元';
    } else {
      const ra = M.computeCalc(Object.assign({}, c, { method: 'annuity' }));
      cv.otherLine = '若改用等额本息:月供恒为 ' + yuan(ra.pmtTotal)
        + ' 元,总利息 ' + wan(ra.totalInterest / 1e4) + ' 万,多付 '
        + wan(r.interestDiff / 1e4) + ' 万';
    }
    this.setData({ cv });
  },
});
