/* 在 node 中模拟小程序 Page,对页面逻辑做端到端单测 */
global.Page = (cfg) => { global.__cfg = cfg; };
require('../pages/index/index.js');

const cfg = global.__cfg;
const inst = Object.create(cfg);
inst.data = JSON.parse(JSON.stringify(cfg.data));
inst.setData = function (patch) { Object.assign(this.data, patch); };
const ev = (key, value) => ({ currentTarget: { dataset: { key } }, detail: { value } });
const slider = (key, value) => inst.onMainSlider({ currentTarget: { dataset: { key } }, detail: { value } });

let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS', name, extra || '');
  else { console.log('FAIL', name, extra || ''); fails++; }
}

inst.onLoad();
let v = inst.data.v;

// 资产负债表恒等式与分段
check('判定=结构稳健', v.verdictKey === 'comfort' && v.verdictWord === '结构稳健', v.verdictWord);
check('总资产 993', v.bs.vAssets === '994' || v.bs.vAssets === '993', v.bs.vAssets);
check('净资产 658', v.bs.vEquity === '658', v.bs.vEquity);
check('恒等式 资产=负债+权益',
  Math.round(Number(v.bs.vDebt) + Number(v.bs.vEquity)) === Math.round(Number(v.bs.vAssets)),
  v.bs.vAssets + ' = ' + v.bs.vDebt + ' + ' + v.bs.vEquity);
// 分段高度之和(资产侧)≈100
const aSum = ['hHouse','hCushion','hDom','hOff'].reduce((s,k)=>s+Number(v.bs[k]),0);
const lSum = ['hFund','hComm','hEquity'].reduce((s,k)=>s+Number(v.bs[k]),0);
check('资产侧分段≈100%', Math.abs(aSum-100) < 0.5, aSum.toFixed(2));
check('负债权益侧分段≈100%', Math.abs(lSum-100) < 0.5, lSum.toFixed(2));

// 核心比率
check('WACC 2.770%', v.wacc === '2.770', v.wacc);
check('DSCR 2.18', v.dscr === '2.18', v.dscr);
check('全口径覆盖 1.26', v.coverage === '1.26', v.coverage);
check('房产杠杆 5.0', v.assetLev === '5.0', v.assetLev);
check('家庭杠杆 1.51', v.hhLev === '1.51', v.hhLev);

// 息差拆分
check('锁定息差 +1.23pp 正向', v.lockedCarry === '+1.23' && v.lcCls === 'pos', v.lockedCarry + ' ' + v.lcWord);
check('权益溢价 +27.23pp', v.equityPremium === '+27.23', v.equityPremium);
check('NPV@4% 保留商贷占优', v.npvCls === 'pos' && v.npvLine.indexOf('14.1') >= 0, v.npvLine);

// 看跌期权(安全垫)
check('看跌保费 1.6 万', v.putPremium === '1.6', v.putPremium);
check('保护 33.7 月', v.putMonths === '33.7', v.putMonths);

// 人力资本覆盖
check('固收腿托底', v.hcCovers === true, '票息' + v.hcCouponYuan + ' vs 固定' + v.hcFixedYuan);

// 久期匹配:默认匹配,切经营贷后错配
check('默认久期匹配', v.durMatched === true && v.durLiab === 30);
inst.onDurMode({ currentTarget: { dataset: { m: 'biz' } } });
check('经营贷→错配', inst.data.v.durMatched === false && inst.data.v.durLiab === 3, '负债久期 ' + inst.data.v.durLiab);
inst.onDurMode({ currentTarget: { dataset: { m: 'mortgage' } } });

// r* 拖到 2% → 砍商贷占优;权益溢价变化
slider('rstar', 20);
check('r*=2% 砍商贷占优', inst.data.v.npvCls === 'neg', inst.data.v.npvLine);
check('r*=2% 锁定息差转负', inst.data.v.lcCls === 'neg', inst.data.v.lockedCarry);
slider('rstar', 40);

// 价格 500 + 收入 2.4万 → 依赖α;区带变色
slider('price', 500);
slider('wife', 24);
check('500万&2.4万 → 依赖α/越线', ['reliant','redline'].indexOf(inst.data.v.verdictKey) >= 0, inst.data.v.verdictKey + ' ' + inst.data.v.verdictSub);
check('总价区带=稳健上限', inst.data.v.zoneCls === 'warn', inst.data.v.zoneLabel);
slider('price', 600);
check('600万→红线区', inst.data.v.zoneCls === 'bad', inst.data.v.zoneLabel);

// 现金不足
inst.onParamInput(ev('available', '100'));
check('股本不足', inst.data.v.verdictKey === 'nocash', inst.data.v.verdictSub);
inst.onParamInput(ev('available', '380'));
slider('price', 420); slider('wife', 30);

// 公积金预设
inst.onPreset({ currentTarget: { dataset: { q: '114' } } });
check('预设114', inst.data.p.fundQuota === 114 && inst.data.v.bs.vComm !== '0', '商贷 ' + inst.data.v.bs.vComm);
inst.onPreset({ currentTarget: { dataset: { q: '209' } } });

// 非法输入
const before = inst.data.p.offshore;
inst.onParamInput(ev('offshore', ''));
check('空输入保留原值', inst.data.p.offshore === before && inst.data.ps.offshore === '');
inst.onParamInput(ev('offshore', '285'));

// >140 契税
inst.onOver140({ detail: { value: true } });
check('契税1.5%不崩', isFinite(Number(inst.data.v.wacc)) && inst.data.v.bs.vEquity !== undefined);
inst.onOver140({ detail: { value: false } });

// 测算页
inst.onCalcInput(ev('price', '400'));
check('测算月供400万', inst.data.cv.pmtTotal === '13,076.89', inst.data.cv.pmtTotal);
inst.onMethod({ currentTarget: { dataset: { m: 'principal' } } });
check('等额本金首月', inst.data.cv.pmtTotal === '16,238.47', inst.data.cv.pmtTotal);

// Excel 锚点回归
const F = require('../utils/finance.js');
check('PMT 引擎锚点', Math.abs(F.pmt(0.033/12,270,1760452.12)).toFixed(10) === '9246.2109633522',
  Math.abs(F.pmt(0.033/12,270,1760452.12)).toFixed(10));

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
