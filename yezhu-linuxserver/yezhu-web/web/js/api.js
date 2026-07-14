// ============ 数据层 ============
// CONFIG.API_BASE_URL：
//   ''            → 本地预览（localStorage，单机演示）
//   'auto'        → 同源相对请求 /api/...（宝塔一体化部署推荐，换域名/IP都不用改）
//   'https://...' → 指定后端地址（前后端分离时用）
window.API = (function () {
  const RAW = (window.CONFIG.API_BASE_URL || '').trim()
  const PREVIEW = RAW === ''
  const SAME_ORIGIN = RAW.toLowerCase() === 'auto'
  const BASE = SAME_ORIGIN ? '' : RAW.replace(/\/$/, '')
  const LIVE = !PREVIEW
  const STAGES = ['collecting', 'submitted', 'group', 'enroll', 'meeting', 'done']

  const DEFAULT_CONFIG = {
    communityName: '', streetOffice: '', community: '',
    totalHouseholds: 0, totalArea: 0, thresholdPct: 0.2,
    headcountLabel: '业主总人数',
    lianmingMatter: '要求成立首次业主大会会议筹备组',
    currentStage: 'collecting',
    initiatorName: '', initiatorPhone: '', noticeText: '', noticeTitle: '', stageDates: {},
    buildingOptions: [],
    unitOptions: ['A', 'B', 'C'],
    roomOptions: [],
    areaOptions: ['26.47', '26.48', '50.9', '57.51', '57.67', '58.22', '59.78', '59.95'],
    showBuilding: false, showUnit: true, showRoom: true
  }

  /* ---------- HTTP ---------- */
  async function http (path, { method = 'GET', body, token, isForm } = {}) {
    const headers = {}
    if (token) headers['Authorization'] = 'Bearer ' + token
    let payload = body
    if (body && !isForm) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
    const res = await fetch(BASE + path, { method, headers, body: payload })
    let data = null
    try { data = await res.json() } catch (e) {}
    if (!res.ok || (data && data.ok === false)) {
      const msg = (data && (data.msg || data.error)) || ('请求失败 ' + res.status)
      throw new Error(msg)
    }
    return data ? data.data : null
  }

  /* ---------- 本地预览存储 ---------- */
  const LS = {
    get cfg () { try { return Object.assign({}, DEFAULT_CONFIG, JSON.parse(localStorage.getItem('yz_cfg') || '{}')) } catch (e) { return Object.assign({}, DEFAULT_CONFIG) } },
    set cfg (v) { localStorage.setItem('yz_cfg', JSON.stringify(v)) },
    get sigs () { try { return JSON.parse(localStorage.getItem('yz_sigs') || '[]') } catch (e) { return [] } },
    set sigs (v) { localStorage.setItem('yz_sigs', JSON.stringify(v)) },
    get pass () { return localStorage.getItem('yz_pass') || '' },
    set pass (v) { localStorage.setItem('yz_pass', v) },
    get examples () { try { return JSON.parse(localStorage.getItem('yz_ex') || '{}') } catch (e) { return {} } },
    set examples (v) { localStorage.setItem('yz_ex', JSON.stringify(v)) },
    get faq () {
      const raw = localStorage.getItem('yz_faq')
      if (raw == null) return ((typeof FAQ_SEED !== 'undefined' && FAQ_SEED) || window.FAQ_SEED || []).map(x => Object.assign({}, x))
      try { return JSON.parse(raw) || [] } catch (e) { return [] }
    },
    set faq (v) { localStorage.setItem('yz_faq', JSON.stringify(v)) },
    get feedback () { try { return JSON.parse(localStorage.getItem('yz_fb') || '[]') } catch (e) { return [] } },
    set feedback (v) { localStorage.setItem('yz_fb', JSON.stringify(v)) },
    get propCats () {
      const raw = localStorage.getItem('yz_pc')
      if (raw == null) return ((typeof PROP_SEED !== 'undefined' && PROP_SEED) || window.PROP_SEED || []).map(x => Object.assign({}, x))
      try { return JSON.parse(raw) || [] } catch (e) { return [] }
    },
    set propCats (v) { localStorage.setItem('yz_pc', JSON.stringify(v)) },
    get fp () { let f = localStorage.getItem('yz_fp'); if (!f) { f = uid(); localStorage.setItem('yz_fp', f) } return f }
  }

  function computeStats (cfg, sigs) {
    const th = cfg.thresholdPct || 0.2
    const approved = sigs.filter(s => s.status === 'approved')
    const approvedCount = approved.length
    const approvedArea = approved.reduce((a, s) => a + (Number(s.area) || 0), 0)
    const headcountPct = cfg.totalHouseholds > 0 ? approvedCount / cfg.totalHouseholds : 0
    const areaPct = cfg.totalArea > 0 ? approvedArea / cfg.totalArea : 0
    const headcountReached = cfg.totalHouseholds > 0 && headcountPct >= th
    const areaReached = cfg.totalArea > 0 && areaPct >= th
    return {
      community: {
        communityName: cfg.communityName || '（未设置小区名称）',
        streetOffice: cfg.streetOffice || '（未设置街道办）',
        community: cfg.community || '',
        totalHouseholds: cfg.totalHouseholds, totalArea: cfg.totalArea,
        headcountLabel: cfg.headcountLabel || '业主总人数',
        lianmingMatter: cfg.lianmingMatter || DEFAULT_CONFIG.lianmingMatter,
        currentStage: cfg.currentStage || 'collecting',
        thresholdPct: th, noticeText: cfg.noticeText || '', noticeTitle: cfg.noticeTitle || '',
        stageDates: cfg.stageDates || {},
        buildingOptions: cfg.buildingOptions || [],
        unitOptions: cfg.unitOptions || [],
        roomOptions: cfg.roomOptions || [],
        areaOptions: cfg.areaOptions || [],
        showBuilding: !!cfg.showBuilding, showUnit: !!cfg.showUnit, showRoom: !!cfg.showRoom,
        hasExampleCert: !!(LS.examples && LS.examples.cert),
        hasExampleIdFront: !!(LS.examples && LS.examples.idfront),
        hasExampleIdBack: !!(LS.examples && LS.examples.idback),
        configured: cfg.totalHouseholds > 0 && cfg.totalArea > 0
      },
      approvedCount, approvedArea: +approvedArea.toFixed(2),
      pendingCount: sigs.filter(s => s.status === 'pending').length,
      rejectedCount: sigs.filter(s => s.status === 'rejected').length,
      headcountPct: +(headcountPct * 100).toFixed(2),
      areaPct: +(areaPct * 100).toFixed(2),
      headcountReached, areaReached,
      qualified: headcountReached || areaReached,
      needHeadcount: Math.max(0, Math.ceil(cfg.totalHouseholds * th) - approvedCount),
      needArea: Math.max(0, +(cfg.totalArea * th - approvedArea).toFixed(2))
    }
  }

  function uid () { return 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36) }
  function normRoom (b, u, r) {
    b = (b || '').replace(/\s/g, ''); u = (u || '').replace(/\s/g, ''); r = (r || '').replace(/\s/g, '')
    return (b ? b + '栋' : '') + (u ? u + '座' : '') + (r ? r + '房' : '')
  }

  /* ---------- 对外接口（两种模式同名） ---------- */
  return {
    LIVE,

    getStats () {
      if (LIVE) return http('/api/stats')
      return Promise.resolve(computeStats(LS.cfg, LS.sigs))
    },

    getConfig () {
      if (LIVE) return http('/api/config')
      const c = LS.cfg
      return Promise.resolve({ config: Object.assign({}, c, {
        configured: c.totalHouseholds > 0 && c.totalArea > 0,
        stageDates: c.stageDates || {},
        hasExampleCert: !!(LS.examples && LS.examples.cert),
        hasExampleIdFront: !!(LS.examples && LS.examples.idfront),
        hasExampleIdBack: !!(LS.examples && LS.examples.idback)
      }) })
    },

    // 业主端：用 editToken 找回自己的记录
    getMine (editToken) {
      if (!editToken) return Promise.resolve({ mine: null })
      if (LIVE) return http('/api/mine', { method: 'POST', body: { editToken } })
      const s = LS.sigs.find(x => x.editToken === editToken) || null
      return Promise.resolve({ mine: s })
    },

    // 提交联名。fields + 文件（产权证明 cert / 身份证人像 idFront / 国徽 idBack / 签名 sign）。
    async submitSignature (fields, files, editToken) {
      if (!files.sign) throw new Error('请完成手写签名')
      if (LIVE) {
        const fd = new FormData()
        Object.keys(fields).forEach(k => fd.append(k, fields[k]))
        if (editToken) fd.append('editToken', editToken)
        if (files.cert) fd.append('cert', files.cert)
        if (files.idFront) fd.append('idFront', files.idFront)
        if (files.idBack) fd.append('idBack', files.idBack)
        fd.append('sign', files.sign) // File
        return http('/api/signatures', { method: 'POST', body: fd, isForm: true })
      }
      // 本地：文件转 dataURL 存入记录
      const toData = f => typeof f === 'string' ? Promise.resolve(f) : new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f) })
      const certData = files.cert ? await toData(files.cert) : ''
      const idFrontData = files.idFront ? await toData(files.idFront) : ''
      const idBackData = files.idBack ? await toData(files.idBack) : ''
      const signData = await toData(files.sign)
      const sigs = LS.sigs
      const roomFull = normRoom(fields.building, fields.unit, fields.room)
      const rec = {
        id: uid(), editToken: editToken || uid(),
        name: (fields.name || '').trim(), building: (fields.building || '').trim(), unit: fields.unit || '', room: (fields.room || '').trim(), roomFull,
        phone: (fields.phone || '').trim(), area: +Number(fields.area).toFixed(2), certNo: '',
        certData, idFrontData, idBackData, signData,
        status: 'pending', reviewNote: '', reviewedAt: null, submittedAt: Date.now()
      }
      const idx = sigs.findIndex(x => x.editToken === rec.editToken)
      if (idx >= 0) {
        if (sigs[idx].status === 'approved') throw new Error('已通过的联名请联系发起人撤回后再改')
        rec.id = sigs[idx].id
        // 编辑时未重传则保留旧文件
        rec.certData = certData || sigs[idx].certData || ''
        rec.idFrontData = idFrontData || sigs[idx].idFrontData || ''
        rec.idBackData = idBackData || sigs[idx].idBackData || ''
        rec.signData = signData || sigs[idx].signData || ''
        sigs[idx] = rec
      } else sigs.push(rec)
      LS.sigs = sigs
      return { id: rec.id, editToken: rec.editToken }
    },

    withdrawMine (editToken) {
      if (LIVE) return http('/api/signatures/withdraw', { method: 'POST', body: { editToken } })
      const sigs = LS.sigs
      const i = sigs.findIndex(x => x.editToken === editToken)
      if (i < 0) throw new Error('没有可撤回的记录')
      if (sigs[i].status === 'approved') throw new Error('已通过的联名请联系发起人处理')
      sigs.splice(i, 1); LS.sigs = sigs
      return Promise.resolve({ removed: true })
    },

    /* ---------- 发起人 ---------- */
    adminLogin (passcode) {
      if (LIVE) return http('/api/admin/login', { method: 'POST', body: { passcode } })
      // 本地：首次设定口令，之后比对
      if (!LS.pass) { LS.pass = passcode || 'admin' }
      if ((passcode || '') !== LS.pass) throw new Error('口令不正确')
      return Promise.resolve({ token: 'local-admin' })
    },

    adminStatus (token) {
      if (LIVE) return http('/api/admin/status', { token })
      return Promise.resolve({ isAdmin: token === 'local-admin' })
    },

    listSignatures (token, params = {}) {
      if (LIVE) {
        const q = new URLSearchParams()
        if (params.status) q.set('status', params.status)
        q.set('page', params.page || 0); q.set('size', params.size || 20)
        return http('/api/admin/signatures?' + q.toString(), { token })
      }
      let arr = LS.sigs.slice().sort((a, b) => b.submittedAt - a.submittedAt)
      if (params.status) arr = arr.filter(x => x.status === params.status)
      const counts = {}; LS.sigs.forEach(x => { counts[x.roomFull] = (counts[x.roomFull] || 0) + 1 })
      const size = params.size || 20, page = params.page || 0
      const list = arr.slice(page * size, page * size + size).map(x => ({
        id: x.id, name: x.name, roomFull: x.roomFull, area: x.area, phone: x.phone,
        certNo: x.certNo, status: x.status, dupRoom: counts[x.roomFull] > 1
      }))
      return Promise.resolve({ list, total: arr.length, page, size })
    },

    getOne (token, id) {
      if (LIVE) return http('/api/admin/signatures/' + encodeURIComponent(id), { token })
      const x = LS.sigs.find(s => s.id === id)
      if (!x) throw new Error('记录不存在')
      const counts = {}; LS.sigs.forEach(s => { counts[s.roomFull] = (counts[s.roomFull] || 0) + 1 })
      return Promise.resolve({ rec: Object.assign({}, x, { dupRoom: counts[x.roomFull] > 1, hasCert: !!x.certData, hasIdFront: !!x.idFrontData, hasIdBack: !!x.idBackData, hasSign: !!x.signData }) })
    },

    reviewSignature (token, id, action, note) {
      if (LIVE) return http('/api/admin/signatures/' + encodeURIComponent(id) + '/review', { method: 'POST', token, body: { action, note } })
      const sigs = LS.sigs; const x = sigs.find(s => s.id === id)
      if (!x) throw new Error('记录不存在')
      x.status = action === 'approve' ? 'approved' : 'rejected'
      x.reviewNote = note || ''; x.reviewedAt = Date.now()
      LS.sigs = sigs
      return Promise.resolve({ reviewed: true })
    },

    getExportData (token) {
      if (LIVE) return http('/api/admin/export', { token })
      const cfg = LS.cfg
      const list = LS.sigs.filter(s => s.status === 'approved').map(s => ({ name: s.name, roomFull: s.roomFull, area: s.area, phone: s.phone, certNo: s.certNo, signData: s.signData }))
      const totalSignArea = list.reduce((a, s) => a + (Number(s.area) || 0), 0)
      const th = cfg.thresholdPct || 0.2
      const hp = cfg.totalHouseholds > 0 ? list.length / cfg.totalHouseholds : 0
      const ap = cfg.totalArea > 0 ? totalSignArea / cfg.totalArea : 0
      return Promise.resolve({
        config: cfg, list, count: list.length, totalSignArea: +totalSignArea.toFixed(2),
        headcountPct: +(hp * 100).toFixed(2), areaPct: +(ap * 100).toFixed(2),
        qualified: (cfg.totalHouseholds > 0 && hp >= th) || (cfg.totalArea > 0 && ap >= th)
      })
    },

    saveConfig (token, payload) {
      if (LIVE) return http('/api/admin/config', { method: 'POST', token, body: payload })
      const cfg = LS.cfg
      const next = Object.assign({}, cfg, {
        communityName: (payload.communityName || '').trim(),
        streetOffice: (payload.streetOffice || '').trim(),
        community: (payload.community || '').trim(),
        totalHouseholds: Math.max(0, parseInt(payload.totalHouseholds, 10) || 0),
        totalArea: Math.max(0, Number(payload.totalArea) || 0),
        headcountLabel: (payload.headcountLabel || '业主总人数').trim(),
        lianmingMatter: (payload.lianmingMatter || DEFAULT_CONFIG.lianmingMatter).trim(),
        currentStage: STAGES.indexOf(payload.currentStage) >= 0 ? payload.currentStage : 'collecting',
        initiatorName: (payload.initiatorName || '').trim(),
        initiatorPhone: (payload.initiatorPhone || '').trim(),
        noticeText: (payload.noticeText || '').trim(),
        noticeTitle: (payload.noticeTitle || '').trim(),
        stageDates: (payload.stageDates && typeof payload.stageDates === 'object') ? payload.stageDates : {},
        buildingOptions: Array.isArray(payload.buildingOptions) ? payload.buildingOptions : [],
        unitOptions: Array.isArray(payload.unitOptions) ? payload.unitOptions : [],
        roomOptions: Array.isArray(payload.roomOptions) ? payload.roomOptions : [],
        areaOptions: Array.isArray(payload.areaOptions) ? payload.areaOptions : [],
        showBuilding: !!payload.showBuilding, showUnit: !!payload.showUnit, showRoom: !!payload.showRoom
      })
      LS.cfg = next
      return Promise.resolve({ saved: true })
    },

    // 审核端查看证件/签名图的 URL
    fileUrl (token, id, kind) {
      if (LIVE) return BASE + '/api/admin/file/' + encodeURIComponent(id) + '/' + kind + '?t=' + encodeURIComponent(token)
      const x = LS.sigs.find(s => s.id === id)
      if (!x) return ''
      return kind === 'cert' ? (x.certData || '') : kind === 'idfront' ? (x.idFrontData || '') : kind === 'idback' ? (x.idBackData || '') : (x.signData || '')
    },

    // 示例文件（kind = cert | id）
    exampleUrl (kind) {
      if (LIVE) return BASE + '/api/example/' + kind
      return (LS.examples && LS.examples[kind]) || ''
    },
    uploadExample (token, kind, file) {
      if (LIVE) { const fd = new FormData(); fd.append('file', file); return http('/api/admin/example/' + kind, { method: 'POST', token, body: fd, isForm: true }) }
      const toData = f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f) })
      return toData(file).then(d => { const ex = LS.examples || {}; ex[kind] = d; LS.examples = ex; return { saved: true } })
    },
    deleteExample (token, kind) {
      if (LIVE) return http('/api/admin/example/' + kind, { method: 'DELETE', token })
      const ex = LS.examples || {}; delete ex[kind]; LS.examples = ex; return Promise.resolve({ removed: true })
    },

    // 常见问题（FAQ）
    getFaq () {
      if (LIVE) return http('/api/faq')
      return Promise.resolve({ list: LS.faq })
    },
    addFaq (token, item) {
      if (LIVE) return http('/api/admin/faq', { method: 'POST', token, body: item })
      const list = LS.faq
      const f = { id: uid(), group: (item.group || '其他'), q: item.q || '', a: item.a || '', pinned: !!item.pinned }
      if (f.pinned) list.forEach(x => { x.pinned = false })
      list.push(f); LS.faq = list
      return Promise.resolve({ id: f.id })
    },
    updateFaq (token, id, item) {
      if (LIVE) return http('/api/admin/faq/' + id, { method: 'POST', token, body: item })
      const list = LS.faq
      const x = list.find(i => i.id === id)
      if (!x) return Promise.reject(new Error('条目不存在'))
      if (item.pinned) list.forEach(i => { i.pinned = false })
      Object.assign(x, { group: item.group || '其他', q: item.q || '', a: item.a || '', pinned: !!item.pinned })
      LS.faq = list
      return Promise.resolve({ saved: true })
    },
    deleteFaq (token, id) {
      if (LIVE) return http('/api/admin/faq/' + id, { method: 'DELETE', token })
      LS.faq = LS.faq.filter(i => i.id !== id)
      return Promise.resolve({ removed: true })
    },

    /* ===== 物业反馈 ===== */
    propFp () { return LS.fp },
    _propCatMap () { const m = {}; LS.propCats.forEach(c => { m[c.id] = c }); return m },
    _reflect (f) { return 1 + ((f.votes && f.votes.length) || 0) },
    _computeProp () {
      const cats = LS.propCats
      const approved = LS.feedback.filter(f => f.status === 'approved')
      const rooms = {}
      approved.forEach(f => { if (f.room) rooms[f.room] = 1; (f.votes || []).forEach(v => { if (v.room) rooms[v.room] = 1 }) })
      const totalVotes = approved.reduce((n, f) => n + ((f.votes && f.votes.length) || 0), 0)
      const cmap = this._propCatMap()
      const perCat = cats.map(c => { const items = approved.filter(f => f.catId === c.id); return { id: c.id, name: c.name, count: items.length, reflect: items.reduce((n, f) => n + this._reflect(f), 0) } })
      const maxCount = perCat.reduce((m, x) => Math.max(m, x.count), 0)
      const top5 = approved.slice().sort((a, b) => this._reflect(b) - this._reflect(a) || b.createdAt - a.createdAt).slice(0, 5)
      const shape = f => ({ id: f.id, catId: f.catId, catName: (cmap[f.catId] || {}).name || '其他', tags: f.tags || [], text: f.text, room: f.room || '', hasPhoto: !!f.photo, votes: (f.votes && f.votes.length) || 0, reflect: this._reflect(f), createdAt: f.createdAt })
      return { totalReports: approved.length, totalReflect: approved.length + totalVotes, participants: Object.keys(rooms).length, top5: top5.map(shape), perCat, maxCount, cats: cats.map(c => ({ id: c.id, name: c.name, tags: c.tags || [], std: c.std || '', level: c.level || '' })) }
    },
    getProperty () { if (LIVE) return http('/api/property'); return Promise.resolve(this._computeProp()) },
    getPropertyList (cat) {
      if (LIVE) return http('/api/property/list' + (cat ? ('?cat=' + encodeURIComponent(cat)) : ''))
      const cmap = this._propCatMap()
      let items = LS.feedback.filter(f => f.status === 'approved')
      if (cat) items = items.filter(f => f.catId === cat)
      items.sort((a, b) => this._reflect(b) - this._reflect(a) || b.createdAt - a.createdAt)
      return Promise.resolve({ list: items.map(f => ({ id: f.id, catId: f.catId, catName: (cmap[f.catId] || {}).name || '其他', tags: f.tags || [], text: f.text, room: f.room || '', hasPhoto: !!f.photo, votes: (f.votes && f.votes.length) || 0, reflect: this._reflect(f), createdAt: f.createdAt })) })
    },
    submitFeedback (fields, photo) {
      if (LIVE) {
        const fd = new FormData()
        fd.append('catId', fields.catId); fd.append('text', fields.text)
        fd.append('tags', JSON.stringify(fields.tags || []))
        fd.append('anon', fields.anon ? '1' : '0'); fd.append('room', fields.room || '')
        fd.append('fp', LS.fp)
        if (photo) fd.append('photo', photo)
        return http('/api/property', { method: 'POST', body: fd, isForm: true })
      }
      const toData = f => f ? new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(f) }) : Promise.resolve('')
      return toData(photo).then(pd => {
        const cmap = this._propCatMap(); const allow = (cmap[fields.catId] || {}).tags || []
        const list = LS.feedback
        list.push({ id: uid(), catId: fields.catId, text: (fields.text || '').trim(), tags: (fields.tags || []).filter(t => allow.indexOf(t) >= 0).slice(0, 3), room: fields.anon ? '' : (fields.room || '').trim(), anon: !!fields.anon, photo: pd, fp: LS.fp, votes: [], status: 'pending', reviewNote: '', createdAt: Date.now() })
        LS.feedback = list
        return { id: list[list.length - 1].id }
      })
    },
    voteFeedback (id, anon, room) {
      if (LIVE) return http('/api/property/' + id + '/vote', { method: 'POST', body: { fp: LS.fp, anon: anon ? '1' : '0', room: room || '' } })
      const list = LS.feedback; const f = list.find(x => x.id === id)
      if (!f || f.status !== 'approved') return Promise.reject(new Error('反馈不存在'))
      if (f.fp === LS.fp) return Promise.reject(new Error('这是你提交的反馈'))
      if ((f.votes || []).some(v => v.fp === LS.fp)) return Promise.reject(new Error('你已经 +1 过了'))
      f.votes = f.votes || []; f.votes.push({ fp: LS.fp, room: anon ? '' : (room || ''), at: Date.now() })
      LS.feedback = list
      return Promise.resolve({ votes: f.votes.length, reflect: this._reflect(f) })
    },
    propPhotoUrl (id) {
      if (LIVE) return BASE + '/api/property/photo/' + encodeURIComponent(id)
      const f = LS.feedback.find(x => x.id === id); return (f && f.photo) || ''
    },
    adminPropPhotoUrl (token, id) {
      if (LIVE) return BASE + '/api/admin/property/photo/' + encodeURIComponent(id) + '?t=' + encodeURIComponent(token)
      const f = LS.feedback.find(x => x.id === id); return (f && f.photo) || ''
    },
    getAdminProperty (token) {
      if (LIVE) return http('/api/admin/property', { token })
      const cmap = this._propCatMap()
      const list = LS.feedback.slice().sort((a, b) => b.createdAt - a.createdAt).map(f => ({ id: f.id, catId: f.catId, catName: (cmap[f.catId] || {}).name || '其他', tags: f.tags || [], text: f.text, room: f.room || '', anon: !!f.anon, hasPhoto: !!f.photo, votes: (f.votes && f.votes.length) || 0, status: f.status, reviewNote: f.reviewNote || '', createdAt: f.createdAt }))
      return Promise.resolve({ list, pending: list.filter(x => x.status === 'pending').length })
    },
    reviewFeedback (token, id, action, note) {
      if (LIVE) return http('/api/admin/property/' + id + '/review', { method: 'POST', token, body: { action, note: note || '' } })
      const f = LS.feedback.find(x => x.id === id); if (!f) return Promise.reject(new Error('反馈不存在'))
      f.status = action === 'approve' ? 'approved' : 'rejected'; f.reviewNote = note || ''
      const list = LS.feedback.map(x => x.id === id ? f : x); LS.feedback = list
      return Promise.resolve({ reviewed: true, status: f.status })
    },
    deleteFeedback (token, id) {
      if (LIVE) return http('/api/admin/property/' + id, { method: 'DELETE', token })
      LS.feedback = LS.feedback.filter(x => x.id !== id); return Promise.resolve({ removed: true })
    },
    getPropCats (token) {
      if (LIVE) return http('/api/admin/property/cats', { token })
      return Promise.resolve({ cats: LS.propCats })
    },
    savePropCats (token, cats) {
      if (LIVE) return http('/api/admin/property/cats', { method: 'POST', token, body: { cats } })
      const cur = LS.propCats; const byId = {}; cats.forEach(c => { byId[c.id] = c })
      LS.propCats = cur.map(c => byId[c.id] ? { id: c.id, name: c.name, tags: (Array.isArray(byId[c.id].tags) ? byId[c.id].tags : String(byId[c.id].tags || '').split(/[,，、;；\n]+/)).map(x => x.trim()).filter(Boolean), std: (byId[c.id].std || '').trim(), level: (byId[c.id].level || '').trim() } : c)
      return Promise.resolve({ saved: true })
    }
  }
})()
