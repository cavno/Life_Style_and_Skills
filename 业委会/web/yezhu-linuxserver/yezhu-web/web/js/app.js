// ============ 主程序 ============
(function () {
  const esc = UI.esc
  const C = window.CONTENT
  const TABS = ['home', 'register', 'guide', 'property', 'faq', 'mine']
  const STAGES = ['collecting', 'submitted', 'group', 'enroll', 'meeting', 'done']

  const store = {
    get adminToken () { return localStorage.getItem('yz_admin') || '' },
    set adminToken (v) { v ? localStorage.setItem('yz_admin', v) : localStorage.removeItem('yz_admin') },
    get editToken () { return localStorage.getItem('yz_edit') || '' },
    set editToken (v) { v ? localStorage.setItem('yz_edit', v) : localStorage.removeItem('yz_edit') }
  }

  const viewEl = () => document.getElementById('view')
  function setTitle (t) { document.getElementById('topTitle').textContent = t }
  function go (route) { location.hash = '#/' + route }
  function bannerHtml () {
    return API.LIVE ? '' : '<div class="banner no-print">本地预览模式：数据只存在当前浏览器，仅供演示。正式使用请在 js/config.js 填写后端地址。</div>'
  }

  /* ---------------- 路由 ---------------- */
  function parseHash () {
    const raw = (location.hash || '#/home').replace(/^#\//, '')
    const [route, ...rest] = raw.split('/')
    return { route: route || 'home', param: rest.join('/') }
  }

  async function render () {
    const { route, param } = parseHash()
    // 标签高亮
    document.querySelectorAll('#tabbar .tab').forEach(t => {
      t.classList.toggle('on', t.dataset.route === route)
    })
    const v = viewEl()
    v.innerHTML = '<div class="empty">加载中…</div>'
    try {
      const fn = VIEWS[route] || VIEWS.home
      await fn(v, param)
    } catch (e) {
      v.innerHTML = '<div class="card"><div class="muted">出错了：' + esc(e.message || e) + '</div></div>'
    }
    window.scrollTo(0, 0)
  }

  window.addEventListener('hashchange', render)
  document.querySelectorAll('#tabbar .tab').forEach(t => {
    t.addEventListener('click', () => go(t.dataset.route))
  })

  /* ---------------- 视图 ---------------- */
  const VIEWS = {}

  // 进度首页
  VIEWS.home = async function (v) {
    setTitle('成立业委会')
    const s = await API.getStats()
    let isAdmin = false
    if (store.adminToken) { try { isAdmin = (await API.adminStatus(store.adminToken)).isAdmin } catch (e) {} }
    const cm = s.community
    const cur = STAGES.indexOf(cm.currentStage || 'collecting')
    const curNo = cur >= 0 ? cur + 1 : 1

    let fqPinned = null
    try { const fr = await API.getFaq(); const fl = (fr && fr.list) || []; fqPinned = fl.find(x => x.pinned) || fl[0] || null } catch (e) {}
    const stageDates = cm.stageDates || {}
    const timeline = C.stages.map((st, i) => {
      const done = curNo > i + 1, isCur = curNo === i + 1
      const cls = done ? 'done' : (isCur ? 'cur' : 'todo')
      const date = stageDates[STAGES[i]] || ''
      const badge = done ? '已完成' : (isCur ? '进行中' : '待定')
      return `<div class="tl-item ${cls}">
        <div class="tl-rail"><span class="tl-dot">${done ? '✓' : (i + 1)}</span>${i < C.stages.length - 1 ? '<span class="tl-line"></span>' : ''}</div>
        <div class="tl-body"><div class="tl-row"><span class="tl-title">${esc(st.short)}</span><span class="tl-badge ${cls}">${badge}</span></div>
        <div class="tl-date">${date ? esc(date.replace(/-/g, '.')) : '<span class="tl-dim">日期待定</span>'}</div>
        <div class="tl-sum">${esc(st.summary || '')}</div></div>
      </div>`
    }).join('')

    v.innerHTML = bannerHtml() + `
      <div class="card">
        <div class="row between"><div class="h1">${esc(cm.communityName)}</div>
          ${s.qualified ? '<span class="badge ok">已达标</span>' : '<span class="badge wait">征集中</span>'}</div>
        <div class="dim mt8">拟向 ${esc(cm.streetOffice)} 书面要求成立首次业主大会会议筹备组</div>
        ${(cm.noticeTitle || cm.noticeText) ? `<div class="mt16">${renderNotice(cm.noticeTitle, cm.noticeText)}</div>` : ''}
        ${fqPinned ? `<div class="fq-home mt16"><div class="row between"><span class="fq-home-t">❓ 常见问题</span><span class="fq-more" id="faqMore">更多 ›</span></div><div class="fq-home-q mt8">${esc(fqPinned.q)}</div><div class="fq-home-a mt8">${esc(fqPinned.a).replace(/\n/g, '<br>')}</div></div>` : ''}
        ${!cm.configured ? '<div class="warnbox mt16">尚未设置小区总人数与建筑面积总数，进度暂无法计算。请发起人在「小区参数」中填写。</div>' : ''}
      </div>

      <div class="card">
        <div class="row between" id="goGuide" style="cursor:pointer"><div class="h2" style="margin:0">成立业委会进展</div><span class="dim">第 ${curNo}/6 步 · 查看指南 ›</span></div>
        <div class="tl mt16">${timeline}</div>
        <div class="dim mt8">日期由发起人在「小区参数 · 各阶段时间」维护；点上方标题可查看每一步要做什么、用哪些官方文书。</div>
      </div>

      <div class="card">
        <div class="h2">联名进度（达标取两条口径之一）</div>
        <div class="row between"><span class="muted">人数口径（${esc(cm.headcountLabel)}）</span><span class="pct ${s.headcountReached ? 'ok' : ''}">${s.headcountPct}%</span></div>
        <div class="bar ${s.headcountReached ? 'ok' : ''} mt8"><i style="width:${Math.min(100, s.headcountPct)}%"></i></div>
        <div class="dim mt8">已确认 ${s.approvedCount} / ${cm.totalHouseholds || '—'}　门槛 ${cm.thresholdPct * 100}%</div>
        <div class="row between mt24"><span class="muted">投票权口径（建筑面积）</span><span class="pct ${s.areaReached ? 'ok' : ''}">${s.areaPct}%</span></div>
        <div class="bar ${s.areaReached ? 'ok' : ''} mt8"><i style="width:${Math.min(100, s.areaPct)}%"></i></div>
        <div class="dim mt8">已确认 ${s.approvedArea} ㎡ / ${cm.totalArea || '—'} ㎡</div>
        ${s.qualified
          ? '<div class="tip ok mt16">已满足法定联名比例，可进入下一步：导出申请书与联名清单，向街道办提交。</div>'
          : (cm.configured ? `<div class="gap-callout mt16"><div class="gap-t">🔔 距离达标还差</div><div class="gap-nums"><span class="gap-n">${s.needHeadcount}</span> 户 <span class="gap-or">或</span> <span class="gap-n">${s.needArea}</span> ㎡</div><div class="gap-d">人数、建筑面积两条口径满足其一即可 —— 快转发给邻居一起联名！</div></div>` : '')}
      </div>

      <div class="card"><div class="counts">
        <div class="cell"><div class="num">${s.approvedCount}</div><div class="dim">已通过</div></div>
        <div class="cell"><div class="num warn">${s.pendingCount}</div><div class="dim">待审核</div></div>
        <div class="cell"><div class="num">${s.rejectedCount}</div><div class="dim">已驳回</div></div>
      </div></div>

      <button class="btn" id="toRegister">我要联名签字</button>
      <button class="btn ghost mt16" id="toGuide2">了解流程与法律依据</button>

      ${isAdmin ? `<div class="card mt24"><div class="h2">发起人 / 审核员</div>
        <button class="btn line" id="toAdmin">审核联名（待审 ${s.pendingCount}）</button>
        <button class="btn line mt16" id="toExport">导出申请书与联名清单</button>
        <button class="btn line mt16" id="toConfig">小区参数设置</button></div>` : ''}
    `
    document.getElementById('goGuide').onclick = () => go('guide')
    const fqm = document.getElementById('faqMore'); if (fqm) fqm.onclick = () => go('faq')
    document.getElementById('toGuide2').onclick = () => go('guide')
    document.getElementById('toRegister').onclick = () => go('register')
    if (isAdmin) {
      document.getElementById('toAdmin').onclick = () => go('admin')
      document.getElementById('toExport').onclick = () => go('export')
      document.getElementById('toConfig').onclick = () => go('config')
    }
  }

  // 联名登记
  VIEWS.register = async function (v) {
    setTitle('联名登记')
    const [mineRes, s] = await Promise.all([API.getMine(store.editToken), API.getStats()])
    const mine = mineRes.mine
    const matter = s.community.lianmingMatter
    const cmName = s.community.communityName

    if (mine && !window._regEditing) {
      const stLabel = { pending: '待发起人审核', approved: '已通过，计入联名', rejected: '已驳回' }[mine.status] || ''
      const stCls = mine.status === 'approved' ? 'ok' : (mine.status === 'rejected' ? 'no' : 'wait')
      v.innerHTML = bannerHtml() + `
        <div class="card">
          <div class="row between"><div class="h2">我的联名</div><span class="badge ${stCls}">${stLabel}</span></div>
          <div class="kv"><span class="k">业主姓名</span><span class="v">${esc(mine.name)}</span></div>
          <div class="kv"><span class="k">楼栋房号</span><span class="v">${esc(mine.roomFull)}</span></div>
          <div class="kv"><span class="k">房屋建筑面积</span><span class="v">${mine.area} ㎡</span></div>
          <div class="kv"><span class="k">联系方式</span><span class="v">${esc(mine.phone)}</span></div>
          ${mine.reviewNote ? `<div class="kv"><span class="k">审核备注</span><span class="v">${esc(mine.reviewNote)}</span></div>` : ''}
          ${mine.status === 'approved' ? '<div class="tip ok mt16">你的联名已计入统计，感谢支持。</div>' : ''}
          ${mine.status === 'rejected' ? '<div class="tip no mt16">审核未通过，请按备注修改后重新提交。</div>' : ''}
          ${mine.status !== 'approved' ? '<button class="btn line mt24" id="reEdit">修改并重新提交</button><button class="btn danger mt16" id="reWithdraw">撤回联名</button>' : '<div class="dim mt16">如需修改已通过的记录，请联系发起人撤回。</div>'}
        </div>`
      if (mine.status !== 'approved') {
        document.getElementById('reEdit').onclick = () => { window._regEditing = mine; render() }
        document.getElementById('reWithdraw').onclick = async () => {
          const ok = await UI.dialog({ title: '撤回联名', body: '撤回后该房号将不计入联名，可重新提交。确定撤回？', danger: true, okText: '撤回' })
          if (!ok) return
          try { await API.withdrawMine(store.editToken); store.editToken = ''; UI.toast('已撤回'); window._regEditing = null; render() }
          catch (e) { UI.toast(e.message) }
        }
      }
      return
    }

    const m = window._regEditing
    const cmc = s.community
    const hasExCert = !!cmc.hasExampleCert
    const hasExIdFront = !!cmc.hasExampleIdFront
    const hasExIdBack = !!cmc.hasExampleIdBack
    const areaOpts = (cmc.areaOptions && cmc.areaOptions.length) ? cmc.areaOptions : ((window.CONFIG && window.CONFIG.AREA_OPTIONS) || [])
    const curArea = m && m.area ? String(Number(m.area)) : ''
    // 楼栋房号三级：按后台配置的选项与显隐开关动态生成
    const addrParts = []
    if (cmc.showBuilding) addrParts.push({ id: 'f_building', label: '栋', opts: cmc.buildingOptions || [], cur: m ? (m.building || '') : '' })
    if (cmc.showUnit) addrParts.push({ id: 'f_unit', label: '座', opts: cmc.unitOptions || [], cur: m ? (m.unit || '') : '' })
    if (cmc.showRoom) addrParts.push({ id: 'f_room', label: '房', opts: cmc.roomOptions || [], cur: m ? (m.room || '') : '' })
    const addrHtml = addrParts.map(p => (p.opts.length
      ? `<select class="input a-sel" id="${p.id}"><option value="">选${p.label}</option>${p.opts.map(o => `<option value="${esc(o)}" ${p.cur === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select><span class="suf">${p.label}</span>`
      : `<input class="input a-sel" id="${p.id}" placeholder="${p.label}" maxlength="20" value="${esc(p.cur)}"><span class="suf">${p.label}</span>`
    )).join('')
    v.innerHTML = bannerHtml() + `
      <div class="card">
        <div class="h2">业主联名登记</div>
        <div class="matter mt8">联名事项：${esc(matter)}</div>
        <div class="dim mt8">本人作为 ${esc(cmName)} 下列房屋的业主，自愿联名${esc(matter)}。请如实填写，提交后由发起人核验证件。</div>
      </div>
      <div class="card">
        <div class="field"><div class="label">业主姓名<span class="req">*</span></div>
          <input class="input" id="f_name" placeholder="与产权证上保持一致" value="${m ? esc(m.name) : ''}">
          <div class="err" id="e_name"></div></div>
        <div class="field"><div class="label">楼栋房号<span class="req">*</span></div>
          <div class="addr">${addrHtml || '<span class="dim">发起人未配置楼栋房号选项</span>'}</div>
          <div class="err" id="e_room"></div></div>
        <div class="field"><div class="label">房屋建筑面积（㎡）<span class="req">*</span></div>
          <select class="input" id="f_area"><option value="">请选择建筑面积（㎡）</option>${areaOpts.map(a => `<option value="${esc(a)}" ${curArea === String(Number(a)) ? 'selected' : ''}>${esc(a)} ㎡</option>`).join('')}</select>
          <div class="dim mt8">即你的投票权数，按本楼盘户型面积选择。</div>
          <div class="err" id="e_area"></div></div>
        <div class="field"><div class="label">联系方式<span class="req">*</span></div>
          <div class="phone-wrap"><span class="phone-prefix">(+86)</span><input class="input phone-input" id="f_phone" type="tel" inputmode="numeric" maxlength="11" placeholder="11 位手机号" value="${m ? esc(m.phone || '') : ''}"></div>
          <div class="err" id="e_phone"></div></div>
      </div>
      <div class="card">
        <div class="label">产权证明文件<span class="req">*</span></div>
        <div class="dim mt8">联名业主需提供产权证明文件，用于发起人核验业主身份，文件仅发起人可见。手机下载“i深圳”APP，登录后搜索“不动产登记”-“我要查询”，勾选后选择下一步，进入人脸识别登录，选择“个人名下不动产登记情况”，保存 PDF 到本地。</div>
        <div class="certs mt16">
          <div class="cert-cell"><div id="certBox" class="cert-add">＋ 上传产权证明（PDF）</div><input id="certInput" type="file" accept="application/pdf,image/*" class="hidden"><div class="cert-cap">支持 PDF 文件</div></div>
        </div>
        ${hasExCert ? '<span class="ex-link" data-prev="cert">查看示例</span>' : ''}
        ${m && m.hasCert ? '<div class="dim mt8">已上传过产权证明，如无需更换可不再上传。</div>' : ''}
        <div class="err" id="e_cert"></div>
      </div>
      <div class="card">
        <div class="label">身份证证件照片<span class="req">*</span></div>
        <div class="dim mt8">联名业主需提供身份证证明文件，用于发起人核验业主身份，照片仅发起人可见。上传后将自动加注“仅核验业主身份用”水印。</div>
        <div class="certs mt16">
          <div class="cert-cell"><div id="idFrontBox" class="cert-add">＋ 身份证人像面</div><input id="idFrontInput" type="file" accept="image/*" class="hidden"><div class="cert-cap">人像面</div></div>
          <div class="cert-cell"><div id="idBackBox" class="cert-add">＋ 身份证国徽面</div><input id="idBackInput" type="file" accept="image/*" class="hidden"><div class="cert-cap">国徽面</div></div>
        </div>
        <div class="ex-links">${hasExIdFront ? '<span class="ex-link" data-prev="idfront">查看人像面示例</span>' : ''}${hasExIdBack ? '<span class="ex-link" data-prev="idback">查看国徽面示例</span>' : ''}</div>
        ${m && (m.hasIdFront || m.hasIdBack) ? '<div class="dim mt8">已上传过身份证，如无需更换可不再上传。</div>' : ''}
        <div class="err" id="e_id"></div>
      </div>
      <div class="card">
        <div class="label">业主本人签名<span class="req">*</span></div>
        <div class="dim mt8">请用手指/鼠标在下方手写正楷签名。</div>
        <div class="sig-box mt16"><canvas id="sigCanvas" class="sig-canvas"></canvas><div class="sig-hint" id="sigHint">在此处手写签名</div></div>
        <div class="sig-tools"><span class="sig-clear" id="sigClear">清除重写</span></div>
        <div class="err" id="e_sign"></div>
      </div>
      <button class="btn" id="submitBtn">提交联名</button>
      ${m ? '<button class="btn line mt16" id="cancelEdit">取消</button>' : ''}
      <div class="dim mt24" style="padding:0 4px">提交即表示你确认上述信息真实，并同意以本次电子签名作为联名${esc(matter)}的意思表示。</div>
    `

    // 示例文件：当前窗口内预览
    v.querySelectorAll('.ex-link[data-prev]').forEach(el => { el.onclick = () => showFilePreview(API.exampleUrl(el.dataset.prev), '示例文件') })

    // 文件选择（PDF 显示文件名；图片显示预览；身份证打水印）
    let certFile = null, idFrontFile = null, idBackFile = null
    bindUpload('certBox', 'certInput', f => { certFile = f }, true, false)
    bindUpload('idFrontBox', 'idFrontInput', f => { idFrontFile = f }, false, true)
    bindUpload('idBackBox', 'idBackInput', f => { idBackFile = f }, false, true)
    function bindUpload (boxId, inputId, set, isDoc, isId) {
      const box = document.getElementById(boxId), input = document.getElementById(inputId)
      box.onclick = () => input.click()
      input.onchange = async () => {
        let f = input.files[0]; if (!f) return
        if (isDoc && f.type === 'application/pdf') {
          set(f)
          const b = document.getElementById(boxId)
          b.className = 'cert-add done'
          b.textContent = '✓ ' + (f.name.length > 16 ? f.name.slice(0, 14) + '…' : f.name)
          return
        }
        if (isId) { try { f = await watermarkImage(f, '仅核验业主身份用') } catch (e) {} }
        set(f)
        const url = URL.createObjectURL(f)
        const b = document.getElementById(boxId)
        b.outerHTML = `<img class="cert-img" id="${boxId}">`
        const img = document.getElementById(boxId); img.src = url; img.onclick = () => input.click()
      }
    }

    // 签名板
    const pad = makeSignaturePad(document.getElementById('sigCanvas'), document.getElementById('sigHint'))
    document.getElementById('sigClear').onclick = () => pad.clear()
    if (m) document.getElementById('cancelEdit').onclick = () => { window._regEditing = null; render() }

    const setErr = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg || '' }
    const clearErrs = () => ['e_name', 'e_room', 'e_area', 'e_phone', 'e_cert', 'e_id', 'e_sign'].forEach(i => setErr(i, ''))

    document.getElementById('submitBtn').onclick = async () => {
      clearErrs()
      const name = val('f_name').trim()
      const building = cmc.showBuilding ? val('f_building').trim() : ''
      const unit = cmc.showUnit ? val('f_unit').trim() : ''
      const room = cmc.showRoom ? val('f_room').trim() : ''
      const area = document.getElementById('f_area').value
      const phone = val('f_phone').trim()
      let bad = false
      if (!name) { setErr('e_name', '请填写业主姓名'); bad = true }
      else if (!/^[\u4e00-\u9fa5]+$/.test(name)) { setErr('e_name', '业主姓名只能是中文，不能含字母、数字或空格'); bad = true }
      else if (name.length < 2 || name.length > 4) { setErr('e_name', '业主姓名应为 2-4 个中文字'); bad = true }
      const addrMiss = []
      if (cmc.showBuilding && !building) addrMiss.push('栋')
      if (cmc.showUnit && !unit) addrMiss.push('座')
      if (cmc.showRoom && !room) addrMiss.push('房')
      if (addrMiss.length) { setErr('e_room', '请选择“' + addrMiss.join('”、“') + '”'); bad = true }
      if (!area || !(Number(area) > 0)) { setErr('e_area', '请选择房屋建筑面积'); bad = true }
      if (!/^1\d{10}$/.test(phone)) { setErr('e_phone', '请填写 11 位手机号（以 1 开头）'); bad = true }
      const okCert = certFile || (m && m.hasCert)
      const okFront = idFrontFile || (m && m.hasIdFront)
      const okBack = idBackFile || (m && m.hasIdBack)
      if (!okCert) { setErr('e_cert', '请上传产权证明文件'); bad = true }
      if (!okFront || !okBack) { setErr('e_id', (!okFront && !okBack) ? '请上传身份证人像面和国徽面' : (!okFront ? '请上传身份证人像面' : '请上传身份证国徽面')); bad = true }
      const okSign = !pad.isEmpty() || (m && m.hasSign)
      if (!okSign) { setErr('e_sign', '请手写签名'); bad = true }
      if (bad) { UI.toast('请检查标红的填写项'); return }

      UI.loading(true)
      try {
        const fields = { name, building, unit, room, area, phone }
        const files = {}
        if (certFile) files.cert = certFile
        if (idFrontFile) files.idFront = idFrontFile
        if (idBackFile) files.idBack = idBackFile
        if (!pad.isEmpty()) files.sign = UI.dataURLtoFile(pad.toDataURL(), 'sign.png')
        const res = await API.submitSignature(fields, files, store.editToken)
        if (res && res.editToken) store.editToken = res.editToken
        UI.loading(false)
        UI.toast('已提交，待审核')
        window._regEditing = null
        render()
      } catch (e) { UI.loading(false); UI.toast(e.message || '提交失败') }
    }
  }

  // 指南（路线图 + 入口）
  VIEWS.guide = async function (v) {
    setTitle('成立业委会指南')
    let cmName = '', curKey = 'collecting'
    try { const s = await API.getStats(); cmName = s.community.communityName; curKey = s.community.currentStage || 'collecting' } catch (e) {}
    const curNo = (STAGES.indexOf(curKey) + 1) || 1
    const exp = (typeof window._guideExp === 'number') ? window._guideExp : (STAGES.indexOf(curKey) >= 0 ? STAGES.indexOf(curKey) : 0)

    const steps = C.stages.map((st, i) => {
      const cls = curKey === st.key ? 'cur' : (st.no < curNo ? 'past' : '')
      const body = exp === i ? `<div class="step-body">
        ${st.points.map(p => `<div class="pt">· ${esc(p)}</div>`).join('')}
        ${st.docs.length ? `<div class="docs"><span class="docs-label">相关官方文书：</span>${st.docs.map(d => `<span class="doc-chip">${esc(d)}</span>`).join('')}</div>` : ''}
      </div>` : ''
      return `<div class="step ${cls}"><div class="step-head" data-i="${i}">
        <div class="step-no">${st.no}</div>
        <div class="step-main"><div class="step-title">${esc(st.title)}${curKey === st.key ? '<span class="curtag">进行中</span>' : ''}</div><div class="step-sum">${esc(st.summary)}</div></div>
        <div class="step-arrow">${exp === i ? '收起' : '展开'}</div></div>${body}</div>`
    }).join('')

    v.innerHTML = bannerHtml() + `
      <div class="card">
        <div class="h1">在${esc(cmName)}成立业主委员会</div>
        <div class="muted mt8">从联名到选出业委会、再到换物业的完整路线。每步可展开看要点和对应官方文书。</div>
        <div class="mt16"><span class="matter">当前进展：第 ${curNo} / 6 步</span></div>
      </div>
      <div class="entries">
        <div class="entry" data-go="eligibility"><div class="e-t">资格自测</div><div class="e-d">能否当代表/委员</div></div>
        <div class="entry" data-go="changewy"><div class="e-t">换物业指南</div><div class="e-d">成立后怎么换</div></div>
        <div class="entry" data-go="glossary"><div class="e-t">名词解释</div><div class="e-d">联名/公示/表决</div></div>
        <div class="entry" data-go="templates"><div class="e-t">官方文书库</div><div class="e-d">30 份示范文本</div></div>
      </div>
      ${steps}
      <div class="dim foot">流程依据《龙岗区业主大会及业主委员会工作指导手册》。各步具体材料、时限与公示要求，以手册及所属街道办要求为准。</div>
      <div class="manual-box"><span class="manual-link" id="manualLink">📄 查看《龙岗区业主大会及业主委员会工作指导手册》(PDF)</span></div>
    `
    const ml = document.getElementById('manualLink')
    if (ml) ml.onclick = () => showFilePreview((window.CONFIG && window.CONFIG.MANUAL_URL) || 'docs/longgang-yezhu-handbook.pdf', '工作指导手册')
    v.querySelectorAll('.entry').forEach(e => e.onclick = () => go(e.dataset.go))
    v.querySelectorAll('.step-head').forEach(hd => hd.onclick = () => {
      const i = Number(hd.dataset.i)
      window._guideExp = (exp === i ? -1 : i)
      render()
    })
  }

  // 我的
  /* ---------------- 常见问题答疑 ---------------- */
  /* ---------------- 物业反馈（劣迹记录与统计） ---------------- */
  VIEWS.property = async function (v) {
    setTitle('物业')
    const isAdmin = !!store.adminToken
    const votedIds = () => { try { return JSON.parse(localStorage.getItem('yz_voted') || '[]') } catch (e) { return [] } }
    const markVoted = id => { const a = votedIds(); if (a.indexOf(id) < 0) { a.push(id); localStorage.setItem('yz_voted', JSON.stringify(a)) } }

    // ===== 管理模式：审核 =====
    if (isAdmin && window._propAdmin === 'review') {
      const r = await API.getAdminProperty(store.adminToken)
      const list = r.list || []
      v.innerHTML = `
        <span class="back" id="back">‹ 返回物业</span>
        <div class="card"><div class="h2">反馈审核（待审核 ${r.pending} 条）</div><div class="dim mt8">通过后才计入统计与展示。可删除广告、重复或无关内容。</div></div>
        ${list.length === 0 ? '<div class="empty">暂无反馈</div>' : list.map(f => `
          <div class="card">
            <div class="row between"><span class="fb-cat">${esc(f.catName)}</span><span class="badge ${f.status === 'approved' ? 'ok' : (f.status === 'rejected' ? 'no' : 'wait')}">${f.status === 'approved' ? '已通过' : (f.status === 'rejected' ? '已驳回' : '待审核')}</span></div>
            ${(f.tags || []).length ? `<div class="fb-tags mt8">${f.tags.map(t => `<span class="fb-tag">${esc(t)}</span>`).join('')}</div>` : ''}
            <div class="fb-text mt8">${esc(f.text)}</div>
            <div class="dim mt8">${f.anon ? '匿名' : ('实名：' + esc(f.room || '未填'))} · 附议 ${f.votes} · ${fmtDate(new Date(f.createdAt))}</div>
            ${f.hasPhoto ? `<img class="fb-photo mt8" src="${API.adminPropPhotoUrl(store.adminToken, f.id)}" data-big="${API.adminPropPhotoUrl(store.adminToken, f.id)}">` : ''}
            <div class="fb-ops mt16">
              ${f.status !== 'approved' ? `<button class="btn sm fb-ok" data-id="${f.id}">通过</button>` : ''}
              ${f.status !== 'rejected' ? `<button class="btn sm line fb-no" data-id="${f.id}">驳回</button>` : ''}
              <button class="btn sm danger fb-del" data-id="${f.id}">删除</button>
            </div>
          </div>`).join('')}
      `
      document.getElementById('back').onclick = () => { window._propAdmin = null; render() }
      v.querySelectorAll('.fb-photo').forEach(im => im.onclick = () => showLightbox(im.dataset.big))
      const act = async (id, action) => { try { await API.reviewFeedback(store.adminToken, id, action); UI.toast(action === 'approve' ? '已通过' : '已驳回'); render() } catch (e) { UI.toast(e.message) } }
      v.querySelectorAll('.fb-ok').forEach(b => b.onclick = () => act(b.dataset.id, 'approve'))
      v.querySelectorAll('.fb-no').forEach(b => b.onclick = () => act(b.dataset.id, 'reject'))
      v.querySelectorAll('.fb-del').forEach(b => b.onclick = async () => { if (!(await UI.dialog({ title: '删除反馈', body: '确定删除该条反馈？', danger: true, okText: '删除' }))) return; try { await API.deleteFeedback(store.adminToken, b.dataset.id); UI.toast('已删除'); render() } catch (e) { UI.toast(e.message) } })
      return
    }

    // ===== 管理模式：分类与标准维护 =====
    if (isAdmin && window._propAdmin === 'cats') {
      const r = await API.getPropCats(store.adminToken)
      const cats = r.cats || []
      v.innerHTML = `
        <span class="back" id="back">‹ 返回物业</span>
        <div class="card"><div class="h2">分类与标准维护</div><div class="dim mt8">类别名称固定。可维护每类的<b>标签</b>（业主提交时点选，逗号或换行分隔）、<b>标准对照要点</b>（摘自深圳指导标准，供业主对照），以及可选的<b>量化档位</b>（留空则前台不显示档位）。</div></div>
        ${cats.map(c => `
          <div class="card">
            <div class="h2" style="font-size:16px">${esc(c.name)}</div>
            <div class="field"><div class="label">标签</div><input class="input" id="pc_tag_${c.id}" value="${esc((c.tags || []).join('，'))}"></div>
            <div class="field"><div class="label">标准对照要点</div><textarea class="textarea" id="pc_std_${c.id}">${esc(c.std || '')}</textarea></div>
            <div class="field"><div class="label">量化档位（选填，如“低于一级标准”）</div><input class="input" id="pc_lv_${c.id}" value="${esc(c.level || '')}"></div>
          </div>`).join('')}
        <button class="btn" id="pcSave">保存全部</button>
      `
      document.getElementById('back').onclick = () => { window._propAdmin = null; render() }
      document.getElementById('pcSave').onclick = async () => {
        const payload = cats.map(c => ({ id: c.id, tags: val('pc_tag_' + c.id), std: val('pc_std_' + c.id), level: val('pc_lv_' + c.id) }))
        UI.loading(true)
        try { await API.savePropCats(store.adminToken, payload); UI.loading(false); UI.toast('已保存'); window._propAdmin = null; render() } catch (e) { UI.loading(false); UI.toast(e.message) }
      }
      return
    }

    // ===== 提交反馈表单 =====
    if (window._fbForm) {
      const P0 = await API.getProperty()
      const cats = P0.cats
      const tagRow = (cid) => { const c = cats.find(x => x.id === cid); return (c && c.tags || []).map(t => `<span class="tag-pick" data-t="${esc(t)}">${esc(t)}</span>`).join('') || '<span class="dim">该类别暂无标签</span>' }
      v.innerHTML = bannerHtml() + `
        <span class="back" id="back">‹ 返回</span>
        <div class="card"><div class="h2">反映物业问题</div><div class="dim mt8">提交后由发起人审核，通过即计入统计。请如实、就事论事描述。</div></div>
        <div class="card">
          <div class="field"><div class="label">问题类别<span class="req">*</span></div>
            <select class="input" id="fb_cat"><option value="">请选择类别</option>${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><div class="label">标签（可选，最多 3 个）</div><div class="tag-picks" id="fb_tags">${'<span class="dim">请先选择类别</span>'}</div></div>
          <div class="field"><div class="label">问题描述<span class="req">*</span></div><textarea class="textarea" id="fb_text" maxlength="500" placeholder="具体描述你遇到的问题，如时间、地点、情形"></textarea></div>
          <div class="field"><div class="label">现场照片（可选）</div>
            <div class="certs"><div class="cert-cell"><div id="fbPhotoBox" class="cert-add">＋ 上传照片</div><input id="fbPhotoInput" type="file" accept="image/*" class="hidden"><div class="cert-cap">作为佐证，审核后展示</div></div></div></div>
          <div class="field"><div class="label">署名方式</div>
            <div class="seg" id="fb_anon"><button type="button" class="seg-b on" data-v="1">匿名</button><button type="button" class="seg-b" data-v="0">实名房号</button></div>
            <input class="input mt8 hidden" id="fb_room" placeholder="如 A座1502房（仅发起人可见，用于去重统计）">
            <div class="dim mt8">匿名降低顾虑；实名有助于按户去重、更可信。默认匿名。</div></div>
          <button class="btn" id="fbSubmit">提交反馈</button>
        </div>
      `
      document.getElementById('back').onclick = () => { window._fbForm = false; render() }
      let tags = []
      const catSel = document.getElementById('fb_cat')
      catSel.onchange = () => { tags = []; document.getElementById('fb_tags').innerHTML = tagRow(catSel.value); bindTags() }
      function bindTags () {
        document.querySelectorAll('#fb_tags .tag-pick').forEach(el => el.onclick = () => {
          const t = el.dataset.t
          if (el.classList.contains('on')) { el.classList.remove('on'); tags = tags.filter(x => x !== t) }
          else { if (tags.length >= 3) return UI.toast('最多选 3 个标签'); el.classList.add('on'); tags.push(t) }
        })
      }
      let anon = true
      document.querySelectorAll('#fb_anon .seg-b').forEach(b => b.onclick = () => {
        document.querySelectorAll('#fb_anon .seg-b').forEach(x => x.classList.remove('on')); b.classList.add('on')
        anon = b.dataset.v === '1'; document.getElementById('fb_room').classList.toggle('hidden', anon)
      })
      let photoFile = null
      const pbox = document.getElementById('fbPhotoBox'), pin = document.getElementById('fbPhotoInput')
      pbox.onclick = () => pin.click()
      pin.onchange = () => { const f = pin.files[0]; if (!f) return; photoFile = f; const url = URL.createObjectURL(f); pbox.outerHTML = `<img class="cert-img" id="fbPhotoBox">`; const im = document.getElementById('fbPhotoBox'); im.src = url; im.onclick = () => pin.click() }
      document.getElementById('fbSubmit').onclick = async () => {
        const catId = catSel.value, text = val('fb_text').trim(), room = val('fb_room').trim()
        if (!catId) return UI.toast('请选择问题类别')
        if (text.length < 4) return UI.toast('请描述具体问题（至少 4 个字）')
        UI.loading(true)
        try { await API.submitFeedback({ catId, text, tags, anon, room }, photoFile); UI.loading(false); UI.toast('已提交，待审核'); window._fbForm = false; render() }
        catch (e) { UI.loading(false); UI.toast(e.message) }
      }
      return
    }

    // ===== 主展示 =====
    const P = await API.getProperty()
    const cats = P.cats
    const cat = window._propCat || ''
    const voted = votedIds()
    let items
    if (cat) { const r = await API.getPropertyList(cat); items = r.list } else { items = P.top5 }
    const curCat = cat ? cats.find(c => c.id === cat) : null

    const itemHtml = (f, rank) => `
      <div class="fb-item">
        <div class="fb-head">${rank ? `<span class="fb-rank">${rank}</span>` : ''}<span class="fb-cat">${esc(f.catName)}</span>${(f.tags || []).map(t => `<span class="fb-tag">${esc(t)}</span>`).join('')}</div>
        <div class="fb-text">${esc(f.text)}</div>
        ${f.hasPhoto ? `<img class="fb-photo" src="${API.propPhotoUrl(f.id)}" data-big="${API.propPhotoUrl(f.id)}">` : ''}
        <div class="fb-foot">
          <span class="fb-room">${f.room ? esc(f.room) : '匿名业主'} · ${fmtDate(new Date(f.createdAt))}</span>
          <button class="fb-plus ${voted.indexOf(f.id) >= 0 ? 'done' : ''}" data-id="${f.id}" ${voted.indexOf(f.id) >= 0 ? 'disabled' : ''}>👍 我也遇到过 · <b class="fb-cnt">${f.reflect}</b></button>
        </div>
      </div>`

    v.innerHTML = bannerHtml() + `
      <div class="card">
        <div class="h2">物业问题记录与统计</div>
        <div class="prop-stat mt16">
          <div class="ps-cell"><div class="ps-n">${P.totalReports}</div><div class="ps-l">条问题</div></div>
          <div class="ps-cell"><div class="ps-n">${P.totalReflect}</div><div class="ps-l">总反映人次</div></div>
          <div class="ps-cell"><div class="ps-n">${P.participants}</div><div class="ps-l">实名参与户</div></div>
        </div>
        <div class="dim mt8">众包记录物业服务问题，与深圳物业标准对照。“反映人次”＝提交＋“我也遇到过”。</div>
      </div>
      ${isAdmin ? `<div class="card"><div class="row between"><div class="h2" style="margin:0">发起人管理</div></div><div class="fb-ops mt8"><button class="btn sm" id="goReview">反馈审核</button><button class="btn sm line" id="goCats">分类与标准维护</button></div></div>` : ''}
      <button class="btn" id="goForm">＋ 我要反映物业问题</button>
      <div class="cat-chips">
        <span class="cat-chip ${cat === '' ? 'on' : ''}" data-c="">综合 Top5</span>
        ${cats.map(c => { const pc = P.perCat.find(x => x.id === c.id) || { count: 0 }; return `<span class="cat-chip ${cat === c.id ? 'on' : ''}" data-c="${c.id}">${esc(c.name)}${pc.count ? ` <b>${pc.count}</b>` : ''}</span>` }).join('')}
      </div>
      ${curCat ? `
        <div class="card std-card">
          <div class="std-t">对照 · ${esc(curCat.name)}</div>
          <div class="std-body">${esc(curCat.std || '（暂未设置标准要点）')}</div>
          ${curCat.level ? `<div class="std-level">当前评估：${esc(curCat.level)}</div>` : '<div class="std-note">依据深圳指导标准要点，供业主对照落差（不作打分）。</div>'}
        </div>` : ''}
      <div class="card">
        <div class="h2" style="font-size:16px">${cat ? esc(curCat.name) + '·业主反馈' : '综合 Top5（按反映人次）'}</div>
        ${items.length === 0 ? '<div class="empty">该类暂无已通过的反馈，欢迎第一个反映</div>' : `<div class="fb-list mt8">${items.map((f, i) => itemHtml(f, cat ? 0 : i + 1)).join('')}</div>`}
      </div>
      ${!cat ? `
        <div class="card">
          <div class="h2" style="font-size:16px">各类问题分布</div>
          <div class="dist mt16">${cats.map(c => { const pc = P.perCat.find(x => x.id === c.id) || { count: 0 }; const w = P.maxCount ? Math.round(pc.count / P.maxCount * 100) : 0; return `<div class="dist-row" data-c="${c.id}"><span class="dist-name">${esc(c.name)}</span><span class="dist-bar"><i style="width:${w}%"></i></span><span class="dist-n">${pc.count}</span></div>` }).join('')}</div>
          <div class="dim mt8">点类别可查看该类反馈与标准对照。</div>
        </div>` : ''}
    `
    // 绑定
    if (isAdmin) {
      document.getElementById('goReview').onclick = () => { window._propAdmin = 'review'; render() }
      document.getElementById('goCats').onclick = () => { window._propAdmin = 'cats'; render() }
    }
    document.getElementById('goForm').onclick = () => { window._fbForm = true; render() }
    v.querySelectorAll('.cat-chip').forEach(el => el.onclick = () => { window._propCat = el.dataset.c; render() })
    v.querySelectorAll('.dist-row').forEach(el => el.onclick = () => { window._propCat = el.dataset.c; render() })
    v.querySelectorAll('.fb-photo').forEach(im => im.onclick = () => showLightbox(im.dataset.big))
    v.querySelectorAll('.fb-plus').forEach(b => b.onclick = async () => {
      const id = b.dataset.id
      b.disabled = true
      try {
        const r = await API.voteFeedback(id, true, '')
        markVoted(id)
        b.classList.add('done')
        const cnt = b.querySelector('.fb-cnt'); if (cnt && r) cnt.textContent = r.reflect
        UI.toast('已 +1，感谢反映')
      } catch (e) { b.disabled = false; UI.toast(e.message) }
    })
  }

  VIEWS.faq = async function (v) {
    setTitle('答疑')
    let list = []
    try { const r = await API.getFaq(); list = (r && r.list) || [] } catch (e) {}
    const isAdmin = !!store.adminToken
    const groups = []
    list.forEach(x => { const g = x.group || '其他'; if (groups.indexOf(g) < 0) groups.push(g) })
    const ed = window._faqEdit
    const editor = (isAdmin && ed) ? `
      <div class="card"><div class="h2">${ed.id ? '编辑问题' : '添加问题'}</div>
        <div class="field"><div class="label">分组</div><input class="input" id="fq_g" list="fqGroups" maxlength="20" value="${esc(ed.group || (groups[0] || ''))}" placeholder="如：数据安全与隐私"><datalist id="fqGroups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
        <div class="field"><div class="label">问题</div><input class="input" id="fq_q" maxlength="200" value="${esc(ed.q || '')}"></div>
        <div class="field"><div class="label">回答</div><textarea class="textarea ta-l" id="fq_a">${esc(ed.a || '')}</textarea></div>
        <label class="opt-head"><input type="checkbox" id="fq_p" ${ed.pinned ? 'checked' : ''}> 设为首页置顶问题</label>
        <button class="btn mt16" id="fqSave">保存</button><button class="btn line mt16" id="fqCancel">取消</button>
      </div>` : ''
    const groupHtml = groups.map(g => {
      const items = list.filter(x => (x.group || '其他') === g)
      return `<div class="card"><div class="fq-group">${esc(g)}</div>` + items.map(x => `
        <div class="fq-item" data-id="${x.id}">
          <div class="fq-qrow"><span class="fq-q">${x.pinned ? '<span class="fq-pin">置顶</span>' : ''}${esc(x.q)}</span><span class="fq-chev">›</span></div>
          <div class="fq-a hidden">${esc(x.a).replace(/\n/g, '<br>')}${isAdmin ? `<div class="fq-ops"><button class="btn sm line fq-edit" data-id="${x.id}">编辑</button><button class="btn sm line fq-pinbtn" data-id="${x.id}">${x.pinned ? '取消置顶' : '设为置顶'}</button><button class="btn sm danger fq-del" data-id="${x.id}">删除</button></div>` : ''}</div>
        </div>`).join('') + '</div>'
    }).join('')
    v.innerHTML = bannerHtml() + `
      <div class="card"><div class="row between"><div class="h2" style="margin:0">常见问题答疑</div>${isAdmin && !ed ? '<button class="btn sm" id="fqAdd">＋ 添加问题</button>' : ''}</div>
        <div class="dim mt8">对联名有任何顾虑，先看这里；仍有疑问请联系发起小组。点问题展开回答。</div></div>
      ${editor}${groupHtml}
      ${list.length === 0 ? '<div class="empty">暂无内容</div>' : ''}
    `
    v.querySelectorAll('.fq-qrow').forEach(el => {
      el.onclick = () => { const it = el.parentElement; it.querySelector('.fq-a').classList.toggle('hidden'); it.classList.toggle('open') }
    })
    if (!isAdmin) return
    const byId = id => list.find(i => i.id === id)
    const addBtn = document.getElementById('fqAdd')
    if (addBtn) addBtn.onclick = () => { window._faqEdit = {}; render() }
    v.querySelectorAll('.fq-edit').forEach(b => b.onclick = () => { window._faqEdit = Object.assign({}, byId(b.dataset.id)); render() })
    v.querySelectorAll('.fq-pinbtn').forEach(b => b.onclick = async () => {
      const x = byId(b.dataset.id); if (!x) return
      try { await API.updateFaq(store.adminToken, x.id, { group: x.group, q: x.q, a: x.a, pinned: !x.pinned }); UI.toast(x.pinned ? '已取消置顶' : '已置顶'); render() } catch (er) { UI.toast(er.message) }
    })
    v.querySelectorAll('.fq-del').forEach(b => b.onclick = async () => {
      const okd = await UI.dialog({ title: '删除问题', body: '确定删除该条问答？', danger: true, okText: '删除' })
      if (!okd) return
      try { await API.deleteFaq(store.adminToken, b.dataset.id); UI.toast('已删除'); render() } catch (er) { UI.toast(er.message) }
    })
    const sv = document.getElementById('fqSave')
    if (sv) sv.onclick = async () => {
      const item = { group: val('fq_g').trim() || '其他', q: val('fq_q').trim(), a: val('fq_a').trim(), pinned: document.getElementById('fq_p').checked }
      if (!item.q || !item.a) return UI.toast('问题与回答均不能为空')
      UI.loading(true)
      try {
        if (ed.id) await API.updateFaq(store.adminToken, ed.id, item)
        else await API.addFaq(store.adminToken, item)
        UI.loading(false); UI.toast('已保存'); window._faqEdit = null; render()
      } catch (er) { UI.loading(false); UI.toast(er.message) }
    }
    const cc = document.getElementById('fqCancel')
    if (cc) cc.onclick = () => { window._faqEdit = null; render() }
  }

  VIEWS.mine = async function (v) {
    setTitle('我的')
    const mineRes = await API.getMine(store.editToken)
    const mine = mineRes.mine
    let isAdmin = false
    if (store.adminToken) { try { isAdmin = (await API.adminStatus(store.adminToken)).isAdmin } catch (e) {} }

    v.innerHTML = bannerHtml() + `
      <div class="card">
        <div class="h2">我的联名</div>
        ${mine ? `
          <div class="kv"><span class="k">状态</span><span class="badge ${mine.status === 'approved' ? 'ok' : (mine.status === 'rejected' ? 'no' : 'wait')}">${mine.status === 'approved' ? '已通过' : (mine.status === 'rejected' ? '已驳回' : '待审核')}</span></div>
          <div class="kv"><span class="k">楼栋房号</span><span class="v">${esc(mine.roomFull)}</span></div>
          <div class="kv"><span class="k">建筑面积</span><span class="v">${mine.area} ㎡</span></div>
          <button class="btn line mt16" id="toReg">查看 / 修改</button>`
          : '<div class="dim">你还没有提交联名。</div><button class="btn mt16" id="toReg">立即联名签字</button>'}
      </div>

      ${isAdmin ? `<div class="card"><div class="h2">发起人 / 审核员</div>
        <button class="btn line" id="toAdmin">审核联名</button>
        <button class="btn line mt16" id="toExport">导出申请书与清单</button>
        <button class="btn line mt16" id="toConfig">小区参数设置</button>
        <button class="btn danger mt16" id="logout">退出发起人登录</button></div>`
        : `<div class="card"><div class="h2">我是筹备发起人</div>
        <div class="dim">若你是本次筹备的发起人，用口令登录后可审核联名、导出材料、设置参数。</div>
        <button class="btn ghost mt16" id="toLogin">发起人登录</button></div>`}

      <div class="card"><div class="dim">本机联名标识（换设备/清缓存会丢失，凭此找回你的提交）：</div>
        <div class="dim mt8" style="word-break:break-all">${esc(store.editToken || '（尚未提交）')}</div></div>
    `
    const reg = document.getElementById('toReg'); if (reg) reg.onclick = () => { window._regEditing = null; go('register') }
    if (isAdmin) {
      document.getElementById('toAdmin').onclick = () => go('admin')
      document.getElementById('toExport').onclick = () => go('export')
      document.getElementById('toConfig').onclick = () => go('config')
      document.getElementById('logout').onclick = () => { store.adminToken = ''; UI.toast('已退出'); render() }
    } else {
      document.getElementById('toLogin').onclick = () => go('adminlogin')
    }
  }

  // 资格自测
  VIEWS.eligibility = async function (v) {
    setTitle('资格自测')
    const neg = C.negative, pos = C.positive
    const ns = neg.map(() => false), ps = pos.map(() => false)
    function paint () {
      const negCount = ns.filter(Boolean).length, posCount = ps.filter(Boolean).length
      v.querySelector('#result').innerHTML = !window._elDone ? '' : (
        negCount > 0
          ? `<div class="card mt24"><div class="h2 redt">触及 ${negCount} 项负面情形</div><div class="muted mt8">负面清单中被勾选的情形可能影响候选资格。建议先向筹备组或街道办了解具体认定口径，再决定是否报名。</div><button class="btn line mt16" id="elReset">重新自测</button></div>`
          : `<div class="card mt24"><div class="h2 greent">未触及负面清单</div><div class="muted mt8">从负面清单看没有明显障碍${posCount > 0 ? '，且符合 ' + posCount + ' 项正面情形，属于较受欢迎的人选' : ''}。可关注筹备组发布的报名通知按时报名。</div><button class="btn line mt16" id="elReset">重新自测</button></div>`
      )
      const r = v.querySelector('#elReset'); if (r) r.onclick = () => { window._elDone = false; ns.fill(false); ps.fill(false); draw() }
    }
    function draw () {
      v.innerHTML = bannerHtml() + `
        <div class="card"><div class="h2">业主代表 / 委员 资格自测</div><div class="dim">想报名当业主代表或业委会委员？先对照两份清单自测。结果仅供参考，最终资格由筹备组、街道办、社区党委认定。</div></div>
        <div class="card"><div class="h2 redt">负面清单（如有请如实勾选）</div><div class="dim" style="margin-bottom:10px">触及任一情形，可能不符合候选资格。</div>
          ${neg.map((t, i) => `<div class="opt ${ns[i] ? 'on red' : ''}" data-t="n" data-i="${i}"><div class="box">${ns[i] ? '✓' : ''}</div><div class="opt-t">${esc(t)}</div></div>`).join('')}</div>
        <div class="card"><div class="h2 greent">正面清单（符合的请勾选）</div><div class="dim" style="margin-bottom:10px">符合以下情形，属于优先推荐。</div>
          ${pos.map((t, i) => `<div class="opt ${ps[i] ? 'on green' : ''}" data-t="p" data-i="${i}"><div class="box">${ps[i] ? '✓' : ''}</div><div class="opt-t">${esc(t)}</div></div>`).join('')}</div>
        <button class="btn" id="elCheck">查看自测结果</button>
        <div id="result"></div>
        <div class="dim foot">依据《龙岗区业主大会及业主委员会工作指导手册》3.3、3.4。</div>`
      v.querySelectorAll('.opt').forEach(o => o.onclick = () => {
        const i = Number(o.dataset.i)
        if (o.dataset.t === 'n') ns[i] = !ns[i]; else ps[i] = !ps[i]
        draw()
      })
      v.querySelector('#elCheck').onclick = () => { window._elDone = true; paint() }
      paint()
    }
    window._elDone = false
    draw()
  }

  // 换物业指南
  VIEWS.changewy = async function (v) {
    setTitle('换物业指南')
    v.innerHTML = bannerHtml() + `
      <div class="card"><div class="h2">怎么换掉现在的物业</div><div class="muted mt8">换物业不是业委会或几个业主说了算，要走法定的"选聘物业服务企业"程序，由业主大会表决决定。前提通常是先把业主委员会成立起来。</div></div>
      <div class="card"><div class="h2">谁来牵头招标</div><div class="muted">业主大会是小区公开招标选聘物业的招标人。开展招标的主体有三类：</div>
        <div class="lane mt16">
          <div class="lane-i main"><span class="lane-t">业主委员会</span><span class="lane-d">主要方式（最常见）</span></div>
          <div class="lane-i"><span class="lane-t">社区居民委员会</span><span class="lane-d">应急方式</span></div>
          <div class="lane-i"><span class="lane-t">街道办事处</span><span class="lane-d">兜底方式</span></div>
        </div>
        <div class="dim mt16">最稳妥路径：先用「联名」推动成立业委会，再由业委会牵头选聘新物业。</div></div>
      <div class="card"><div class="h2">业委会选聘新物业的 5 步</div>
        ${[['编制招标公告、招标文件','业委会在街道办指导下编制，内容含物业服务期限范围、投标人资格、报价要求、拟签合同文本等。按《龙岗区住宅区业主大会选聘物业服务企业工作指引》执行，参照市住建局示范文本制定。'],
           ['确定业主大会议题','议题通常包含：是否通过选聘物业的招标文件；是否采用"定性评审法 + 票决/抽签定标"的评标定标方法。'],
           ['公示并征集业主意见','将招标文件、招标公告及议题在小区公示，时间不少于十日，并征集业主意见。合理意见应当采纳，不采纳的要说明理由。'],
           ['街道办审核','业委会将征集意见的相关资料及议题提交街道办，由街道办查看意见情况并审核议题合法性。'],
           ['业主大会表决','召集业主大会会议表决。']
          ].map((p, i) => `<div class="pstep"><div class="pn">${i + 1}</div><div><div class="pt2">${esc(p[0])}</div><div class="pd">${esc(p[1])}</div></div></div>`).join('')}</div>
      <div class="card"><div class="h2">表决要达到的比例</div>
        <div class="vrow"><span class="vk">参与门槛</span><span class="vv">专有部分面积占比 ≥ 2/3 且 业主人数占比 ≥ 2/3 的业主参与表决</span></div>
        <div class="vrow"><span class="vk">通过门槛</span><span class="vv">参与表决中，专有部分面积过半数 且 人数过半数的业主同意</span></div>
        <div class="dim mt16">即"双 2/3 参与、双过半同意"。续聘原物业用的是同一表决比例。</div></div>
      <div class="card tipcard">提示：选聘物业属于业委会成立后的业主大会表决事项，本站当前主要解决前置的「联名成立业委会」。等业委会成立，再按上面流程推进换物业。</div>
      <div class="dim foot">依据《龙岗区业主大会及业主委员会工作指导手册》2.22，并参见《龙岗区住宅区业主大会选聘物业服务企业工作指引》。</div>
    `
  }

  // 名词解释
  VIEWS.glossary = async function (v) {
    setTitle('名词解释')
    v.innerHTML = bannerHtml() +
      '<div class="card"><div class="h2">名词解释</div><div class="dim">手册里反复出现、又容易搞混的几个词，用大白话解释一遍。</div></div>' +
      C.glossary.map(g => `<div class="card term"><div class="t-h">${esc(g[0])}</div><div class="t-b">${esc(g[1])}</div></div>`).join('') +
      '<div class="dim foot">依据《龙岗区业主大会及业主委员会工作指导手册》及《深圳经济特区物业管理条例》。</div>'
  }

  // 官方文书库
  VIEWS.templates = async function (v) {
    setTitle('官方文书库')
    const open = (typeof window._tplOpen === 'number') ? window._tplOpen : 0
    v.innerHTML = bannerHtml() +
      '<div class="card"><div class="h2">官方文书库</div><div class="dim">手册附带 30 份示范文本，覆盖从联名到换届每一步。按阶段做了索引，完整模板见手册正文第 59 页起（可按街道实际调整）。</div></div>' +
      C.templateGroups.map((grp, i) => `<div class="card grp"><div class="grp-h" data-i="${i}"><div class="grp-t">${esc(grp.g)}</div><div class="grp-a">${open === i ? '−' : '+'}</div></div>${open === i ? '<div class="grp-b">' + grp.items.map(d => `<div class="doc"><div class="doc-no">${esc(d.no)}</div><div><div class="doc-name">${esc(d.name)}</div><div class="doc-use">${esc(d.use)}</div></div></div>`).join('') + '</div>' : ''}</div>`).join('') +
      '<div class="dim foot">示范文本出处：《龙岗区业主大会及业主委员会工作指导手册》附件。</div>'
    v.querySelectorAll('.grp-h').forEach(h => h.onclick = () => { const i = Number(h.dataset.i); window._tplOpen = (open === i ? -1 : i); render() })
  }

  // 发起人登录
  VIEWS.adminlogin = async function (v) {
    setTitle('发起人登录')
    v.innerHTML = bannerHtml() + `
      <div class="card"><div class="h2">发起人登录</div>
        <div class="dim">用发起人口令登录后，可审核联名、导出材料、设置小区参数。口令由后端设置（本地预览模式下首次输入的口令即被设为口令）。</div>
        <div class="field mt16"><div class="label">发起人口令</div><input class="input" id="pass" type="password" placeholder="请输入口令"></div>
        <button class="btn" id="loginBtn">登录</button>
        <button class="btn line mt16" id="back">返回</button>
      </div>`
    document.getElementById('back').onclick = () => go('mine')
    document.getElementById('loginBtn').onclick = async () => {
      const p = document.getElementById('pass').value
      if (!p) return UI.toast('请输入口令')
      UI.loading(true)
      try { const r = await API.adminLogin(p); store.adminToken = r.token; UI.loading(false); UI.toast('登录成功'); go('admin') }
      catch (e) { UI.loading(false); UI.toast(e.message || '登录失败') }
    }
  }

  function requireAdmin () {
    if (!store.adminToken) { go('adminlogin'); return false }
    return true
  }

  // 审核列表
  VIEWS.admin = async function (v) {
    if (!requireAdmin()) return
    setTitle('审核联名')
    const tab = window._adminTab || 'pending'
    let page = 0, accumulated = []
    async function load (reset) {
      if (reset) { page = 0; accumulated = [] }
      let res
      try { res = await API.listSignatures(store.adminToken, { status: tab === 'all' ? '' : tab, page, size: 20 }) }
      catch (e) {
        if (/401|登录|口令|权限/.test(e.message)) { store.adminToken = ''; go('adminlogin'); return }
        throw e
      }
      accumulated = accumulated.concat(res.list)
      paint(res.total)
    }
    function paint (total) {
      v.innerHTML = bannerHtml() + `
        <div class="tabs">
          ${['pending', 'approved', 'rejected', 'all'].map(k => `<div class="t ${tab === k ? 'on' : ''}" data-k="${k}">${{ pending: '待审核', approved: '已通过', rejected: '已驳回', all: '全部' }[k]}</div>`).join('')}
        </div>
        <div class="dim" style="margin:4px 4px 10px">共 ${total} 条</div>
        ${accumulated.length === 0 ? '<div class="empty">暂无记录</div>' : accumulated.map(it => `
          <div class="card item" data-id="${esc(it.id)}">
            <div class="row between"><div><span class="name">${esc(it.name)}</span><span class="room">${esc(it.roomFull)}</span>${it.dupRoom ? '<span class="badge no" style="margin-left:8px">房号重复</span>' : ''}</div>
              <span class="badge ${it.status === 'approved' ? 'ok' : (it.status === 'rejected' ? 'no' : 'wait')}">${it.status === 'approved' ? '已通过' : (it.status === 'rejected' ? '已驳回' : '待审核')}</span></div>
            <div class="dim mt8">面积 ${it.area} ㎡　电话 ${esc(it.phone)}${it.certNo ? '　证号 ' + esc(it.certNo) : ''}</div>
            ${it.status === 'pending' ? `<div class="ops mt16"><button class="btn sm line" data-rej="${esc(it.id)}">驳回</button><button class="btn sm" data-app="${esc(it.id)}">通过</button></div>` : ''}
          </div>`).join('')}
        ${accumulated.length < total ? '<div class="loadmore" id="more">加载更多</div>' : ''}
      `
      v.querySelectorAll('.tabs .t').forEach(t => t.onclick = () => { window._adminTab = t.dataset.k; render() })
      v.querySelectorAll('.item').forEach(it => it.onclick = e => {
        if (e.target.dataset.app || e.target.dataset.rej) return
        go('detail/' + it.dataset.id)
      })
      v.querySelectorAll('[data-app]').forEach(b => b.onclick = async e => { e.stopPropagation(); await review(b.dataset.app, 'approve', '') })
      v.querySelectorAll('[data-rej]').forEach(b => b.onclick = async e => {
        e.stopPropagation()
        const note = await UI.dialog({ title: '驳回', input: true, placeholder: '驳回原因（可选）', okText: '驳回', danger: true })
        if (note === null) return
        await review(b.dataset.rej, 'reject', note)
      })
      const more = document.getElementById('more'); if (more) more.onclick = () => { page++; load(false) }
    }
    async function review (id, action, note) {
      UI.loading(true)
      try { await API.reviewSignature(store.adminToken, id, action, note); UI.loading(false); UI.toast(action === 'approve' ? '已通过' : '已驳回'); load(true) }
      catch (e) { UI.loading(false); UI.toast(e.message) }
    }
    await load(true)
  }

  // 审核详情
  VIEWS.detail = async function (v, id) {
    if (!requireAdmin()) return
    setTitle('审核详情')
    const { rec } = await API.getOne(store.adminToken, id)
    const certUrl = API.fileUrl(store.adminToken, id, 'cert')
    const idFrontUrl = API.fileUrl(store.adminToken, id, 'idfront')
    const idBackUrl = API.fileUrl(store.adminToken, id, 'idback')
    const signUrl = API.fileUrl(store.adminToken, id, 'sign')
    v.innerHTML = `
      <span class="back" id="back">‹ 返回</span>
      <div class="card">
        <div class="row between"><div class="h2">${esc(rec.name)}</div><span class="badge ${rec.status === 'approved' ? 'ok' : (rec.status === 'rejected' ? 'no' : 'wait')}">${rec.status === 'approved' ? '已通过' : (rec.status === 'rejected' ? '已驳回' : '待审核')}</span></div>
        <div class="kv"><span class="k">楼栋房号</span><span class="v">${esc(rec.roomFull)}</span></div>
        <div class="kv"><span class="k">房屋建筑面积</span><span class="v">${rec.area} ㎡（投票权数）</span></div>
        <div class="kv"><span class="k">联系方式</span><span class="v">(+86) ${esc(rec.phone)}</span></div>
        ${rec.dupRoom ? '<div class="tip no mt16">注意：存在与该房号相同的其他提交，请核对避免重复计数。</div>' : ''}
        ${rec.reviewNote ? `<div class="kv"><span class="k">审核备注</span><span class="v">${esc(rec.reviewNote)}</span></div>` : ''}
      </div>
      <div class="card"><div class="label">产权证明文件</div>${rec.hasCert ? `<a class="btn sm line mt8" href="${certUrl}" target="_blank" rel="noopener">打开产权证明文件（PDF / 图片）</a>` : '<div class="dim mt8">未上传</div>'}</div>
      <div class="card"><div class="label">身份证人像面</div>${rec.hasIdFront ? `<img class="big" src="${idFrontUrl}">` : '<div class="dim mt8">未上传</div>'}</div>
      <div class="card"><div class="label">身份证国徽面</div>${rec.hasIdBack ? `<img class="big" src="${idBackUrl}">` : '<div class="dim mt8">未上传</div>'}</div>
      <div class="card"><div class="label">手写签名</div>${rec.hasSign ? `<img class="sig-show" src="${signUrl}">` : '<div class="dim mt8">无签名</div>'}</div>
      ${rec.status !== 'approved'
        ? '<button class="btn" id="approve">通过，计入联名</button><button class="btn danger mt16" id="reject">驳回</button>'
        : '<button class="btn danger" id="reject">撤销通过（改为驳回）</button>'}
    `
    document.getElementById('back').onclick = () => go('admin')
    async function review (action, note) {
      UI.loading(true)
      try { await API.reviewSignature(store.adminToken, id, action, note); UI.loading(false); UI.toast(action === 'approve' ? '已通过' : '已驳回'); go('admin') }
      catch (e) { UI.loading(false); UI.toast(e.message) }
    }
    const ap = document.getElementById('approve'); if (ap) ap.onclick = () => review('approve', '')
    document.getElementById('reject').onclick = async () => {
      const note = await UI.dialog({ title: '驳回', input: true, placeholder: '驳回原因（可选）', okText: '驳回', danger: true })
      if (note === null) return
      review('reject', note)
    }
  }

  // 导出
  VIEWS.export = async function (v) {
    if (!requireAdmin()) return
    setTitle('导出汇总')
    const data = await API.getExportData(store.adminToken)
    const c = data.config
    const today = fmtDate(new Date())
    const th = (c.thresholdPct || 0.2) * 100
    const hc = data.headcountPct >= th ? '☑' : '☐'
    const ar = data.areaPct >= th ? '☑' : '☐'
    const streetShort = (c.streetOffice || '').replace('深圳市龙岗区', '').replace('街道办事处', '').replace('街道', '')
    const docTitle = `关于成立${c.communityName || '＿＿＿＿'}首次业主大会会议筹备组的申请书`
    const docSub = '（百分之二十以上业主联名）'
    const docTo = `${c.streetOffice || '＿＿街道办事处'}：`
    const bodyParas = [
      `${c.communityName}业主总人数为 ${c.totalHouseholds} 人，业主专有部分总建筑面积（总投票权数）为 ${c.totalArea} 平方米，现本小区已符合以下条件：`,
      `${hc} 物业管理区域内 ${data.count} 名业主联名，占业主总人数 ${data.headcountPct}%（达到百分之二十以上）。`,
      `${ar} 物业管理区域内持有专有部分建筑面积 ${data.totalSignArea} 平方米的业主联名，占全体业主总投票权数 ${data.areaPct}%（达到百分之二十以上）。`,
      '根据《深圳经济特区物业管理条例》第十九条规定，特向街道办事处书面申请成立首次业主大会会议筹备组。'
    ]
    const docAttach = `附件：2-1. 业主联名表（共 ${data.count} 人）`
    const docContact = `（联系人：${c.initiatorName || '＿＿＿＿'}；联系方式：${c.initiatorPhone || '＿＿＿＿＿＿'}）`
    const docSigner = `${c.communityName}全体联名业主`
    const letter = [docTitle, docSub, '', docTo, '', ...bodyParas.map(p => '　　' + p), '', '　　' + docAttach, '', '　　' + docContact, '', '　　　　　　' + docSigner, '　　　　　　' + today].join('\n')

    const signRows = data.list.map((d, i) => {
      const signUrl = d.signData || API.fileUrl(store.adminToken, d.id || '', 'sign')
      return `<div class="trow">
        <span class="c-no">${i + 1}</span>
        <span class="c-name">${esc(d.name)}</span>
        <span class="c-room">${esc(d.roomFull)}</span>
        <span class="c-area">${Number(d.area).toFixed(2)}</span>
        <span class="c-phone">${esc(d.phone || '')}</span>
        <span class="c-sign">${signUrl ? `<img class="sign-thumb" src="${signUrl}" data-big="${signUrl}" alt="签名">` : '<span class="dim">—</span>'}</span>
      </div>`
    }).join('')

    v.innerHTML = `
      <span class="back no-print" id="back">‹ 返回</span>
      <div class="card no-print">
        <div class="row between"><div class="h2">汇总结果</div><span class="badge ${data.qualified ? 'ok' : 'wait'}">${data.qualified ? '已达标' : '未达标'}</span></div>
        <div class="kv"><span class="k">已通过联名</span><span class="v">${data.count} 人</span></div>
        <div class="kv"><span class="k">人数口径占比</span><span class="v">${data.headcountPct}%</span></div>
        <div class="kv"><span class="k">建筑面积合计</span><span class="v">${data.totalSignArea} ㎡</span></div>
        <div class="kv"><span class="k">投票权口径占比</span><span class="v">${data.areaPct}%</span></div>
      </div>

      <div class="card">
        <div class="row between no-print"><div class="h2">申请书（附件2）</div><button class="btn sm" id="copyLetter">复制全文</button></div>
        <div class="doc2 mt16" id="letterText">
          <div class="doc2-title">${esc(docTitle)}</div>
          <div class="doc2-sub">${esc(docSub)}</div>
          <div class="doc2-to">${esc(docTo)}</div>
          ${bodyParas.map(p => `<p class="doc2-p">${esc(p)}</p>`).join('')}
          <p class="doc2-p">${esc(docAttach)}</p>
          <p class="doc2-p">${esc(docContact)}</p>
          <div class="doc2-sign">${esc(docSigner)}<br>${esc(today)}</div>
        </div>
      </div>

      <div class="card">
        <div class="row between no-print"><div class="h2">业主联名表（附件2-1）</div><button class="btn sm line" id="dlCsv">下载 CSV</button></div>
        <div class="lm-title">成立首次业主大会会议筹备组业主联名申请表</div>
        <div class="lm-sub">${esc(streetShort ? streetShort + '街道' : (c.streetOffice || ''))}　${esc(c.community || '')}　${esc(c.communityName || '')} · 联名时间 ${today}</div>
        <div class="lmtable mt16">
          <div class="thead">
            <span class="c-no">序号</span><span class="c-name">业主姓名</span><span class="c-room">楼栋房号</span><span class="c-area">房屋建筑面积</span><span class="c-phone">联系方式</span><span class="c-sign">业主本人签名</span>
          </div>
          ${signRows}
        </div>
        ${data.list.length === 0 ? '<div class="empty">尚无已通过的联名</div>' : ''}
        <div class="note mt16">备注：联名业主需提供身份证复印件、产权证明复印件。点击签名可放大查看。</div>
      </div>

      <button class="btn no-print" id="printBtn">打印 / 存为 PDF（申请书 + 联名表）</button>
      <div class="card tipcard no-print">提交建议：先与 ${esc(c.streetOffice)} 确认是否接受电子签名汇总件。<br>· 接受电子件：复制申请书 + 下载联名表 CSV，连同本页签名、各业主身份证与产权证明打包提交；<br>· 需纸质件：打印本页（含签名列）与申请书，附证件复印件报送。</div>
    `
    document.getElementById('back').onclick = () => go('mine')
    document.getElementById('copyLetter').onclick = () => copyText(letter, '申请书已复制')
    document.getElementById('dlCsv').onclick = () => downloadCsv(data, c, today)
    document.getElementById('printBtn').onclick = () => window.print()
    v.querySelectorAll('.sign-thumb').forEach(img => { img.onclick = () => showLightbox(img.dataset.big) })
  }

  // 小区参数
  VIEWS.config = async function (v) {
    if (!requireAdmin()) return
    setTitle('小区参数')
    const { config: c } = await API.getConfig()
    const stageOpts = [
      ['collecting', '1 联名征集中'], ['submitted', '2 已提交申请·街道办受理'], ['group', '3 筹备组已成立'],
      ['enroll', '4 代表/委员报名遴选中'], ['meeting', '5 首次业主大会·选举中'], ['done', '6 业委会已成立·备案']
    ]
    const hl = c.headcountLabel || '业主总人数'
    function exRow (kind, label, has) {
      return `<div class="ex-row" data-kind="${kind}">
        <span class="ex-name">${label}</span>
        <span class="ex-state ${has ? 'on' : ''}">${has ? '已上传' : '未上传'}</span>
        ${has ? `<span class="ex-link ex-view" data-kind="${kind}">查看</span>` : ''}
        <button class="btn sm line ex-up" data-kind="${kind}">${has ? '替换' : '上传'}</button>
        ${has ? `<button class="btn sm danger ex-del" data-kind="${kind}">删除</button>` : ''}
        <input type="file" class="hidden ex-input" data-kind="${kind}" accept="application/pdf,image/*">
      </div>`
    }
    v.innerHTML = `
      <span class="back" id="back">‹ 返回</span>
      <div class="card"><div class="h2">小区基本信息</div>
        <div class="field"><div class="label">小区名称<span class="req">*</span></div><input class="input" id="c_name" value="${esc(c.communityName && c.communityName.indexOf('未设置') < 0 && c.communityName.indexOf('请') < 0 ? c.communityName : '')}" placeholder="如 阳光花园"></div>
        <div class="field"><div class="label">所属街道办事处<span class="req">*</span></div><input class="input" id="c_street" value="${esc(c.streetOffice && c.streetOffice.indexOf('未设置') < 0 && c.streetOffice.indexOf('请') < 0 ? c.streetOffice : '')}" placeholder="如 布吉街道办事处"></div>
        <div class="field"><div class="label">所属社区（居委会）</div><input class="input" id="c_comm" value="${esc(c.community || '')}" placeholder="如 XX社区，用于联名表表头"></div>
      </div>
      <div class="card"><div class="h2">本次联名</div>
        <div class="field"><div class="label">联名事项</div><input class="input" id="c_matter" value="${esc(c.lianmingMatter || '要求成立首次业主大会会议筹备组')}"></div>
        <div class="field"><div class="label">当前进展阶段</div><select id="c_stage">${stageOpts.map(o => `<option value="${o[0]}" ${(c.currentStage || 'collecting') === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select><div class="dim mt8">决定「指南」与首页路线图高亮哪一步。</div></div>
      </div>
      <div class="card"><div class="h2">门槛分母（决定进度计算）</div>
        <div class="field"><div class="label">人数口径分母<span class="req">*</span></div>
          <div class="seg"><span class="seg-i ${hl === '业主总人数' ? 'on' : ''}" data-hl="业主总人数">按总人数</span><span class="seg-i ${hl === '业主总户数' ? 'on' : ''}" data-hl="业主总户数">按总户数</span></div>
          <input class="input mt16" id="c_total" type="number" inputmode="numeric" value="${c.totalHouseholds || ''}" placeholder="填写人数/户数，如 1200">
          <div class="dim mt8">条例表述为"业主总人数"，部分街道按"户"认定；以你所属街道口径为准。</div></div>
        <div class="field"><div class="label">全体业主专有部分建筑面积合计（㎡）<span class="req">*</span></div><input class="input" id="c_area" type="number" inputmode="decimal" value="${c.totalArea || ''}" placeholder="投票权口径分母，如 96000"><div class="dim mt8">投票权数即专有部分建筑面积。</div></div>
      </div>
      <div class="card"><div class="h2">联系人与公告</div>
        <div class="field"><div class="label">联系人姓名</div><input class="input" id="c_iname" value="${esc(c.initiatorName || '')}" placeholder="申请书落款联系人"></div>
        <div class="field"><div class="label">联系电话</div><input class="input" id="c_iphone" type="tel" value="${esc(c.initiatorPhone || '')}"></div>
        <div class="field"><div class="label">首页公告标题（选填）</div><input class="input" id="c_ntitle" maxlength="60" value="${esc(c.noticeTitle || '')}" placeholder="如：告凯旋天玺名庭全体业主书"></div>
        <div class="field"><div class="label">首页公告正文（选填）</div>
          <textarea class="textarea ta-l" id="c_notice" placeholder="支持文章排版：&#10;· 空一行 = 分段&#10;· **文字** = 加粗&#10;· 行首 >> = 右对齐（用于落款）&#10;· 单独一行 --- = 分隔线">${esc(c.noticeText || '')}</textarea>
          <div class="dim mt8">排版语法：空行分段；<b>**加粗**</b>；行首 <b>&gt;&gt;</b> 右对齐落款；单行 <b>---</b> 分隔线。</div>
          <button class="btn sm line mt8" id="nPrevBtn" type="button">预览效果</button>
          <div id="nPrev" class="mt8"></div>
        </div>
      </div>
      <div class="card"><div class="h2">示例文件（联名页“查看示例”）</div>
        <div class="dim mt8">上传后，业主在“产权证明文件 / 身份证证件照片”下方会出现“查看示例”链接。支持 PDF 或图片，示例对所有业主可见。</div>
        <div class="mt16">${exRow('cert', '产权证明示例', c.hasExampleCert)}${exRow('idfront', '身份证人像面示例', c.hasExampleIdFront)}${exRow('idback', '身份证国徽面示例', c.hasExampleIdBack)}</div>
      </div>
      <div class="card"><div class="h2">楼栋房号与面积选项</div>
        <div class="dim mt8">业主在联名页通过下拉选择，选项在此维护：每行一个值（也可用逗号分隔）。取消勾选可在联名表单中隐藏对应项（至少保留“房”）。</div>
        <div class="opt-block mt16">
          <label class="opt-head"><input type="checkbox" id="v_building" ${c.showBuilding ? 'checked' : ''}> 显示「栋」</label>
          <textarea class="textarea ta-s" id="o_building" placeholder="每行一个，如：&#10;1&#10;2&#10;3">${esc((c.buildingOptions || []).join('\n'))}</textarea>
        </div>
        <div class="opt-block">
          <label class="opt-head"><input type="checkbox" id="v_unit" ${c.showUnit ? 'checked' : ''}> 显示「座」</label>
          <textarea class="textarea ta-s" id="o_unit" placeholder="每行一个，如：&#10;A&#10;B&#10;C">${esc((c.unitOptions || []).join('\n'))}</textarea>
        </div>
        <div class="opt-block">
          <label class="opt-head"><input type="checkbox" id="v_room" ${c.showRoom ? 'checked' : ''}> 显示「房」</label>
          <textarea class="textarea ta-l" id="o_room" placeholder="值较多，每行一个，如：&#10;0101&#10;0102&#10;…&#10;3204">${esc((c.roomOptions || []).join('\n'))}</textarea>
        </div>
        <div class="opt-block">
          <div class="opt-head">房屋建筑面积（㎡）可选值</div>
          <textarea class="textarea ta-l" id="o_area" placeholder="每行一个，如：&#10;26.47&#10;50.9&#10;88.50">${esc((c.areaOptions || []).join('\n'))}</textarea>
        </div>
      </div>
      <div class="card"><div class="h2">各阶段时间（用于首页进度时间轴）</div>
        <div class="dim mt8">填写每一步的日期，业主端首页会以时间轴直观展示进度；未填写的步骤显示“待定”。</div>
        <div class="mt16">${STAGES.map((k, i) => `<div class="field dt-field"><div class="label">${esc(stageOpts[i][1])}</div><input class="input" type="date" id="d_${k}" value="${esc((c.stageDates && c.stageDates[k]) || '')}"></div>`).join('')}</div>
      </div>
      <button class="btn" id="saveBtn">保存设置</button>
    `
    document.getElementById('back').onclick = () => go('mine')
    v.querySelectorAll('.ex-view').forEach(el => { el.onclick = () => showFilePreview(API.exampleUrl(el.dataset.kind), '示例文件') })
    v.querySelectorAll('.ex-up').forEach(btn => btn.onclick = () => { const inp = v.querySelector('.ex-input[data-kind="' + btn.dataset.kind + '"]'); inp.click() })
    v.querySelectorAll('.ex-input').forEach(inp => inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return
      UI.loading(true)
      try { await API.uploadExample(store.adminToken, inp.dataset.kind, f); UI.loading(false); UI.toast('示例已上传'); render() }
      catch (e) { UI.loading(false); UI.toast(e.message) }
    })
    v.querySelectorAll('.ex-del').forEach(btn => btn.onclick = async () => {
      const okd = await UI.dialog({ title: '删除示例', body: '确定删除该示例文件？业主将不再看到“查看示例”。', danger: true, okText: '删除' })
      if (!okd) return
      UI.loading(true)
      try { await API.deleteExample(store.adminToken, btn.dataset.kind); UI.loading(false); UI.toast('已删除'); render() }
      catch (e) { UI.loading(false); UI.toast(e.message) }
    })
    let headcountLabel = hl
    v.querySelectorAll('.seg-i').forEach(s => s.onclick = () => {
      headcountLabel = s.dataset.hl
      v.querySelectorAll('.seg-i').forEach(x => x.classList.toggle('on', x.dataset.hl === headcountLabel))
    })
    document.getElementById('nPrevBtn').onclick = () => {
      const box = document.getElementById('nPrev')
      const html = renderNotice(val('c_ntitle'), val('c_notice'))
      box.innerHTML = html || '<span class="dim">（无内容）</span>'
    }
    document.getElementById('saveBtn').onclick = async () => {
      const parseOpts = t => { const seen = {}; return String(t || '').split(/[\n,，、;；]+/).map(x => x.trim()).filter(x => x && !seen[x] && (seen[x] = 1)) }
      const payload = {
        communityName: val('c_name'), streetOffice: val('c_street'), community: val('c_comm'),
        lianmingMatter: val('c_matter'), currentStage: document.getElementById('c_stage').value,
        headcountLabel, totalHouseholds: val('c_total'), totalArea: val('c_area'),
        initiatorName: val('c_iname'), initiatorPhone: val('c_iphone'), noticeText: val('c_notice'), noticeTitle: val('c_ntitle'),
        stageDates: STAGES.reduce((o, k) => { const el = document.getElementById('d_' + k); if (el && el.value) o[k] = el.value; return o }, {}),
        buildingOptions: parseOpts(val('o_building')),
        unitOptions: parseOpts(val('o_unit')),
        roomOptions: parseOpts(val('o_room')),
        areaOptions: parseOpts(val('o_area')),
        showBuilding: document.getElementById('v_building').checked,
        showUnit: document.getElementById('v_unit').checked,
        showRoom: document.getElementById('v_room').checked
      }
      if (!payload.communityName.trim()) return UI.toast('请填写小区名称')
      if (!payload.streetOffice.trim()) return UI.toast('请填写街道办名称')
      if (!(parseInt(payload.totalHouseholds, 10) > 0)) return UI.toast('请填写业主总人数/户数')
      if (!(Number(payload.totalArea) > 0)) return UI.toast('请填写建筑面积总数')
      if (!payload.showBuilding && !payload.showUnit && !payload.showRoom) return UI.toast('「栋 / 座 / 房」至少保留一项显示')
      if (payload.showBuilding && !payload.buildingOptions.length) return UI.toast('已勾选显示「栋」，请填写栋的可选值')
      if (payload.showUnit && !payload.unitOptions.length) return UI.toast('已勾选显示「座」，请填写座的可选值')
      if (payload.showRoom && !payload.roomOptions.length) return UI.toast('已勾选显示「房」，请填写房的可选值')
      if (!payload.areaOptions.length) return UI.toast('请填写建筑面积可选值')
      UI.loading(true)
      try { await API.saveConfig(store.adminToken, payload); UI.loading(false); UI.toast('已保存'); go('mine') }
      catch (e) { UI.loading(false); UI.toast(e.message) }
    }
  }

  /* ---------------- 工具 ---------------- */
  function val (id) { const el = document.getElementById(id); return el ? el.value : '' }
  function fmtDate (d) { return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` }
  // 首页公告排版渲染：先整体转义防 XSS，再应用极简语法
  // 语法：空行=分段；**文字**=加粗；行首 >> =右对齐（落款）；单独一行 --- =分隔线
  function renderNotice (title, text) {
    title = (title || '').trim(); text = String(text || '').replace(/\r\n?/g, '\n').trim()
    if (!title && !text) return ''
    const paras = text.split(/\n{2,}/).map(raw => {
      if (raw.trim() === '---') return '<hr class="nt-hr">'
      let p = esc(raw)
      p = p.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      const lines = p.split('\n').map(l => /^&gt;&gt;/.test(l.trim())
        ? '<span class="nt-right">' + l.trim().replace(/^&gt;&gt;\s*/, '') + '</span>'
        : l)
      return '<p>' + lines.join('<br>') + '</p>'
    }).join('')
    return `<div class="notice-art${title ? ' with-title' : ''}">${title ? `<div class="nt-title">${esc(title)}</div>` : ''}${paras}</div>`
  }
  // 点击签名缩略图放大
  function showLightbox (url) {
    if (!url) return
    const ov = document.createElement('div')
    ov.className = 'lightbox'
    ov.innerHTML = `<img src="${url}" alt="签名"><span class="lb-close">×</span>`
    ov.onclick = () => ov.remove()
    document.body.appendChild(ov)
  }
  // 当前窗口内预览文件（PDF/图片），用 iframe，不开新标签页
  function showFilePreview (url, title) {
    if (!url) return
    const ov = document.createElement('div')
    ov.className = 'fprev'
    ov.innerHTML = `<div class="fprev-bar"><span class="fprev-title">${title ? esc(title) : '文件预览'}</span><span class="fprev-x" id="fprevX">关闭 ×</span></div><iframe class="fprev-frame" src="${url}"></iframe>`
    document.body.appendChild(ov)
    ov.querySelector('#fprevX').onclick = () => ov.remove()
  }
  // 给身份证照片打半透明平铺水印，返回带水印的 JPEG File
  function watermarkImage (file, text) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        try {
          const MAX = 1600
          let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
          const scale = Math.min(1, MAX / Math.max(w, h || 1))
          w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale))
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h
          const ctx = cv.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          ctx.save()
          ctx.translate(w / 2, h / 2)
          ctx.rotate(-Math.PI / 6)
          const fz = Math.max(16, Math.round(w / 16))
          ctx.font = fz + 'px sans-serif'
          ctx.fillStyle = 'rgba(0,0,0,0.22)'
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          const stepX = ctx.measureText(text).width + fz * 2
          const stepY = fz * 3.2
          const R = Math.ceil(Math.max(w, h) / Math.min(stepX, stepY)) + 2
          for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) ctx.fillText(text, i * stepX, j * stepY)
          ctx.restore()
          cv.toBlob(b => { b ? resolve(new File([b], (file.name || 'id').replace(/\.[^.]+$/, '') + '_wm.jpg', { type: 'image/jpeg' })) : reject(new Error('水印处理失败')) }, 'image/jpeg', 0.85)
        } catch (e) { reject(e) }
      }
      img.onerror = () => reject(new Error('图片读取失败'))
      img.src = URL.createObjectURL(file)
    })
  }
  function copyText (text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => UI.toast(okMsg)).catch(() => fallback())
    } else fallback()
    function fallback () {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); UI.toast(okMsg) } catch (e) { UI.toast('复制失败，请手动选择') }
      ta.remove()
    }
  }
  function downloadCsv (data, c, today) {
    const head = ['序号', '业主姓名', '楼栋房号', '房屋建筑面积(㎡)', '联系方式', '业主本人签名']
    const rows = data.list.map((d, i) => [i + 1, d.name, d.roomFull, Number(d.area).toFixed(2), d.phone || '', ''])
    const meta = [`${c.communityName} 业主联名表 · ${c.community || ''}社区 · 联名时间:${today}`]
    const all = [meta, [], head, ...rows, [], ['备注：联名业主需提供身份证复印件、产权证明复印件。签名见系统内电子签名或打印件。']]
    const csv = '\ufeff' + all.map(r => r.map(cell => {
      const s = String(cell == null ? '' : cell)
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${c.communityName || '小区'}_业主联名表_${today}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    UI.toast('联名表 CSV 已下载')
  }

  // 签名板（鼠标 + 触摸 + 笔）
  function makeSignaturePad (canvas, hint) {
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    function resize () {
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width * dpr; canvas.height = r.height * dpr
      ctx.scale(dpr, dpr)
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = '#1f2328'
    }
    resize()
    let drawing = false, last = null, inked = false
    function pos (e) {
      const r = canvas.getBoundingClientRect()
      const t = e.touches ? e.touches[0] : e
      return { x: t.clientX - r.left, y: t.clientY - r.top }
    }
    function start (e) { e.preventDefault(); drawing = true; last = pos(e); if (!inked) { inked = true; if (hint) hint.style.display = 'none' } }
    function move (e) {
      if (!drawing) return
      e.preventDefault()
      const p = pos(e)
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p
    }
    function end () { drawing = false; last = null }
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', end)
    return {
      isEmpty: () => !inked,
      clear () { ctx.clearRect(0, 0, canvas.width, canvas.height); inked = false; if (hint) hint.style.display = '' },
      toDataURL () {
        // 铺白底再导出，避免透明 PNG 在打印件不可见
        const w = canvas.width, h = canvas.height
        const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h
        const tctx = tmp.getContext('2d')
        tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, w, h)
        tctx.drawImage(canvas, 0, 0)
        return tmp.toDataURL('image/png')
      }
    }
  }

  // 启动
  if (!location.hash) location.hash = '#/home'
  render()
})()
