// ============ 主程序 ============
(function () {
  const esc = UI.esc
  const C = window.CONTENT
  const TABS = ['home', 'register', 'guide', 'mine']
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

    const roadmap = C.stages.map((st, i) => {
      const cls = curNo > i + 1 ? 'done' : (curNo === i + 1 ? 'cur' : '')
      const line = i < 5 ? `<div class="rm-line ${curNo > i + 1 ? 'done' : ''}"></div>` : ''
      return `<div class="rm-node ${cls}"><div class="rm-dot">${i + 1}</div><div class="rm-label">${esc(st.short)}</div></div>${line}`
    }).join('')

    v.innerHTML = bannerHtml() + `
      <div class="card">
        <div class="row between"><div class="h1">${esc(cm.communityName)}</div>
          ${s.qualified ? '<span class="badge ok">已达标</span>' : '<span class="badge wait">征集中</span>'}</div>
        <div class="dim mt8">拟向 ${esc(cm.streetOffice)} 书面要求成立首次业主大会会议筹备组</div>
        ${cm.noticeText ? `<div class="notice mt16">${esc(cm.noticeText)}</div>` : ''}
        ${!cm.configured ? '<div class="warnbox mt16">尚未设置小区总人数与建筑面积总数，进度暂无法计算。请发起人在「小区参数」中填写。</div>' : ''}
      </div>

      <div class="card" id="goGuide" style="cursor:pointer">
        <div class="row between"><div class="h2" style="margin:0">成立业委会进展</div><span class="dim">第 ${curNo}/6 步 ›</span></div>
        <div class="roadmap mt16">${roadmap}</div>
        <div class="dim mt8">点开查看每一步要做什么、用哪些官方文书 →</div>
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
          : (cm.configured ? `<div class="tip mt16" style="background:#f7f8fa;color:var(--ink-2)">还差：人数再 ${s.needHeadcount} 户，或建筑面积再 ${s.needArea} ㎡，即可达标。</div>` : '')}
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
    v.innerHTML = bannerHtml() + `
      <div class="card">
        <div class="h2">业主联名登记</div>
        <div class="matter mt8">联名事项：${esc(matter)}</div>
        <div class="dim mt8">本人作为 ${esc(cmName)} 下列房屋的业主，自愿联名${esc(matter)}。请如实填写，提交后由发起人核验证件。</div>
      </div>
      <div class="card">
        <div class="field"><div class="label">业主姓名<span class="req">*</span></div><input class="input" id="f_name" placeholder="与产权证一致" value="${m ? esc(m.name) : ''}"></div>
        <div class="field"><div class="label">楼栋房号<span class="req">*</span></div>
          <div class="three"><input class="input" id="f_building" placeholder="栋 如3栋" value="${m ? esc(m.building) : ''}"><input class="input" id="f_unit" placeholder="单元" value="${m ? esc(m.unit) : ''}"><input class="input" id="f_room" placeholder="房号 如1502" value="${m ? esc(m.room) : ''}"></div></div>
        <div class="field"><div class="label">房屋建筑面积（㎡）<span class="req">*</span></div><input class="input" id="f_area" type="number" inputmode="decimal" placeholder="见产权证，如 89.50" value="${m ? m.area : ''}"><div class="dim mt8">即你的投票权数。请填写产权证载明的建筑面积。</div></div>
        <div class="field"><div class="label">联系方式<span class="req">*</span></div><input class="input" id="f_phone" type="tel" inputmode="numeric" placeholder="11 位手机号" value="${m ? esc(m.phone) : ''}"></div>
        <div class="field"><div class="label">不动产权证号 / 房产证号（选填）</div><input class="input" id="f_certNo" placeholder="选填，有助于加快审核" value="${m ? esc(m.certNo || '') : ''}"></div>
      </div>
      <div class="card">
        <div class="label">证件照片（手册要求：产权证明 + 身份证复印件）</div>
        <div class="dim mt8">用于发起人核验业主身份，照片仅发起人可见。</div>
        <div class="certs mt16">
          <div class="cert-cell"><div id="certBox" class="cert-add">＋ 产权证明</div><input id="certInput" type="file" accept="image/*" class="hidden"><div class="cert-cap">产权证 / 不动产权证</div></div>
          <div class="cert-cell"><div id="idBox" class="cert-add">＋ 身份证</div><input id="idInput" type="file" accept="image/*" class="hidden"><div class="cert-cap">身份证</div></div>
        </div>
      </div>
      <div class="card">
        <div class="label">业主本人签名<span class="req">*</span></div>
        <div class="dim mt8">请用手指/鼠标在下方手写签名。</div>
        <div class="sig-box mt16"><canvas id="sigCanvas" class="sig-canvas"></canvas><div class="sig-hint" id="sigHint">在此处手写签名</div></div>
        <div class="sig-tools"><span class="sig-clear" id="sigClear">清除重写</span></div>
      </div>
      <button class="btn" id="submitBtn">提交联名</button>
      ${m ? '<button class="btn line mt16" id="cancelEdit">取消</button>' : ''}
      <div class="dim mt24" style="padding:0 4px">提交即表示你确认上述信息真实，并同意以本次电子签名作为联名${esc(matter)}的意思表示。</div>
    `

    // 文件选择
    let certFile = null, idFile = null
    bindUpload('certBox', 'certInput', f => { certFile = f })
    bindUpload('idBox', 'idInput', f => { idFile = f })
    function bindUpload (boxId, inputId, set) {
      const box = document.getElementById(boxId), input = document.getElementById(inputId)
      box.onclick = () => input.click()
      input.onchange = () => {
        const f = input.files[0]; if (!f) return
        set(f)
        const url = URL.createObjectURL(f)
        box.outerHTML = `<img class="cert-img" src="${url}" id="${boxId}">`
        document.getElementById(boxId).onclick = () => input.click()
      }
    }

    // 签名板
    const pad = makeSignaturePad(document.getElementById('sigCanvas'), document.getElementById('sigHint'))
    document.getElementById('sigClear').onclick = () => pad.clear()

    if (m) document.getElementById('cancelEdit').onclick = () => { window._regEditing = null; render() }

    document.getElementById('submitBtn').onclick = async () => {
      const fields = {
        name: val('f_name'), building: val('f_building'), unit: val('f_unit'), room: val('f_room'),
        area: val('f_area'), phone: val('f_phone'), certNo: val('f_certNo')
      }
      if (!fields.name.trim()) return UI.toast('请填写业主姓名')
      if (!fields.room.trim()) return UI.toast('请填写房号')
      if (!/^1\d{10}$/.test(fields.phone.trim())) return UI.toast('请填写正确的手机号')
      if (!(Number(fields.area) > 0)) return UI.toast('请填写房屋建筑面积')
      if (pad.isEmpty()) return UI.toast('请先手写签名')

      UI.loading(true)
      try {
        const signFile = UI.dataURLtoFile(pad.toDataURL(), 'sign.png')
        const res = await API.submitSignature(fields, { cert: certFile, id: idFile, sign: signFile }, store.editToken)
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
        <div class="entry" data-go="property"><div class="e-t">换物业指南</div><div class="e-d">成立后怎么换</div></div>
        <div class="entry" data-go="glossary"><div class="e-t">名词解释</div><div class="e-d">联名/公示/表决</div></div>
        <div class="entry" data-go="templates"><div class="e-t">官方文书库</div><div class="e-d">30 份示范文本</div></div>
      </div>
      ${steps}
      <div class="dim foot">流程依据《龙岗区业主大会及业主委员会工作指导手册》。各步具体材料、时限与公示要求，以手册及所属街道办要求为准。</div>
    `
    v.querySelectorAll('.entry').forEach(e => e.onclick = () => go(e.dataset.go))
    v.querySelectorAll('.step-head').forEach(hd => hd.onclick = () => {
      const i = Number(hd.dataset.i)
      window._guideExp = (exp === i ? -1 : i)
      render()
    })
  }

  // 我的
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
  VIEWS.property = async function (v) {
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
    const idUrl = API.fileUrl(store.adminToken, id, 'id')
    const signUrl = API.fileUrl(store.adminToken, id, 'sign')
    const hasCert = rec.hasCert !== undefined ? rec.hasCert : !!certUrl
    const hasId = rec.hasId !== undefined ? rec.hasId : !!idUrl
    v.innerHTML = `
      <span class="back" id="back">‹ 返回</span>
      <div class="card">
        <div class="row between"><div class="h2">${esc(rec.name)}</div><span class="badge ${rec.status === 'approved' ? 'ok' : (rec.status === 'rejected' ? 'no' : 'wait')}">${rec.status === 'approved' ? '已通过' : (rec.status === 'rejected' ? '已驳回' : '待审核')}</span></div>
        <div class="kv"><span class="k">楼栋房号</span><span class="v">${esc(rec.roomFull)}</span></div>
        <div class="kv"><span class="k">房屋建筑面积</span><span class="v">${rec.area} ㎡（投票权数）</span></div>
        <div class="kv"><span class="k">联系方式</span><span class="v">${esc(rec.phone)}</span></div>
        ${rec.certNo ? `<div class="kv"><span class="k">证号</span><span class="v">${esc(rec.certNo)}</span></div>` : ''}
        ${rec.dupRoom ? '<div class="tip no mt16">注意：存在与该房号相同的其他提交，请核对避免重复计数。</div>' : ''}
        ${rec.reviewNote ? `<div class="kv"><span class="k">审核备注</span><span class="v">${esc(rec.reviewNote)}</span></div>` : ''}
      </div>
      <div class="card"><div class="label">产权证 / 不动产权证照片</div>${hasCert ? `<img class="big" src="${certUrl}">` : '<div class="dim mt8">未上传照片</div>'}</div>
      <div class="card"><div class="label">身份证照片</div>${hasId ? `<img class="big" src="${idUrl}">` : '<div class="dim mt8">未上传照片</div>'}</div>
      <div class="card"><div class="label">手写签名</div>${signUrl ? `<img class="sig-show" src="${signUrl}">` : '<div class="dim mt8">无签名</div>'}</div>
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
    const streetShort = (c.streetOffice || '').replace('深圳市龙岗区', '').replace('街道办事处', '')
    const letter =
`关于${c.communityName}成立首次业主大会会议筹备组申请书
（百分之二十以上业主联名）

深圳市龙岗区${streetShort || '＿＿'}街道办事处：

  ${c.communityName}业主总人数为 ${c.totalHouseholds} 人，业主专有部分总建筑面积（总投票权数）为 ${c.totalArea} 平方米，现本小区已符合以下条件：

  ${hc}物业管理区域内 ${data.count} 名业主联名，占业主总人数 ${data.headcountPct}%（达到百分之二十以上）。

  ${ar}物业管理区域内持有专有部分建筑面积 ${data.totalSignArea} 平方米的业主联名，占全体业主总投票权数 ${data.areaPct}%（达到百分之二十以上）。

  根据《深圳经济特区物业管理条例》第十九条规定，特向街道办事处书面申请成立首次业主大会会议筹备组。

  附件：2-1. 业主联名表（共 ${data.count} 人）

  （联系人：${c.initiatorName || '＿＿＿＿'}；联系方式：${c.initiatorPhone || '＿＿＿＿＿＿'}）

  ${c.communityName}全体联名业主
  ${today}`

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
        <div class="letter mt16" id="letterText">${esc(letter)}</div>
      </div>

      <div class="card">
        <div class="row between no-print"><div class="h2">业主联名表（附件2-1）</div><button class="btn sm line" id="dlCsv">下载 CSV</button></div>
        <div class="dim mt8">${esc(c.community || '')} 社区 · ${esc(c.communityName)} · 联名时间 ${today}</div>
        <div class="thead mt16"><span class="c-no">序号</span><span class="c-name">业主姓名</span><span class="c-room">楼栋房号</span><span class="c-area">建筑面积</span></div>
        ${data.list.map((d, i) => `<div class="trow"><span class="c-no">${i + 1}</span><span class="c-name">${esc(d.name)}</span><span class="c-room">${esc(d.roomFull)}</span><span class="c-area">${d.area}</span></div>`).join('')}
        ${data.list.length === 0 ? '<div class="empty">尚无已通过的联名</div>' : ''}
        <div class="note mt16">备注：联名业主需提供身份证复印件、产权证明复印件。</div>
      </div>

      <div class="card no-print">
        <div class="row between"><div class="h2">业主本人签名</div><button class="btn sm line" id="toggleSign">展开签名</button></div>
        <div id="signWrap" class="dim mt8">展开后可逐条查看 / 截图，作为纸质联名表的签名页。</div>
      </div>

      <button class="btn no-print" id="printBtn">打印 / 存为 PDF（申请书 + 联名表）</button>
      <div class="card tipcard no-print">提交建议：先与 ${esc(c.streetOffice)} 确认是否接受电子签名汇总件。<br>· 接受电子件：复制申请书 + 下载联名表 CSV，连同签名截图、各业主身份证与产权证照片打包提交；<br>· 需纸质件：打印申请书与联名表，附签名页与证件复印件报送。</div>
    `
    document.getElementById('back').onclick = () => go('mine')
    document.getElementById('copyLetter').onclick = () => copyText(letter, '申请书已复制')
    document.getElementById('dlCsv').onclick = () => downloadCsv(data, c, today)
    document.getElementById('printBtn').onclick = () => window.print()
    document.getElementById('toggleSign').onclick = () => {
      const wrap = document.getElementById('signWrap')
      if (wrap.dataset.open === '1') { wrap.dataset.open = '0'; wrap.className = 'dim mt8'; wrap.innerHTML = '展开后可逐条查看 / 截图，作为纸质联名表的签名页。' ; document.getElementById('toggleSign').textContent = '展开签名'; return }
      wrap.dataset.open = '1'; wrap.className = 'signs mt16'
      wrap.innerHTML = data.list.map((d, i) => {
        const url = d.signData || API.fileUrl(store.adminToken, d.id || '', 'sign')
        return `<div class="sign-cell">${url ? `<img class="sign-img" src="${url}">` : '<div class="dim">无</div>'}<div class="sign-cap">${esc(d.name)} · ${esc(d.roomFull)}</div></div>`
      }).join('')
      document.getElementById('toggleSign').textContent = '收起'
    }
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
        <div class="field"><div class="label">首页公告（选填）</div><textarea class="textarea" id="c_notice" placeholder="如：签字截止时间、线下核验地点等">${esc(c.noticeText || '')}</textarea></div>
      </div>
      <button class="btn" id="saveBtn">保存设置</button>
    `
    document.getElementById('back').onclick = () => go('mine')
    let headcountLabel = hl
    v.querySelectorAll('.seg-i').forEach(s => s.onclick = () => {
      headcountLabel = s.dataset.hl
      v.querySelectorAll('.seg-i').forEach(x => x.classList.toggle('on', x.dataset.hl === headcountLabel))
    })
    document.getElementById('saveBtn').onclick = async () => {
      const payload = {
        communityName: val('c_name'), streetOffice: val('c_street'), community: val('c_comm'),
        lianmingMatter: val('c_matter'), currentStage: document.getElementById('c_stage').value,
        headcountLabel, totalHouseholds: val('c_total'), totalArea: val('c_area'),
        initiatorName: val('c_iname'), initiatorPhone: val('c_iphone'), noticeText: val('c_notice')
      }
      if (!payload.communityName.trim()) return UI.toast('请填写小区名称')
      if (!payload.streetOffice.trim()) return UI.toast('请填写街道办名称')
      if (!(parseInt(payload.totalHouseholds, 10) > 0)) return UI.toast('请填写业主总人数/户数')
      if (!(Number(payload.totalArea) > 0)) return UI.toast('请填写建筑面积总数')
      UI.loading(true)
      try { await API.saveConfig(store.adminToken, payload); UI.loading(false); UI.toast('已保存'); go('mine') }
      catch (e) { UI.loading(false); UI.toast(e.message) }
    }
  }

  /* ---------------- 工具 ---------------- */
  function val (id) { const el = document.getElementById(id); return el ? el.value : '' }
  function fmtDate (d) { return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` }
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
    const head = ['序号', '业主姓名', '楼栋房号', '房屋建筑面积(㎡)', '联系方式']
    const rows = data.list.map((d, i) => [i + 1, d.name, d.roomFull, d.area, d.phone || ''])
    const meta = [`${c.community || ''}社区 ${c.communityName} 业主联名表 联名时间:${today}`]
    const all = [meta, [], head, ...rows, [], ['备注：联名业主需提供身份证复印件、产权证明复印件。']]
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
