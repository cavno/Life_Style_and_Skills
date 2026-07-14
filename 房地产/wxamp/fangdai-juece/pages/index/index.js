const M = require('../../utils/model.js');

/* ============================================================
 * 默认参数 —— 把家庭当成一家"无限责任公司",这些是它的开账口径。
 * 改这里即改打开时的默认值;界面"参数"区可随时覆盖。
 * ------------------------------------------------------------
 * price/wife          房产总价(万)/ 妻子税后月收入(万/月)
 * available           可用人民币 = 现金 350 + 卖旧房净得约 30
 * offshore            境外美股市值(万,RMB 计;受结汇额度限制)
 * fundQuota           公积金可贷额度(万):209=家庭(110×1.9);114=妻子单独;260=待核实
 * fundRate/commRate   公积金 / 商贷年利率 %(商贷=LPR3.5−45BP)
 * downPct/years       首付比例下限 % / 年限
 * living              非房月支出(万/月)
 * cushionT/misc       安全垫目标(万)/ 中介评估杂费(万)
 * rStar               境内再投资年化 %(锁定息差的一端;驱动 A/B 净现值)
 * equityER            美股预期年化 %(风险溢价,非套利、不可锁定、受结汇限制)
 * riskFree            国债/大额存单 %(安全垫所在,看跌"保费"的基准)
 * over140             建面是否 >140㎡(契税 1% → 1.5%)
 * ============================================================ */
