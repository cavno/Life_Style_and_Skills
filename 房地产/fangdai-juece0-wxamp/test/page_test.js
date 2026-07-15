/* 在 node 中模拟小程序 Page,对页面逻辑做端到端单测 */
global.Page = (cfg) => { global.__cfg = cfg; };
require('../pages/index/index.js');

const cfg = global.__cfg;
const inst = Object.create(cfg);
inst.data = JSON.parse(JSON.stringify(cfg.data));
inst.setData = function (patch) { Object.assign(this.data, patch); };

const ev = (key, value) => ({ currentTarget: { dataset: { key } }, detail: { value } });

let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS', name, extra || '');
  else { console.log('FAIL', name, extra || ''); fails++; }
}

// 1. onLoad 默认态
inst.onLoad();
let v = inst.data.v;
check('默认月供', v.pmtTotal === '13,755.78', v.pmtTotal);
check('默认判定', v.verdictKey === 'comfort', v.verdictKey);
check('NPV@4% A 占优', v.npvCls === 'pa' && v.npvLine.indexOf('14.1') >= 0, v.npvLine);
check('一次性拆分', v.oneTimeSub === '首付 84.0 + 契税 4.2 + 杂费 3.0', v.oneTimeSub);
check('安全垫月数', v.cushionMonths === '33.7', v.cushionMonths);
check('路径B留存', v.b.remain === '161.8', v.b.remain);
check('价格标记位置', v.pricePct === '40.0', v.pricePct);

// 2. 拖价格到 500、收入到 2.4 万 → 依赖投资
inst.onMainSlider({ currentTarget: { dataset: { key: 'price' } }, detail: { value: 500 } });
inst.onMainSlider({ currentTarget: { dataset: { key: 'wife' } }, detail: { value: 24 } });
v = inst.data.v;
check('500万&2.4万收入 → reliant', v.verdictKey === 'reliant', v.verdictKey + ' ' + v.verdictSub);
check('占比标红', v.ratioCls === 'bad', v.ratio + '% ' + v.ratioCls);

// 3. r* 拖到 2% → 路径 B 占优
inst.onMainSlider({ currentTarget: { dataset: { key: 'rstar' } }, detail: { value: 20 } });
v = inst.data.v;
check('NPV@2% B 占优', v.npvCls === 'pb', v.npvLine);

// 4. 公积金预设 114(仅妻子)
inst.onPreset({ currentTarget: { dataset: { q: '114' } } });
v = inst.data.v;
check('预设114生效', inst.data.p.fundQuota === 114 && v.loanLine.indexOf('114.0') >= 0, v.loanLine);

// 5. 非法输入不崩、不污染数值
const miscBefore = inst.data.p.misc;
inst.onParamInput(ev('misc', ''));
check('空输入保留原值', inst.data.p.misc === miscBefore && inst.data.ps.misc === '');
inst.onParamInput(ev('misc', '3.5'));
check('正常输入生效', inst.data.p.misc === 3.5);

// 6. >140㎡ 契税切换
inst.onOver140({ detail: { value: true } });
check('契税1.5%', inst.data.v.oneTimeSub.indexOf('契税 7.5') >= 0, inst.data.v.oneTimeSub); // 500×1.5%=7.5

// 7. 现金不足判定:总价拉满 600、可用资金改 100
inst.onParamInput(ev('available', '100'));
inst.onMainSlider({ currentTarget: { dataset: { key: 'price' } }, detail: { value: 600 } });
check('现金不足', inst.data.v.verdictKey === 'nocash', inst.data.v.verdictSub);

// 8. 测算页:等额本息/本金切换
inst.onCalcInput(ev('price', '400'));
let cv = inst.data.cv;
check('测算月供(400万)', cv.pmtTotal === '13,076.89', cv.pmtTotal);
inst.onMethod({ currentTarget: { dataset: { m: 'principal' } } });
cv = inst.data.cv;
check('等额本金首月', cv.pmtTotal === '16,238.47', cv.pmtTotal);
check('递减额', cv.monthlyDec === '20.42', cv.monthlyDec);
check('对比文案含本息', cv.otherLine.indexOf('等额本息') >= 0, cv.otherLine);

// 9. 公积金额度 ≥ 贷款总额 → 两路径相同提示
inst.onCalcInput(ev('price', '250')); // 测算页无影响,决策页验证:
inst.onParamInput(ev('available', '380'));
inst.onParamInput(ev('fundQuota', '300'));
inst.onMainSlider({ currentTarget: { dataset: { key: 'price' } }, detail: { value: 300 } });
check('两路径相同', inst.data.v.npvCls === 'tie' && inst.data.v.npvLine.indexOf('相同') >= 0, inst.data.v.npvLine);

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
