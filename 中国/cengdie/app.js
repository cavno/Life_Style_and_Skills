// =====================================================================
// 层叠的中国 v3 — 滚动叙事版
// 交互模型只有一个动作：滚动。每滚一步，地图做一件事。
// 22 步讲完论证；末尾提供完整地图自由探索。
// 每一步是"声明式的完整地图状态"——上下滚动永不失步。
// =====================================================================

(function () {
  "use strict";

  const A = window.ATLAS_DATA;
  const W = 1000, H = 780;

  // ============================ 工具（沿用 v2，已测试） ============================
  const ETHNIC = "(回族|满族|蒙古族?|维吾尔族?|哈萨克族?|藏族|彝族|壮族|苗族|侗族|白族|傣族|土家族|布依族|朝鲜族|哈尼族|傈僳族|景颇族|柯尔克孜族?|锡伯族?|羌族|黎族|畲族|仡佬族|各族)";
  const reEthnic = new RegExp(ETHNIC + "+(自治州|自治县|自治旗|自治区)$");
  const reSuffix = /(自治州|自治区|特别行政区|地区|林区|市|盟|省)$/;
  const shortName = n => n ? n.replace(reEthnic, "").replace(reSuffix, "") : "";

  function classifyDialect(prov, pref) {
    const t = A.PREF_DIALECT[prov] || {};
    let v = t[pref] !== undefined ? t[pref] : t._default;
    if (v === undefined) v = A.PROV_FALLBACK[prov] || "nonhanmain";
    return Array.isArray(v) ? { g: v[0], note: v[1] } : { g: v, note: null };
  }
  function classifyCulture(prov, pref) {
    const t = A.PREF_CULTURE[prov] || A.PREF_CULTURE["_default_"];
    let v = t[pref] !== undefined ? t[pref] : t._default;
    if (v === undefined) v = "han";
    return Array.isArray(v) ? { g: v[0], note: v[1] } : { g: v, note: null };
  }

  // ============================ 投影（两个视图共用） ============================
  const projection = d3.geoMercator();
  const path = d3.geoPath().projection(projection);
  const MAINLAND = { type: "Feature", geometry: { type: "Polygon",
    coordinates: [[[73,17.8],[135.6,17.8],[135.6,53.8],[73,53.8],[73,17.8]]] } };
  if (d3.geoArea(MAINLAND) > 2 * Math.PI)          // v1 的教训：球面绕向
    MAINLAND.geometry.coordinates[0].reverse();
  projection.fitExtent([[14, 14], [W - 14, H - 14]], MAINLAND);

  // 区域大字标（全图两种模式）
  const DIA_LABELS = [
    ["东北官话",[125.6,46.2],"dongbei"],["冀鲁",[116.2,37.5],"jilu"],
    ["胶辽",[121.7,37.1],"jiaoliao"],["中原官话",[113.4,34.1],"zhongyuan"],
    ["兰银",[100.2,38.8],"lanyin"],["江淮",[118.6,32.7],"jianghuai"],
    ["西南官话",[104.6,29.2],"southwest"],["晋语",[111.9,37.9],"jin"],
    ["吴语",[120.1,30.1],"wu"],["徽",[118.2,29.9],"hui"],
    ["赣语",[115.6,28.1],"gan"],["湘语",[111.9,27.4],"xiang"],
    ["闽",[118.4,26],"minnan"],["粤语",[112.4,22.8],"yue"],
    ["客家",[115.7,25],"hakka"],["北京",[116.2,40.4],"beijing"]
  ];
  const CUL_LABELS = [
    ["卫藏",[87.8,30.6],"weizang"],["安多",[98.6,35.2],"amdo"],
    ["康",[99.8,31.2],"kham"],["维吾尔",[80.8,39.2],"uyghur"],
    ["哈萨克",[82.6,46.2],"kazakh"],["蒙古",[113.5,44.6],"mongol"],
    ["回",[106,37.2],"hui"],["朝鲜",[129.2,43.2],"korean"],
    ["彝",[102.4,27.6],"yi"],["苗瑶",[109.2,28.4],"miaoyao"],
    ["壮侗",[107.2,23.6],"zhuangdong"],["滇西",[99.6,26.2],"swethnic"]
  ];

  // ============================ 全局数据状态 ============================
  let provFeatures = [], prefFeatures = [];
  let degraded = false, dataReady = false;

  // ============================ MapView ============================
  function MapView(svgId, opts) {
    const svg = d3.select("#" + svgId)
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    const root  = svg.append("g").attr("class", "viewport");
    const gProv = root.append("g");
    const gPref = root.append("g");
    const gTerr = root.append("g").style("display", "none");
    const gRange= root.append("g").style("display", "none");
    const gTop  = root.append("g");
    const gLbl  = root.append("g");
    const gPt   = root.append("g");
    const view = { svg, root, built: false };

    view.buildStatic = function () {
      gProv.selectAll("path").data(provFeatures).enter().append("path")
        .attr("class", "prov-base").attr("d", path);

      gTop.selectAll("path").data(provFeatures).enter().append("path")
        .attr("class", "prov-line").attr("d", path)
        .attr("vector-effect", "non-scaling-stroke");

      // 自然区：屏幕坐标平滑闭合曲线（无球面绕向问题）
      const cline = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6));
      gTerr.selectAll("path").data(A.TERRAIN_REGIONS).enter().append("path")
        .attr("class", "terr")
        .attr("d", t => cline(t.ring.map(c => projection(c))))
        .style("fill", t => t.color).style("stroke", t => t.color);
      gTerr.selectAll("text").data(A.TERRAIN_REGIONS).enter().append("text")
        .attr("class", "terr-label")
        .attr("x", t => avg(t.ring.map(c => projection(c)), 0))
        .attr("y", t => avg(t.ring.map(c => projection(c)), 1))
        .text(t => t.name);

      const rline = d3.line().curve(d3.curveCatmullRom.alpha(0.7));
      gRange.selectAll("path").data(A.MOUNTAIN_RANGES).enter().append("path")
        .attr("class", "range")
        .attr("d", m => rline(m.path.map(c => projection(c))))
        .attr("vector-effect", "non-scaling-stroke");
      gRange.selectAll("text").data(A.MOUNTAIN_RANGES).enter().append("text")
        .attr("class", "range-label")
        .attr("x", m => projection(m.path[Math.floor(m.path.length / 2)])[0] + 6)
        .attr("y", m => projection(m.path[Math.floor(m.path.length / 2)])[1] - 4)
        .text(m => m.name);

      A.POINTS.forEach(p => {
        const [x, y] = projection([p.lng, p.lat]);
        const g = gPt.append("g").attr("class", "pt")
          .attr("data-name", p.name)
          .attr("transform", `translate(${x},${y})`)
          .style("display", "none");
        g.append("circle").attr("r", 4.2);
        g.append("circle").attr("r", 8).attr("class", "pt-halo");
        g.append("text").attr("x", 10).attr("y", 4).text(p.name);
      });
    };

    // 市级数据到达后再绑定（gPref 建组时机保证其 z 序在省界墨线之下）
    view.bindPrefs = function () {
      const sel = gPref.selectAll("path").data(prefFeatures).enter().append("path")
        .attr("class", "pref").attr("d", path)
        .attr("vector-effect", "non-scaling-stroke");
      if (opts.interactive) {
        sel.style("cursor", "pointer")
          .on("mousemove", (ev, f) => opts.onHover && opts.onHover(ev, f))
          .on("mouseleave", () => opts.onHover && opts.onHover(null))
          .on("click", (ev, f) => opts.onClick && opts.onClick(f));
      } else {
        sel.style("pointer-events", "none");
      }
      view.built = true;
    };

    function avg(pts, i) { return pts.reduce((s, p) => s + p[i], 0) / pts.length; }

    // —— 状态应用 ——
    view.paint = function (fn, dur) {
      if (!view.built) return;
      const sel = dur ? gPref.selectAll(".pref").transition().duration(dur) : gPref.selectAll(".pref");
      sel.style("fill", f => fn(f).fill).style("fill-opacity", f => fn(f).op);
    };

    view.camera = function (spec, dur) {
      spec = spec || { type: "national" };
      let b = null;
      if (spec.type === "national") {
        root.transition().duration(dur == null ? 1050 : dur).ease(d3.easeCubicInOut)
          .attr("transform", "translate(0,0) scale(1)");
        return;
      }
      if (spec.type === "province") {
        const f = provFeatures.find(p => shortName(p.properties.name) === spec.name);
        if (f) b = path.bounds(f);
      } else if (spec.type === "bbox") {
        const [[l0, a0], [l1, a1]] = spec.bb;
        const cs = [projection([l0,a0]), projection([l0,a1]), projection([l1,a0]), projection([l1,a1])];
        b = [[Math.min(...cs.map(c=>c[0])), Math.min(...cs.map(c=>c[1]))],
             [Math.max(...cs.map(c=>c[0])), Math.max(...cs.map(c=>c[1]))]];
      }
      if (!b) return;
      const pad = spec.pad == null ? 0.14 : spec.pad;
      const k = Math.max(1, Math.min(11, (1 - pad) / Math.max((b[1][0]-b[0][0]) / W, (b[1][1]-b[0][1]) / H)));
      const cx = (b[0][0]+b[1][0]) / 2, cy = (b[0][1]+b[1][1]) / 2;
      root.transition().duration(dur == null ? 1050 : dur).ease(d3.easeCubicInOut)
        .attr("transform", `translate(${W/2 - k*cx},${H/2 - k*cy}) scale(${k})`);
    };

    view.focus = function (names) {
      const set = new Set(names || []);
      gTop.selectAll(".prov-line")
        .classed("focus", f => set.has(shortName(f.properties.name)));
    };

    view.borders = function (mode) {
      gTop.selectAll(".prov-line")
        .classed("strong", mode === "strong" || mode === "pulse")
        .classed("pulse", mode === "pulse");
    };

    // labels: [{text, at:[lng,lat] | 'pref:苏州' | fixed, cls}]
    view.labels = function (list) {
      gLbl.selectAll("*").remove();
      (list || []).forEach(L => {
        let xy = null;
        if (Array.isArray(L.at)) xy = projection(L.at);
        else if (typeof L.at === "string" && L.at.startsWith("pref:")) {
          const f = prefFeatures.find(p => p.__short === L.at.slice(5));
          if (f) xy = path.centroid(f);
        }
        if (!xy) return;
        gLbl.append("text")
          .attr("class", L.cls || "city-label")
          .attr("x", xy[0]).attr("y", xy[1])
          .attr("data-g", L.g || "")
          .text(L.text);
      });
    };

    view.points = function (names) {
      const set = new Set(names || []);
      gPt.selectAll(".pt").style("display", function () {
        return set.has(this.getAttribute("data-name")) ? null : "none";
      });
    };

    // terrain: {mode:'off'} | {mode:'ghost', ids?, ranges?, labels?}
    view.terrain = function (t) {
      t = t || { mode: "off" };
      if (t.mode === "off") { gTerr.style("display","none"); gRange.style("display","none"); return; }
      gTerr.style("display", null).classed("ghost", true);
      const ids = t.ids && new Set(t.ids);
      gTerr.selectAll(".terr").style("display", d => (!ids || ids.has(d.id)) ? null : "none");
      gTerr.selectAll(".terr-label").style("display", d =>
        (t.labels !== false && (!ids || ids.has(d.id))) ? null : "none");
      gRange.style("display", t.ranges ? null : "none");
    };

    // 探索模式：单独点亮某群组
    view.highlight = function (groupKey, mode) {
      if (!view.built) return;
      if (!groupKey) { gPref.selectAll(".pref").style("opacity", null); gLbl.selectAll("text").style("opacity", null); return; }
      gPref.selectAll(".pref").style("opacity", f =>
        (mode === "culture" ? f.__cul.g : f.__dia.g) === groupKey ? 1 : 0.08);
      gLbl.selectAll("text").style("opacity", function () {
        return this.getAttribute("data-g") === groupKey ? 1 : 0.1;
      });
    };

    return view;
  }

  // ============================ 上色函数编译器 ============================
  const BASE = { fill: "#ece1c4", op: 0.95 };
  const DIM  = { fill: "#e6dabb", op: 0.25 };
  const DG = k => A.DIALECT_GROUPS[k], CG = k => A.CULTURE_GROUPS[k];

  function paintFn(spec) {
    spec = spec || { type: "none" };
    switch (spec.type) {
      case "none": return () => BASE;
      case "prefs": {
        const s = new Set(spec.names);
        return f => (s.has(f.__short) && (!spec.prov || f.__prov === spec.prov))
          ? { fill: DG(f.__dia.g).color, op: 0.95 }
          : (spec.dimOthers ? DIM : BASE);
      }
      case "province":
        return f => f.__prov === spec.prov
          ? { fill: DG(f.__dia.g).color, op: 0.95 } : DIM;
      case "group": {
        const gs = new Set(spec.groups);
        return f => gs.has(f.__dia.g)
          ? { fill: DG(f.__dia.g).color, op: 0.95 }
          : (spec.keepProv && f.__prov === spec.keepProv
              ? { fill: DG(f.__dia.g).color, op: 0.30 } : DIM);
      }
      case "dialect":
        return f => ({ fill: DG(f.__dia.g).color, op: spec.dim ? 0.32 : 0.92 });
      case "culture": {
        const only = spec.only && new Set(spec.only);
        return f => {
          const g = f.__cul.g;
          if (only) return only.has(g)
            ? { fill: CG(g).color, op: 0.95 } : { fill: "#ece1c4", op: 0.4 };
          return { fill: CG(g).color, op: g === "han" ? 0.45 : 0.92 };
        };
      }
    }
    return () => BASE;
  }

  // ============================ 故事步骤（全部逻辑所在） ============================
  const K = (hex, t) => `<i class="k" style="--c:${hex}"></i>${t}`;
  const G = A.DIALECT_GROUPS, C = A.CULTURE_GROUPS;

  const STEPS = [
    { html: `中国的省界，几乎从不沿文化的边界走。<br><strong>这不是疏忽，是设计。</strong>`,
      paint: { type: "none" }, camera: { type: "national" } },

    { html: `以江苏为例。`,
      paint: { type: "none" }, camera: { type: "province", name: "江苏" },
      focus: ["江苏"] },

    { html: `苏州人说${K(G.wu.color,"吴语")}。`,
      paint: { type: "prefs", names: ["苏州"], prov: "江苏" },
      camera: { type: "province", name: "江苏" }, focus: ["江苏"],
      labels: [{ text: "苏州", at: "pref:苏州" }] },

    { html: `徐州人说${K(G.zhongyuan.color,"中原官话")}。<br>同省两城，语言几乎无法互通。`,
      paint: { type: "prefs", names: ["苏州", "徐州"], prov: "江苏" },
      camera: { type: "province", name: "江苏" }, focus: ["江苏"],
      labels: [{ text: "苏州", at: "pref:苏州" }, { text: "徐州", at: "pref:徐州" }] },

    { html: `徐州话的亲属不在江苏——在河南。<br><strong>颜色不认省界。</strong>`,
      paint: { type: "group", groups: ["zhongyuan"], keepProv: "江苏" },
      camera: { type: "bbox", bb: [[108, 30], [122.5, 38.5]] }, focus: ["江苏"],
      labels: [{ text: "徐州", at: "pref:徐州" }, { text: "中原官话区", at: [113.2, 34.3], cls: "area-label" }] },

    { html: `江苏 13 市全部着色：${K(G.wu.color,"吴语")}苏南、${K(G.jianghuai.color,"江淮")}苏中、${K(G.zhongyuan.color,"中原")}苏北。<br>「散装江苏」是语言学事实。`,
      paint: { type: "province", prov: "江苏" },
      camera: { type: "province", name: "江苏" }, focus: ["江苏"] },

    { html: `这不是江苏的特例。<br>广东：${K(G.yue.color,"广府")}、${K(G.hakka.color,"客家")}、${K(G.minnan.color,"潮汕")}三分。`,
      paint: { type: "province", prov: "广东" },
      camera: { type: "province", name: "广东" }, focus: ["广东"] },

    { html: `陕西：陕北${K(G.jin.color,"晋语")}、关中${K(G.zhongyuan.color,"中原官话")}、陕南${K(G.southwest.color,"西南官话")}。<br>一条省串起三个世界。`,
      paint: { type: "province", prov: "陕西" },
      camera: { type: "province", name: "陕西" }, focus: ["陕西"] },

    { html: `陕南的汉中，地理、语言、饮食皆属巴蜀。<br>元朝把它划给陕西——<strong>四川盆地的北门，不能在四川人手里。</strong>`,
      paint: { type: "prefs", names: ["汉中"], prov: "陕西" },
      camera: { type: "bbox", bb: [[101.5, 27.8], [112.5, 35.2]] }, focus: ["陕西", "四川"],
      terrain: { mode: "ghost", ids: ["sichuan-basin"], labels: true },
      labels: [{ text: "汉中", at: "pref:汉中" }] },

    { html: `这个原则叫<strong>「犬牙交错」</strong>——与「山川形便」相对。<br>自元代行省制起系统化，明清沿袭至今。`,
      paint: { type: "none" }, camera: { type: "national" } },

    { html: `反过来看：文化最紧密的共同体，恰好被省界切开。<br>${K(G.hakka.color,"客家")}核心区——闽西、赣南、粤东——横跨三省。`,
      paint: { type: "group", groups: ["hakka"] },
      camera: { type: "bbox", bb: [[112.8, 23.2], [118.8, 27.9]] },
      focus: ["福建", "江西", "广东"],
      points: ["石壁"] },

    { html: `${K(G.minnan.color,"潮汕与闽南")}同语同族，被闽粤省界拦腰切断。`,
      paint: { type: "group", groups: ["minnan"] },
      camera: { type: "bbox", bb: [[114.6, 21.8], [120.5, 26.4]] },
      focus: ["福建", "广东"] },

    { html: `${K(G.hui.color,"徽州")}六县被一拆为三：<br>婺源划给江西，绩溪划给宣城。`,
      paint: { type: "group", groups: ["hui"] },
      camera: { type: "bbox", bb: [[116.4, 28.4], [120, 31]] },
      focus: ["安徽", "江西", "浙江"],
      points: ["婺源", "绩溪"] },

    { html: `西部的尺度更大。<br>传统藏区三部——${K(C.weizang.color,"卫藏")}、${K(C.amdo.color,"安多")}、${K(C.kham.color,"康")}——被切进<strong>五个省级单位</strong>。`,
      paint: { type: "culture", only: ["weizang", "amdo", "kham"] },
      camera: { type: "bbox", bb: [[75.5, 25.5], [106.5, 40.5]] },
      labels: [
        { text: "卫藏", at: [87.8, 30.6], cls: "area-label" },
        { text: "安多", at: [98.6, 35.2], cls: "area-label" },
        { text: "康",   at: [99.8, 31.0], cls: "area-label" }] },

    { html: `其中${K(C.kham.color,"康巴")}，横跨川、滇、藏、青四省。`,
      paint: { type: "culture", only: ["kham"] },
      camera: { type: "bbox", bb: [[94.5, 26], [105, 34.8]] },
      focus: ["四川", "云南", "西藏", "青海"],
      labels: [{ text: "康", at: [99.8, 31.0], cls: "area-label" }] },

    { html: `${K(C.mongol.color,"蒙古")}分入四省区；${K(C.hui.color,"回族走廊")}（宁夏—临夏—河湟—昌吉）亦跨四省区。<br>切割是系统性的。`,
      paint: { type: "culture", only: ["mongol", "hui"] },
      camera: { type: "bbox", bb: [[84, 32], [127.5, 51]] },
      labels: [
        { text: "蒙古", at: [113.5, 44.6], cls: "area-label" },
        { text: "回",   at: [105.6, 36.9], cls: "area-label" }] },

    { html: `现在拉远。<br>全国 330 余个地级市，逐一按方言着色。`,
      paint: { type: "dialect" }, camera: { type: "national" } },

    { html: `叠上省界。<br><strong>没有任何一种颜色的边缘，与省界重合。</strong>`,
      paint: { type: "dialect" }, camera: { type: "national" },
      borders: "pulse",
      labels: DIA_LABELS.map(([t, at, g]) => ({ text: t, at, g, cls: "area-label" })) },

    { html: `北方，官话的八度渐变；南方，古汉语的破碎。<br>省界对两者一视同仁地无视。`,
      paint: { type: "dialect" }, camera: { type: "national" },
      borders: "strong",
      labels: DIA_LABELS.map(([t, at, g]) => ({ text: t, at, g, cls: "area-label" })) },

    { html: `若按「山川形便」，中国本是十三个自然单元。<br>那是被否决的另一张地图。`,
      paint: { type: "none" }, camera: { type: "national" },
      terrain: { mode: "ghost", ranges: true, labels: true } },

    { html: `但结构也反过来铸造主体：七十年之后，「四川人」「广东人」已是真实的身份。<br><strong>省界切碎了旧的共同体，也铸出了新的。</strong>`,
      paint: { type: "dialect", dim: true }, camera: { type: "national" } },

    { html: `<span class="end-title">论证完毕。</span><br>下面是完整地图——每个市都可以点。`,
      end: true,
      paint: { type: "dialect" }, camera: { type: "national" },
      borders: "strong" }
  ];

  // ============================ 故事视图与驱动 ============================
  const story = MapView("story-map", { interactive: false });
  let cur = -1;

  function applyStep(i, instant) {
    const s = STEPS[i];
    if (!s) return;
    cur = i;
    if (story.built) {
      story.paint(paintFn(s.paint), instant ? 0 : 620);
      story.camera(s.camera, instant ? 0 : undefined);
      story.focus(s.focus);
      story.borders(s.borders || "normal");
      story.labels(s.labels);
      story.points(s.points);
      story.terrain(s.terrain);
    }
    document.querySelectorAll("#steps .step").forEach((el, j) =>
      el.classList.toggle("active", j === i));
  }

  function buildSteps() {
    const box = document.getElementById("steps");
    box.innerHTML = STEPS.map((s, i) =>
      `<div class="step${s.end ? " step-end" : ""}" data-i="${i}">
         <div class="step-card">${s.html}${s.end ?
           `<div><button id="to-explore" class="btn-seal">进入自由探索 ↓</button></div>` : ""}
       </div></div>`).join("");
    const btn = document.getElementById("to-explore");
    if (btn) btn.addEventListener("click", () =>
      document.getElementById("explore").scrollIntoView({ behavior: "smooth" }));
  }

  function initScroller() {
    const cards = [...document.querySelectorAll("#steps .step")];
    const activate = i => { if (i !== cur) applyStep(i); };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(es => {
        es.forEach(e => { if (e.isIntersecting) activate(+e.target.dataset.i); });
      }, { rootMargin: "-46% 0px -46% 0px", threshold: 0 });
      cards.forEach(c => io.observe(c));
    } else {
      window.addEventListener("scroll", () => {
        const mid = innerHeight / 2; let best = 0, bd = 1e9;
        cards.forEach((c, i) => {
          const r = c.getBoundingClientRect();
          const d = Math.abs(r.top + r.height / 2 - mid);
          if (d < bd) { bd = d; best = i; }
        });
        activate(best);
      }, { passive: true });
    }
    // 顶部进度条
    const bar = document.getElementById("progress");
    const scrolly = document.getElementById("scrolly");
    window.addEventListener("scroll", () => {
      const r = scrolly.getBoundingClientRect();
      const total = r.height - innerHeight;
      const p = Math.max(0, Math.min(1, -r.top / (total || 1)));
      bar.style.width = (p * 100).toFixed(2) + "%";
    }, { passive: true });
  }

  // ============================ 探索视图 ============================
  const tooltip = d3.select("#tooltip");
  let exMode = "dialect";

  const explore = MapView("explore-map", {
    interactive: true,
    onHover: (ev, f) => {
      if (!ev || !f) { tooltip.style("opacity", 0); return; }
      const def = exMode === "culture" ? CG(f.__cul.g) : DG(f.__dia.g);
      tooltip.style("opacity", 1)
        .style("left", (ev.pageX + 14) + "px")
        .style("top", (ev.pageY - 10) + "px")
        .html(`<b>${f.__full}</b><span>${def.name}</span>`);
    },
    onClick: f => showDetail(f)
  });

  function showDetail(f) {
    const isCul = exMode === "culture";
    const cls = isCul ? f.__cul : f.__dia;
    const def = isCul ? CG(cls.g) : DG(cls.g);
    const other = isCul ? DG(f.__dia.g) : CG(f.__cul.g);
    let html = `
      <div class="d-name">${f.__full}<em>${f.__prov}</em></div>
      <div class="d-chip" style="--c:${def.color}">${def.name}</div>`;
    if (cls.note) html += `<p class="d-note">${cls.note}</p>`;
    if (!isCul && f.__cul.g !== "han") html += `<p class="d-extra">文化圈：${CG(f.__cul.g).name}</p>`;
    if (isCul && other) html += `<p class="d-extra">汉语方言：${other.name}</p>`;
    document.getElementById("ex-detail").innerHTML = html;
  }

  function renderExplore() {
    if (!explore.built) return;
    explore.paint(paintFn(exMode === "culture" ? { type: "culture" } : { type: "dialect" }), 500);
    explore.borders("strong");
    const L = exMode === "culture" ? CUL_LABELS : DIA_LABELS;
    explore.labels(L.map(([t, at, g]) => ({ text: t, at, g, cls: "area-label" })));

    // 图例（按数量排序）
    const m = new Map();
    prefFeatures.forEach(f => {
      const k = exMode === "culture" ? f.__cul.g : f.__dia.g;
      m.set(k, (m.get(k) || 0) + 1);
    });
    const src = exMode === "culture" ? A.CULTURE_GROUPS : A.DIALECT_GROUPS;
    document.getElementById("ex-legend").innerHTML =
      [...m.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) =>
        `<div class="lg-item" data-g="${g}">
           <span class="lg-dot" style="background:${src[g].color}"></span>${src[g].name}<i>${n}</i>
         </div>`).join("");
    document.querySelectorAll("#ex-legend .lg-item").forEach(el => {
      el.addEventListener("mouseenter", () => explore.highlight(el.dataset.g, exMode));
      el.addEventListener("mouseleave", () => explore.highlight(null));
    });
    document.getElementById("ex-detail").innerHTML =
      `<div class="p-detail-empty">悬停查看归类，点击任一市州看注释。图例悬停可单独点亮一种颜色。</div>`;
  }

  document.querySelectorAll(".ex-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      exMode = btn.dataset.mode;
      document.querySelectorAll(".ex-tab").forEach(b =>
        b.classList.toggle("on", b === btn));
      renderExplore();
    });
  });

  // ============================ 数据加载（沿用 v2 三级备援） ============================
  const DATAV = "https://geo.datav.aliyun.com/areas_v3/bound/";
  const GH1 = "https://cdn.jsdelivr.net/gh/longwosion/geojson-map-china@master/";
  const GH2 = "https://raw.githubusercontent.com/longwosion/geojson-map-china/master/";

  async function tryFetch(urls) {
    for (const u of urls) {
      try { const r = await fetch(u, { mode: "cors" }); if (r.ok) return await r.json(); }
      catch (e) { /* 下一个源 */ }
    }
    return null;
  }

  const PROVS = [
    ["130000","13","河北"],["140000","14","山西"],["150000","15","内蒙古"],
    ["210000","21","辽宁"],["220000","22","吉林"],["230000","23","黑龙江"],
    ["320000","32","江苏"],["330000","33","浙江"],["340000","34","安徽"],
    ["350000","35","福建"],["360000","36","江西"],["370000","37","山东"],
    ["410000","41","河南"],["420000","42","湖北"],["430000","43","湖南"],
    ["440000","44","广东"],["450000","45","广西"],["460000","46","海南"],
    ["510000","51","四川"],["520000","52","贵州"],["530000","53","云南"],
    ["540000","54","西藏"],["610000","61","陕西"],["620000","62","甘肃"],
    ["630000","63","青海"],["640000","64","宁夏"],["650000","65","新疆"]
  ];
  const DIRECT = ["北京","天津","上海","重庆","台湾","香港","澳门"];

  async function loadBase() {
    const data = await tryFetch([DATAV + "100000_full.json", GH1 + "china.json", GH2 + "china.json"]);
    if (!data || !data.features) throw new Error("base failed");
    provFeatures = data.features.filter(f => f.properties && f.properties.name);
  }

  async function loadPrefs(onProgress) {
    let done = 0, realLoaded = 0;
    await Promise.all(PROVS.map(async ([adcode, code2, name]) => {
      const data = await tryFetch([
        `${DATAV}${adcode}_full.json`,
        `${GH1}geometryProvince/${code2}.json`,
        `${GH2}geometryProvince/${code2}.json`
      ]);
      if (data && data.features && data.features.length) {
        realLoaded++;
        data.features.forEach(f => {
          const nm = f.properties && f.properties.name;
          if (!nm) return;
          f.__prov = name; f.__short = shortName(nm); f.__full = nm;
          prefFeatures.push(f);
        });
      }
      done++; onProgress(done, PROVS.length);
    }));

    DIRECT.forEach(name => {
      const f = provFeatures.find(p => shortName(p.properties.name) === name);
      if (f) prefFeatures.push({ type: "Feature", geometry: f.geometry,
        properties: f.properties, __prov: name, __short: name, __full: f.properties.name });
    });
    const loaded = new Set(prefFeatures.map(f => f.__prov));
    PROVS.forEach(([,,name]) => {
      if (!loaded.has(name)) {
        const f = provFeatures.find(p => shortName(p.properties.name) === name);
        if (f) prefFeatures.push({ type: "Feature", geometry: f.geometry,
          properties: f.properties, __prov: name, __short: name, __full: f.properties.name });
      }
    });
    degraded = realLoaded === 0;
    prefFeatures.forEach(f => {
      f.__dia = classifyDialect(f.__prov, f.__short);
      f.__cul = classifyCulture(f.__prov, f.__short);
    });
  }

  // ============================ 启动 ============================
  const badge = document.getElementById("boot-badge");
  const mapLoad = document.getElementById("story-load");

  buildSteps();
  initScroller();

  loadBase().then(() => {
    story.buildStatic(); explore.buildStatic();
    mapLoad.classList.add("hide");
    setTimeout(() => mapLoad.style.display = "none", 450);
    applyStep(Math.max(cur, 0), true);   // 先给省级底图（相机/省界已生效）
    badge.textContent = "市级细化 0/27";
    return loadPrefs((d, t) => badge.textContent = `市级细化 ${d}/${t}`);
  }).then(() => {
    story.bindPrefs(); explore.bindPrefs();
    badge.textContent = degraded ? "⚠ 市级数据未获，省级降级" : "✓ 市级精度";
    if (!degraded) setTimeout(() => badge.classList.add("fade"), 1600);
    applyStep(Math.max(cur, 0), true);   // 用完整数据重放当前步
    renderExplore();
  }).catch(() => {
    mapLoad.innerHTML = `<div class="load-err">⚠ 地图边界数据未能从任何源加载。<br>
      <span>请确认可访问 geo.datav.aliyun.com 或 jsdelivr；<br>或按 README 将 GeoJSON 自托管后修改 DATAV 常量。</span></div>`;
  });

  // 调试/测试钩子（不影响使用）
  window.__atlas = { applyStep, STEPS, story, explore,
    get prefs() { return prefFeatures; }, renderExplore,
    setMode(m) { exMode = m; renderExplore(); } };
})();
