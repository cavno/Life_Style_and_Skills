const D = require('./data.js');
const DATA = D.DATA;
const DISTRICTS = D.DISTRICTS;

const YEARS = {
  primary: ['2022', '2023', '2024', '2025'],
  middle: ['2020', '2021', '2022', '2023', '2024', '2025']
};
const TYPES = ['全部', '公办', '民办'];
const SORTS = [
  { key: 'score_desc', label: '最新积分 高→低' },
  { key: 'score_asc', label: '最新积分 低→高' },
  { key: 'area', label: '按片区' }
];
const SORT_LABELS = SORTS.map(function (s) { return s.label; });
const COMP_CLASS = { '极热门': 'b-vhot', '热门': 'b-hot', '较热': 'b-warm', '一般': 'b-mid', '门槛较低': 'b-low' };
// 各区评分尺度不同，竞争度分档按区设定 [极热门,热门,较热,一般]
const BANDS = { '南山': [85, 75, 70, 66], '福田': [92, 85, 78, 73], '_default': [100, 90, 75, 66] };
const PALETTE = ['#b8860b', '#3457a6', '#2d6a2d', '#a6346a', '#0c5460', '#9a4a00', '#6a3a8a', '#c0392b'];

// 官方全量数据：龙岗区教育局《2025-2026学年幼儿园办学基本信息表》(lg.gov.cn 2026-06-09) — 474 所
const KG = require('./kg-data.js');
const KG_NATURES = ['全部', '公办', '普惠性民办', '非普惠性民办'];
const STAGE_NOTE = {
  primary: '小一录取积分（龙岗较完整；宝安/南山/福田为代表性样本；罗湖为类别+积分样本）。公办锁片区、民办面向全区。各区评分尺度不同，竞争度按区分别划定。',
  middle: '初一录取积分（龙岗、宝安较完整；南山/福田为代表性样本；龙华/罗湖为类别+积分制，单独标记）。带小学部的民办初中可直升。深圳严禁公布升学率，故只含可溯源的录取积分线。'
};

// 龙岗区积分入学模型（第一类A–第七类）；rate 0.05/月，优享 +2.5
const CAT = [
  { key: '1A', label: '第一类A', base: 100, bonus: 'property', desc: '龙岗户籍 + 学区自购商品房' },
  { key: '1B', label: '第一类B', base: 100, bonus: 'hukou', desc: '学区户籍 + 学区祖屋/租屋' },
  { key: '2', label: '第二类', base: 95, bonus: 'property', desc: '深圳其他区户籍 + 学区自购商品房' },
  { key: '3', label: '第三类', base: 90, bonus: 'hukou_rent', desc: '学区户籍 + 特殊住房等' },
  { key: '4', label: '第四类', base: 80, bonus: 'social', desc: '非深圳户籍 + 学区自购商品房' },
  { key: '5', label: '第五类', base: 75, bonus: 'hukou_rent', desc: '龙岗户籍 + 学区租房/特殊住房' },
  { key: '6', label: '第六类', base: 70, bonus: 'hukou_rent', desc: '深圳其他区户籍 + 学区租房/特殊住房' },
  { key: '7', label: '第七类', base: 60, bonus: 'rent_social', desc: '非深圳户籍 + 学区租房/特殊住房' }
];

function monthsBetween(dateStr, refStr) {
  if (!dateStr || !refStr) return 0;
  const d = new Date(dateStr.replace(/-/g, '/'));
  const r = new Date(refStr.replace(/-/g, '/'));
  if (isNaN(d.getTime()) || isNaN(r.getTime()) || d >= r) return 0;
  return (r.getFullYear() - d.getFullYear()) * 12 + (r.getMonth() - d.getMonth());
}

function latestNum(s, stage) {
  if (s.fmt !== 'num') return null;
  const ys = YEARS[stage];
  for (let i = ys.length - 1; i >= 0; i--) {
    const v = s.scores[ys[i]];
    if (typeof v === 'number') return v;
  }
  return null;
}
function compLevel(s, stage) {
  if (s.fmt === 'cat') return '类别制';
  const v = latestNum(s, stage);
  if (v == null) return '';
  const b = BANDS[s.district] || BANDS['_default'];
  if (v >= b[0]) return '极热门';
  if (v >= b[1]) return '热门';
  if (v >= b[2]) return '较热';
  if (v >= b[3]) return '一般';
  return '门槛较低';
}
function stageLabel(st) { return st === 'primary' ? '小一' : '初一'; }