const DEFAULTS = {
  price: 420, wife: 3.0, available: 380, offshore: 285,
  fundQuota: 209, fundRate: 2.6, commRate: 3.05,
  downPct: 20, years: 30, living: 1.0, cushionT: 80, misc: 3,
  rStar: 4.0, equityER: 30, riskFree: 2.0, over140: false,
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
const yuan = (x) => thousands(x, 2);
const yuan0 = (x) => thousands(x, 0);
const wan = (x) => thousands(x, 1);
const wan0 = (x) => thousands(x, 0);
const pp = (x) => (x >= 0 ? '+' : '') + thousands(x, 2);

const VERDICT = {
  comfort: { word: '结构稳健', line: '固收腿(妻子税后)独立托起全部固定支出,权益收益是纯 α' },
  edge:    { word: '临界',    line: '固收腿恰好覆盖月供与生活,缓冲所剩无几' },
  reliant: { word: '依赖 α',  line: '固收腿覆盖月供但托不住生活下限,需权益收益补口' },
  redline: { word: '偿付越线', line: 'DSCR < 1:月供已超过固收腿的票息(妻子税后收入)' },
  nocash:  { word: '股本不足', line: '一次性股本投入超过可用人民币,首付无法到位' },
};

Page({
  data: {
    tab: 'sheet',
    showParams: false,
    durMode: 'mortgage',   // 久期匹配演示:mortgage 30年 | biz 经营贷
    p: Object.assign({}, DEFAULTS),
    ps: {},
    c: Object.assign({}, CALC_DEFAULTS),
    cs: {},
    v: {},
    cv: {},
  },

  onLoad() {
    const ps = {}, cs = {};
    ['available', 'offshore', 'fundQuota', 'fundRate', 'commRate', 'downPct',
     'years', 'living', 'cushionT', 'misc', 'equityER', 'riskFree']
      .forEach(k => ps[k] = String(DEFAULTS[k]));
    ['price', 'downPct', 'fundQuota', 'fundRate', 'commRate', 'years']
      .forEach(k => cs[k] = String(CALC_DEFAULTS[k]));
    this.setData({ ps, cs });
    this.recompute();
    this.recomputeCalc();
  },

  onTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); },
  toggleParams() { this.setData({ showParams: !this.data.showParams }); },
  onDurMode(e) { this.setData({ durMode: e.currentTarget.dataset.m }); this.recompute(); },

  onMainSlider(e) {
    const k = e.currentTarget.dataset.key;
    const raw = e.detail.value;
    const p = this.data.p;
    if (k === 'price') p.price = raw;
    if (k === 'wife') p.wife = raw / 10;
    if (k === 'rstar') p.rStar = raw / 10;
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
    const T = d.totalAssets || 1;

    // 资产负债表分段高度(%),资产侧与"负债+权益"侧总高相等 → 直观呈现恒等式
    const seg = (x) => (Math.max(0, x) / T * 100).toFixed(2);

    const vd = VERDICT[d.verdict];
    let verdictSub;
    if (d.verdict === 'comfort') verdictSub = '全口径覆盖 ' + d.coverage.toFixed(2) + '× · 月结余 +' + yuan0(d.surplus) + ' 元';
    else if (d.verdict === 'edge') verdictSub = '全口径覆盖 ' + d.coverage.toFixed(2) + '× · 月结余 +' + yuan0(d.surplus) + ' 元';
    else if (d.verdict === 'reliant') verdictSub = 'DSCR ' + d.dscr.toFixed(2) + '× 仍≥1,但月缺口 ' + yuan0(d.surplus) + ' 元须由权益腿补';
    else if (d.verdict === 'redline') verdictSub = 'DSCR ' + d.dscr.toFixed(2) + '× · 不稳定的 α 被焊进生存现金流';
    else verdictSub = '缺口 ' + wan(-d.remainA) + ' 万';

    const zoneLabel = { in: '总价处于建议区(≤450)', cap: '总价处于稳健上限区(450–500)', over: '总价已越红线(>500)' }[d.priceZone];
    const zoneCls = { in: 'ok', cap: 'warn', over: 'bad' }[d.priceZone];

    // 息差判定(锁定息差 = r* − 加权债务成本)
    const lc = d.lockedCarry;
    const lcCls = lc > 0.05 ? 'pos' : (lc < -0.05 ? 'neg' : 'flat');
    const lcWord = lc > 0.05 ? '正向套利' : (lc < -0.05 ? '负向(借贷更贵)' : '基本打平');

    // NPV(A−B)
    const npvWan = d.npvDiff / 1e4;
    let npvLine, npvCls;
    if (d.commLoan <= 0.0001) { npvLine = '公积金额度已覆盖全部贷款,无商贷可调,A/B 相同。'; npvCls = 'tie'; }
    else if (Math.abs(npvWan) < 0.5) { npvLine = 'r* = ' + p.rStar.toFixed(1) + '% 时两条路径基本打平(差 ' + wan(npvWan) + ' 万)。'; npvCls = 'tie'; }
    else if (npvWan > 0) { npvLine = 'r* = ' + p.rStar.toFixed(1) + '%:保留商贷(A)净现值领先 +' + wan(npvWan) + ' 万 — 留住的现金按 r* 增值快过 ' + p.commRate + '% 商贷成本。'; npvCls = 'pos'; }
    else { npvLine = 'r* = ' + p.rStar.toFixed(1) + '%:砍掉商贷(B)净现值领先 +' + wan(-npvWan) + ' 万 — 境内收益跑不过商贷利率,先还债更划算。'; npvCls = 'neg'; }

    // 久期匹配演示
    const liabDur = this.data.durMode === 'mortgage' ? 30 : 3;
    const durMatched = liabDur >= 20;
    const durLiabPct = (liabDur / 30 * 100).toFixed(1);

    const v = {
      priceStr: String(p.price),
      wifeStr: p.wife.toFixed(1),
      rStarStr: p.rStar.toFixed(1),
      priceSlider: p.price,
      wifeSlider: Math.round(p.wife * 10),
      rStarSlider: Math.round(p.rStar * 10),
      zoneLabel, zoneCls,

      verdictKey: d.verdict, verdictWord: vd.word, verdictLine: vd.line, verdictSub,

      // 资产负债表
      bs: {
        hHouse: seg(d.aHouse), hCushion: seg(d.aCushion),
        hDom: seg(d.aDomestic), hOff: seg(d.aOffshore),
        hFund: seg(d.fundLoan), hComm: seg(d.commLoan), hEquity: seg(d.equity),
        vHouse: wan0(d.aHouse), vCushion: wan0(d.aCushion),
        vDom: wan0(d.aDomestic), vOff: wan0(d.aOffshore),
        vFund: wan0(d.fundLoan), vComm: wan0(d.commLoan), vEquity: wan0(d.equity),
        vAssets: wan0(d.totalAssets), vDebt: wan0(d.debtTotal),
      },

      // 核心比率
      wacc: d.wacc.toFixed(3),
      dscr: d.dscr.toFixed(2),
      coverage: d.coverage.toFixed(2),
      coverageCls: d.coverage >= 1.2 ? 'ok' : (d.coverage >= 1 ? 'warn' : 'bad'),
      dscrCls: d.dscr >= 1.5 ? 'ok' : (d.dscr >= 1 ? 'warn' : 'bad'),
      assetLev: isFinite(d.assetLeverage) ? d.assetLeverage.toFixed(1) : '—',
      hhLev: isFinite(d.hhLeverage) ? d.hhLeverage.toFixed(2) : '—',
      pmtTotal: yuan(d.pmtTotal),
      surplusStr: (d.surplus >= 0 ? '+' : '') + yuan0(d.surplus),
      surplusCls: d.surplus >= 3000 ? 'ok' : (d.surplus >= 0 ? 'warn' : 'bad'),

      // 息差
      lockedCarry: pp(lc), lcCls, lcWord,
      equityPremium: pp(d.equityPremium),
      waccForCarry: d.wacc.toFixed(2),
      equityERStr: p.equityER.toFixed(0),
      npvLine, npvCls,

      // 久期
      durLiab: liabDur, durLiabPct, durMatched,
      durMode: this.data.durMode,

      // 看跌期权(安全垫)
      putPremium: wan(d.putPremium),
      putMonths: d.putProtectMonths.toFixed(1),
      cushionStr: wan(d.cushionA),
      cushionWarn: d.cushionUnderfunded,

      // 人力资本
      hcCouponYuan: yuan0(p.wife * 1e4),
      hcFixedYuan: yuan0(d.pmtTotal + p.living * 1e4),
      hcCovers: d.coverage >= 1,
      hcSurplus: (d.surplus >= 0 ? '+' : '') + yuan0(d.surplus),

      // 两条路径(给净现值卡用)
      a: { pmt: yuan(d.pmtTotal), down: wan(d.downA), remain: wan(d.remainA) },
      b: { pmt: yuan(d.pmtB), down: wan(d.downB), remain: wan(d.remainB),
           warn: d.remainB < 0 ? '现金不足以走此路径' : (d.remainB < p.cushionT ? '留存低于安全垫目标' : '') },

      offshoreNote: d.aOffshore > 0,
    };
    this.setData({ v });
  },

  /* ---------- 测算页(贷款引擎) ---------- */
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
      down: wan(r.down), loanTotal: wan(r.loanTotal),
      fundLoan: wan(r.fundLoan), commLoan: wan(r.commLoan),
      weightedRate: r.weightedRate.toFixed(3),
      pmtFund: yuan(r.pmtFund), pmtComm: yuan(r.pmtComm), pmtTotal: yuan(r.pmtTotal),
      monthlyDec: yuan(r.monthlyDec), lastPay: yuan(r.lastPay),
      totalInterest: wan(r.totalInterest / 1e4), totalPayment: wan(r.totalPayment / 1e4),
      n: r.n,
    };
    if (isA) {
      cv.otherLine = '若改用等额本金:总利息 ' + wan(r.principalInterest / 1e4)
        + ' 万,省 ' + wan(r.interestDiff / 1e4) + ' 万;代价是首月月供 ' + yuan(r.firstPay) + ' 元';
    } else {
      const ra = M.computeCalc(Object.assign({}, c, { method: 'annuity' }));
      cv.otherLine = '若改用等额本息:月供恒为 ' + yuan(ra.pmtTotal)
        + ' 元,总利息 ' + wan(ra.totalInterest / 1e4) + ' 万,多付 ' + wan(r.interestDiff / 1e4) + ' 万';
    }
    this.setData({ cv });
  },
});