Page({
  data: {
    tab: 'primary',
    district: '全部',
    area: '全部',
    comp: '全部',
    only9: false,
    search: '',
    typeIdx: 0,
    sortIdx: 0,
    types: TYPES,
    sortLabels: SORT_LABELS,
    distChips: [],
    areaChips: ['全部'],
    compChips: ['全部', '极热门', '热门', '较热', '一般', '门槛较低'],
    displayRows: [],
    count: 0,
    yearsLen: 4,
    stageNote: STAGE_NOTE.primary,
    selectedCount: 0,
    showCompare: false,
    compareCols: [],
    compareTable: [],
    chartHasData: false,

    // 积分计算（龙岗模型）
    catList: CAT,
    calcCatIdx: -1,
    calcCatDesc: '',
    refDate: '2026-04-30',
    propertyDate: '',
    hukouDate: '',
    rentDate: '',
    socialMonths: '',
    youxiang: false,
    needProperty: false,
    needHukou: false,
    needRent: false,
    needSocial: false,
    calcResult: null,
    assessStage: 'primary',
    assessRows: [],

    // 幼儿园（龙岗）— 官方信息表查询/对比
    kgArea: '全部',
    kgNature: '全部',
    kgNatureChips: KG_NATURES,
    kgCommIdx: 0,
    kgCommList: ['全部'],
    kgSortIdx: 0,
    kgSortLabels: ['按街道·社区', '热度参考 高→低', '保教费 低→高', '保教费 高→低'],
    kgSearch: '',
    kgAreaChips: ['全部'],
    kgRows: [],
    kgCount: 0,
    kgSelCount: 0,
    showKgCompare: false,
    kgCmpCols: [],
    kgCmpRows: []
  },

  onLoad: function () {
    this.selSet = new Set();
    this.kgSel = new Set();
    this._chart = null;
    const kgAreas = ['全部'];
    KG.forEach(function (k) { if (kgAreas.indexOf(k.st) < 0) kgAreas.push(k.st); });
    this.setData({ kgAreaChips: kgAreas });
    this.refreshChips();
    this.applyFilters();
    this.kgApply();
  },

  // ---- chips ----
  refreshChips: function () {
    const tab = this.data.tab;
    const dist = this.data.district;
    const distChips = ['全部'].concat(DISTRICTS[tab] || []);
    const areaSet = [];
    DATA[tab].forEach(function (s) {
      if (dist !== '全部' && s.district !== dist) return;
      if (s.area && areaSet.indexOf(s.area) < 0) areaSet.push(s.area);
    });
    const areaChips = ['全部'].concat(areaSet);
    this.setData({ distChips: distChips, areaChips: areaChips });
  },

  switchTab: function (e) {
    const t = e.currentTarget.dataset.t;
    if (t === 'doc' || t === 'calc' || t === 'kg') { this.setData({ tab: t }); return; }
    this.setData({ tab: t, district: '全部', area: '全部', comp: '全部', stageNote: STAGE_NOTE[t] });
    this.refreshChips();
    this.applyFilters();
  },
  setDist: function (e) {
    this.setData({ district: e.currentTarget.dataset.v, area: '全部' });
    this.refreshChips();
    this.applyFilters();
  },
  setArea: function (e) {
    this.setData({ area: e.currentTarget.dataset.v });
    this.applyFilters();
  },
  setComp: function (e) {
    this.setData({ comp: e.currentTarget.dataset.v });
    this.applyFilters();
  },
  onTypeChange: function (e) {
    this.setData({ typeIdx: parseInt(e.detail.value, 10) });
    this.applyFilters();
  },
  onSortChange: function (e) {
    this.setData({ sortIdx: parseInt(e.detail.value, 10) });
    this.applyFilters();
  },
  toggle9: function () {
    this.setData({ only9: !this.data.only9 });
    this.applyFilters();
  },
  onSearch: function (e) {
    this.setData({ search: e.detail.value });
    this.applyFilters();
  },

  // ---- filtering + display ----
  applyFilters: function () {
    const d = this.data;
    const tab = d.tab;
    if (tab === 'doc' || tab === 'calc' || tab === 'kg') return;
    const type = TYPES[d.typeIdx];
    const ys = YEARS[tab];
    const district = d.district, area = d.area, comp = d.comp, only9 = d.only9, search = d.search;

    let list = DATA[tab].filter(function (s) {
      if (district !== '全部' && s.district !== district) return false;
      if (area !== '全部' && s.area !== area) return false;
      if (type !== '全部' && s.type !== type) return false;
      if (only9 && !s.is9) return false;
      if (comp !== '全部') {
        if (s.fmt !== 'num') return false;
        if (compLevel(s, tab) !== comp) return false;
      }
      if (search && s.name.indexOf(search) < 0) return false;
      return true;
    });

    const sortKey = SORTS[d.sortIdx].key;
    if (sortKey === 'area') {
      list.sort(function (a, b) {
        const ka = (a.district || '') + (a.area || ''), kb = (b.district || '') + (b.area || '');
        if (ka === kb) return (latestNum(b, tab) || 0) - (latestNum(a, tab) || 0);
        return ka < kb ? -1 : (ka > kb ? 1 : 0);
      });
    } else {
      const dir = sortKey === 'score_asc' ? 1 : -1;
      list.sort(function (a, b) {
        const va = latestNum(a, tab), vb = latestNum(b, tab);
        return dir * ((va == null ? -1 : va) - (vb == null ? -1 : vb));
      });
    }

    const selSet = this.selSet;
    const rows = list.map(function (s) {
      const lv = compLevel(s, tab);
      const cells = ys.map(function (y) {
        const v = s.scores[y];
        if (v == null) return { year: y, txt: '—', na: true };
        if (typeof v === 'number') return { year: y, txt: '' + v, isNum: true, barPct: Math.min(100, v / 120 * 100) };
        return { year: y, txt: v, isCat: true };
      });
      let trendTxt = '', trendCls = '';
      if (s.fmt === 'num') {
        const vals = ys.map(function (y) { return s.scores[y]; }).filter(function (v) { return typeof v === 'number'; });
        if (vals.length >= 2) {
          const diff = vals[vals.length - 1] - vals[vals.length - 2];
          trendCls = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat');
          trendTxt = '近一年 ' + (diff > 0 ? '↑' : (diff < 0 ? '↓' : '→')) + Math.abs(diff).toFixed(2);
        }
      }
      const key = tab + '|' + s.name + '|' + s.district;
      return {
        key: key,
        name: s.name,
        type: s.type,
        is9: s.is9,
        lv: lv,
        lvClass: lv === '类别制' ? 'b-cat' : (COMP_CLASS[lv] || ''),
        region: s.district + (s.area ? ' · ' + s.area : ''),
        lock: s.type === '公办' ? '锁片区' : '面向全区',
        lockCls: s.type === '公办' ? 't-lock' : 't-cross',
        cells: cells,
        trendTxt: trendTxt,
        trendCls: trendCls,
        selected: selSet.has(key)
      };
    });

    this.setData({ displayRows: rows, count: list.length, yearsLen: ys.length });
  },

  // ---- compare selection ----
  toggleSelect: function (e) {
    const k = e.currentTarget.dataset.k;
    if (this.selSet.has(k)) this.selSet.delete(k); else this.selSet.add(k);
    this.setData({ selectedCount: this.selSet.size });
    this.applyFilters();
  },
  clearAll: function () {
    this.selSet.clear();
    this.setData({ selectedCount: 0, showCompare: false });
    this.applyFilters();
  },
  noop: function () {},

  openCompare: function () {
    if (this.selSet.size < 2) return;
    const keys = [];
    this.selSet.forEach(function (k) { keys.push(k); });
    const items = keys.map(function (k) {
      const parts = k.split('|');
      const stage = parts[0], name = parts[1], dist = parts[2];
      let ref = null;
      DATA[stage].forEach(function (s) { if (s.name === name && s.district === dist) ref = s; });
      return { stage: stage, name: name, dist: dist, ref: ref };
    }).filter(function (x) { return x.ref; });

    const yset = [];
    items.forEach(function (it) {
      YEARS[it.stage].forEach(function (y) { if (it.ref.scores[y] != null && yset.indexOf(y) < 0) yset.push(y); });
    });
    yset.sort();
    const years = yset;

    const cols = items.map(function (it, i) {
      return {
        name: it.ref.name,
        tag: it.ref.district + '·' + stageLabel(it.stage),
        color: PALETTE[i % PALETTE.length],
        key: it.stage + '|' + it.name + '|' + it.dist
      };
    });

    const table = [];
    table.push({ label: '评分制', cells: items.map(function (it) { return { txt: it.ref.fmt === 'cat' ? '类别+积分' : '纯积分' }; }) });
    table.push({ label: '区·片区', cells: items.map(function (it) { return { txt: it.ref.district + (it.ref.area ? '·' + it.ref.area : '') }; }) });
    table.push({ label: '类型', cells: items.map(function (it) { return { txt: it.ref.type }; }) });
    table.push({ label: '招生模式', cells: items.map(function (it) { return { txt: it.ref.type === '公办' ? '锁片区' : '面向全区' }; }) });
    table.push({ label: '九年一贯', cells: items.map(function (it) { return { txt: it.ref.is9 ? '是' : '否' }; }) });
    table.push({ label: '竞争度', cells: items.map(function (it) { return { txt: compLevel(it.ref, it.stage) || '—' }; }) });

    years.forEach(function (y) {
      const raw = items.map(function (it) { return it.ref.scores[y]; });
      const nums = raw.filter(function (v) { return typeof v === 'number'; });
      const best = nums.length ? Math.max.apply(null, nums) : null;
      table.push({
        label: y,
        cells: raw.map(function (v) {
          if (v == null) return { txt: '—', na: true };
          if (typeof v === 'number') return { txt: '' + v, best: v === best };
          return { txt: v, cat: true };
        })
      });
    });

    table.push({
      label: '近一年趋势',
      cells: items.map(function (it) {
        if (it.ref.fmt !== 'num') return { txt: '—' };
        const vs = YEARS[it.stage].map(function (y) { return it.ref.scores[y]; }).filter(function (v) { return typeof v === 'number'; });
        if (vs.length < 2) return { txt: '—' };
        const diff = vs[vs.length - 1] - vs[vs.length - 2];
        return { txt: (diff > 0 ? '↑' : (diff < 0 ? '↓' : '→')) + Math.abs(diff).toFixed(2), trendCls: diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat') };
      })
    });

    let vals = [];
    items.forEach(function (it) {
      if (it.ref.fmt === 'num') years.forEach(function (y) { if (typeof it.ref.scores[y] === 'number') vals.push(it.ref.scores[y]); });
    });
    const chartHasData = vals.length > 0;
    let chart = null;
    if (chartHasData) {
      let dmin = Math.min.apply(null, vals), dmax = Math.max.apply(null, vals);
      let yMin = Math.floor((dmin - 2) / 5) * 5, yMax = Math.ceil((dmax + 2) / 5) * 5;
      if (yMax === yMin) yMax = yMin + 5;
      const series = items.map(function (it, i) {
        return {
          color: PALETTE[i % PALETTE.length],
          vals: years.map(function (y) { return (it.ref.fmt === 'num' && typeof it.ref.scores[y] === 'number') ? it.ref.scores[y] : null; })
        };
      });
      chart = { years: years, series: series, yMin: yMin, yMax: yMax };
    }
    this._chart = chart;

    const self = this;
    this.setData({ showCompare: true, compareCols: cols, compareTable: table, chartHasData: chartHasData }, function () {
      if (chartHasData) setTimeout(function () { self.drawChart(); }, 80);
    });
  },

  removeCmp: function (e) {
    const k = e.currentTarget.dataset.k;
    this.selSet.delete(k);
    this.setData({ selectedCount: this.selSet.size });
    this.applyFilters();
    if (this.selSet.size < 2) this.setData({ showCompare: false });
    else this.openCompare();
  },
  closeCompare: function () { this.setData({ showCompare: false }); },

  // ---- 积分计算（龙岗模型） ----
  selectCat: function (e) {
    const idx = parseInt(e.currentTarget.dataset.i, 10);
    const cat = CAT[idx];
    this.setData({
      calcCatIdx: idx,
      calcCatDesc: cat.desc,
      needProperty: cat.bonus === 'property',
      needHukou: cat.bonus === 'hukou' || cat.bonus === 'hukou_rent',
      needRent: cat.bonus === 'hukou_rent' || cat.bonus === 'rent_social',
      needSocial: cat.bonus === 'social' || cat.bonus === 'rent_social'
    });
    this.recompute();
  },
  onDateChange: function (e) {
    const f = e.currentTarget.dataset.f;
    const p = {};
    p[f + 'Date'] = e.detail.value;
    this.setData(p);
    this.recompute();
  },
  onSocialInput: function (e) {
    this.setData({ socialMonths: e.detail.value });
    this.recompute();
  },
  toggleYouxiang: function () {
    this.setData({ youxiang: !this.data.youxiang });
    this.recompute();
  },
  setAssessStage: function (e) {
    this.setData({ assessStage: e.currentTarget.dataset.s });
    if (this.data.calcResult) this.buildAssess(this.data.calcResult.total);
  },
  recompute: function () {
    const d = this.data;
    if (d.calcCatIdx < 0) { this.setData({ calcResult: null, assessRows: [] }); return; }
    const cat = CAT[d.calcCatIdx];
    const ref = d.refDate;
    const rate = 0.05;
    let bonus = 0;
    const details = [];
    if (cat.bonus === 'property') {
      const m = monthsBetween(d.propertyDate, ref);
      bonus = +(m * rate).toFixed(2);
      details.push('产权证满 ' + m + ' 个月，+' + bonus);
    } else if (cat.bonus === 'hukou') {
      const m = monthsBetween(d.hukouDate, ref);
      bonus = +(m * rate).toFixed(2);
      details.push('户籍迁入满 ' + m + ' 个月，+' + bonus);
    } else if (cat.bonus === 'hukou_rent') {
      const m1 = monthsBetween(d.hukouDate, ref), b1 = +(m1 * rate).toFixed(2);
      const m2 = monthsBetween(d.rentDate, ref), b2 = +(m2 * rate).toFixed(2);
      details.push('户籍迁入 ' + m1 + ' 月，+' + b1);
      details.push('租赁备案 ' + m2 + ' 月，+' + b2);
      bonus = +(b1 + b2).toFixed(2);
    } else if (cat.bonus === 'social') {
      const raw = parseInt(d.socialMonths, 10) || 0;
      const ex = Math.max(0, raw - 12);
      bonus = +(ex * rate).toFixed(2);
      details.push('社保 ' + raw + ' 月，超12月部分 ' + ex + ' 月，+' + bonus);
    } else if (cat.bonus === 'rent_social') {
      const m1 = monthsBetween(d.rentDate, ref), b1 = +(m1 * rate).toFixed(2);
      const raw = parseInt(d.socialMonths, 10) || 0;
      const ex = Math.max(0, raw - 12);
      const b2 = +(ex * rate).toFixed(2);
      details.push('租赁备案 ' + m1 + ' 月，+' + b1);
      details.push('社保超12月 ' + ex + ' 月，+' + b2);
      bonus = +(b1 + b2).toFixed(2);
    }
    const yb = d.youxiang ? 2.5 : 0;
    if (d.youxiang) details.push('优享学区 +2.5');
    const total = +(cat.base + bonus + yb).toFixed(2);
    this.setData({ calcResult: { base: cat.base, bonus: +(bonus + yb).toFixed(2), total: total, details: details } });
    this.buildAssess(total);
  },
  buildAssess: function (total) {
    const stage = this.data.assessStage;
    const ys = YEARS[stage];
    let list = DATA[stage].filter(function (s) {
      return s.district === '龙岗' && s.fmt === 'num' && latestNum(s, stage) != null;
    });
    list.sort(function (a, b) { return latestNum(b, stage) - latestNum(a, stage); });
    const rows = list.map(function (s) {
      const cut = latestNum(s, stage);
      const diff = +(total - cut).toFixed(2);
      let cls, txt;
      if (diff >= 5) { cls = 'a-great'; txt = '很稳'; }
      else if (diff >= 0) { cls = 'a-good'; txt = '较稳'; }
      else if (diff >= -5) { cls = 'a-risk'; txt = '有风险'; }
      else { cls = 'a-hard'; txt = '较难'; }
      let yr = '';
      for (let i = ys.length - 1; i >= 0; i--) { if (typeof s.scores[ys[i]] === 'number') { yr = ys[i]; break; } }
      return {
        name: s.name, cut: cut, yr: yr, region: s.area,
        diffTxt: (diff >= 0 ? '+' : '') + diff, cls: cls, txt: txt,
        barPct: Math.min(100, cut / 120 * 100)
      };
    });
    this.setData({ assessRows: rows });
  },

  // ---- 幼儿园：查询（官方信息表） ----
  kgComms: function (street) {
    const list = ['全部'];
    KG.forEach(function (k) {
      if (street !== '全部' && k.st !== street) return;
      if (k.cm && list.indexOf(k.cm) < 0) list.push(k.cm);
    });
    return list;
  },
  setKgArea: function (e) {
    const v = e.currentTarget.dataset.v;
    this.setData({ kgArea: v, kgCommIdx: 0, kgCommList: this.kgComms(v) });
    this.kgApply();
  },
  onKgComm: function (e) { this.setData({ kgCommIdx: parseInt(e.detail.value, 10) }); this.kgApply(); },
  setKgNature: function (e) { this.setData({ kgNature: e.currentTarget.dataset.v }); this.kgApply(); },
  onKgSort: function (e) { this.setData({ kgSortIdx: parseInt(e.detail.value, 10) }); this.kgApply(); },
  onKgSearch: function (e) { this.setData({ kgSearch: e.detail.value }); this.kgApply(); },
  // 热度参考：由官方表客观字段透明推导（性质基数 + 规模×2 + 旗舰园加成），非真实搜索/口碑数据
  kgHot: function (k) {
    const base = { '公办': 60, '普惠性民办': 40, '民办': 35, '非普惠性民办': 30 };
    let s = (base[k.na] || 30) + k.sc * 2;
    if (k.n.indexOf('中心幼儿园') >= 0 || k.n.indexOf('机关幼儿园') >= 0) s += 15;
    return s;
  },
  kgApply: function () {
    const d = this.data;
    const kgSel = this.kgSel;
    const self = this;
    const comm = d.kgCommList[d.kgCommIdx] || '全部';
    let list = KG.filter(function (k) {
      if (d.kgArea !== '全部' && k.st !== d.kgArea) return false;
      if (comm !== '全部' && k.cm !== comm) return false;
      if (d.kgNature !== '全部' && k.na !== d.kgNature) return false;
      if (d.kgSearch && k.n.indexOf(d.kgSearch) < 0) return false;
      return true;
    });
    if (d.kgSortIdx === 1) list = list.slice().sort(function (a, b) { return self.kgHot(b) - self.kgHot(a); });
    else if (d.kgSortIdx === 2) list = list.slice().sort(function (a, b) { return (a.f || 0) - (b.f || 0); });
    else if (d.kgSortIdx === 3) list = list.slice().sort(function (a, b) { return (b.f || 0) - (a.f || 0); });
    else list = list.slice().sort(function (a, b) {
      const ka = a.st + a.cm, kb = b.st + b.cm;
      if (ka !== kb) return ka < kb ? -1 : 1;
      return (a.f || 0) - (b.f || 0);
    });
    const rows = list.map(function (k) {
      let cls = 't-pri';
      if (k.na === '公办') cls = 't-pub'; else if (k.na === '普惠性民办') cls = 't-ph';
      return {
        key: 'kg|' + k.n,
        name: k.n,
        naTxt: k.na,
        naCls: cls,
        region: k.st + ' · ' + k.cm,
        feeTxt: k.f + ' 元/月',
        scaleTxt: '规模 ' + k.sc + ' 班',
        selected: kgSel.has('kg|' + k.n)
      };
    });
    this.setData({ kgRows: rows, kgCount: rows.length });
  },

  // ---- 幼儿园：对比 ----
  toggleKgSelect: function (e) {
    const k = e.currentTarget.dataset.k;
    if (this.kgSel.has(k)) this.kgSel.delete(k); else this.kgSel.add(k);
    this.setData({ kgSelCount: this.kgSel.size });
    this.kgApply();
  },
  kgClearAll: function () {
    this.kgSel.clear();
    this.setData({ kgSelCount: 0, showKgCompare: false });
    this.kgApply();
  },
  openKgCompare: function () {
    if (this.kgSel.size < 2) return;
    const items = [];
    this.kgSel.forEach(function (key) {
      const name = key.split('|')[1];
      const ref = KG.filter(function (k) { return k.n === name; })[0];
      if (ref) items.push(ref);
    });
    const fees = items.map(function (k) { return k.f || 0; });
    const minFee = Math.min.apply(null, fees);
    const cols = items.map(function (k, i) {
      return { name: k.n, color: PALETTE[i % PALETTE.length], key: 'kg|' + k.n };
    });
    const rows = [
      { label: '办园性质', cells: items.map(function (k) { return { txt: k.na }; }) },
      { label: '街道', cells: items.map(function (k) { return { txt: k.st }; }) },
      { label: '所属社区', cells: items.map(function (k) { return { txt: k.cm }; }) },
      { label: '保教费备案(元/月)', cells: items.map(function (k) { return { txt: '' + k.f, best: k.f === minFee }; }) },
      { label: '核定规模(班)', cells: items.map(function (k) { return { txt: '' + k.sc }; }) },
      { label: '年检结论(2024)', cells: items.map(function (k) { return { txt: k.yj || '—(公办)', na: !k.yj }; }) }
    ];
    this.setData({ showKgCompare: true, kgCmpCols: cols, kgCmpRows: rows });
  },
  removeKgCmp: function (e) {
    this.kgSel.delete(e.currentTarget.dataset.k);
    this.setData({ kgSelCount: this.kgSel.size });
    this.kgApply();
    if (this.kgSel.size < 2) this.setData({ showKgCompare: false });
    else this.openKgCompare();
  },
  closeKgCompare: function () { this.setData({ showKgCompare: false }); },

  drawChart: function () {
    const chart = this._chart;
    if (!chart || !chart.series.length) return;
    const self = this;
    wx.createSelectorQuery().in(this).select('#cmpChart').fields({ node: true, size: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      let dpr = 2;
      try { dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2; } catch (err) { dpr = 2; }
      const W = res[0].width, H = res[0].height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const pl = 32, pr = 10, pt = 12, pb = 22;
      const iw = W - pl - pr, ih = H - pt - pb;
      const years = chart.years, series = chart.series, yMin = chart.yMin, yMax = chart.yMax;
      const xN = years.length;
      function xPos(i) { return xN <= 1 ? pl + iw / 2 : pl + iw * i / (xN - 1); }
      function yPos(v) { return pt + ih * (1 - (v - yMin) / (yMax - yMin)); }

      ctx.strokeStyle = '#e6dcc6'; ctx.lineWidth = 1;
      ctx.fillStyle = '#a09070'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
      for (let k = 0; k <= 4; k++) {
        const val = yMin + (yMax - yMin) * k / 4;
        const y = yPos(val);
        ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(W - pr, y); ctx.stroke();
        ctx.fillText(val.toFixed(0), pl - 4, y + 3);
      }
      ctx.textAlign = 'center'; ctx.fillStyle = '#8a7a5a';
      years.forEach(function (yr, i) { ctx.fillText(yr, xPos(i), H - 7); });

      series.forEach(function (se) {
        ctx.strokeStyle = se.color; ctx.lineWidth = 2.5;
        const pts = [];
        let started = false;
        ctx.beginPath();
        se.vals.forEach(function (v, i) {
          if (v == null) return;
          const x = xPos(i), y = yPos(v);
          pts.push([x, y]);
          if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
        });
        if (pts.length > 1) ctx.stroke();
        ctx.fillStyle = se.color;
        pts.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill(); });
      });
    });
  }
});
