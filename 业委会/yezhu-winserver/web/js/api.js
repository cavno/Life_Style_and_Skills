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
    initiatorName: '', initiatorPhone: '', noticeText: ''
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
    set pass (v) { localStorage.setItem('yz_pass', v) }
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
        thresholdPct: th, noticeText: cfg.noticeText || '',
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
  function normRoom (b, u, r) { return [b, u, r].filter(Boolean).join('').replace(/\s/g, '') }

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
      return Promise.resolve({ config: Object.assign({}, c, { configured: c.totalHouseholds > 0 && c.totalArea > 0 }) })
    },

    // 业主端：用 editToken 找回自己的记录
    getMine (editToken) {
      if (!editToken) return Promise.resolve({ mine: null })
      if (LIVE) return http('/api/mine', { method: 'POST', body: { editToken } })
      const s = LS.sigs.find(x => x.editToken === editToken) || null
      return Promise.resolve({ mine: s })
    },

    // 提交联名。fields + 三个文件（File 或 dataURL）。LIVE 用 multipart。
    async submitSignature (fields, files, editToken) {
      // 基础校验
      if (!fields.name || !fields.name.trim()) throw new Error('请填写业主姓名')
      if (!fields.room || !fields.room.trim()) throw new Error('请填写房号')
      if (!/^1\d{10}$/.test((fields.phone || '').trim())) throw new Error('请填写正确的 11 位手机号')
      if (!(Number(fields.area) > 0)) throw new Error('请填写房屋建筑面积')
      if (!files.sign) throw new Error('请完成手写签名')

      if (LIVE) {
        const fd = new FormData()
        Object.keys(fields).forEach(k => fd.append(k, fields[k]))
        if (editToken) fd.append('editToken', editToken)
        if (files.cert) fd.append('cert', files.cert)
        if (files.id) fd.append('id', files.id)
        fd.append('sign', files.sign) // File
        return http('/api/signatures', { method: 'POST', body: fd, isForm: true })
      }
      // 本地：文件转 dataURL 存入记录
      const toData = f => typeof f === 'string' ? Promise.resolve(f) : new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f) })
      const certData = files.cert ? await toData(files.cert) : ''
      const idData = files.id ? await toData(files.id) : ''
      const signData = await toData(files.sign)
      const sigs = LS.sigs
      const roomFull = normRoom(fields.building, fields.unit, fields.room)
      const rec = {
        id: uid(), editToken: editToken || uid(),
        name: fields.name.trim(), building: fields.building || '', unit: fields.unit || '', room: fields.room.trim(), roomFull,
        phone: fields.phone.trim(), area: +Number(fields.area).toFixed(2), certNo: (fields.certNo || '').trim(),
        certData, idData, signData,
        status: 'pending', reviewNote: '', reviewedAt: null, submittedAt: Date.now()
      }
      const idx = sigs.findIndex(x => x.editToken === rec.editToken)
      if (idx >= 0) {
        if (sigs[idx].status === 'approved') throw new Error('已通过的联名请联系发起人撤回后再改')
        rec.id = sigs[idx].id
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
      return Promise.resolve({ rec: Object.assign({}, x, { dupRoom: counts[x.roomFull] > 1, hasCert: !!x.certData, hasId: !!x.idData }) })
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
        noticeText: (payload.noticeText || '').trim()
      })
      LS.cfg = next
      return Promise.resolve({ saved: true })
    },

    // 审核端查看证件/签名图的 URL
    fileUrl (token, id, kind) {
      if (LIVE) return BASE + '/api/admin/file/' + encodeURIComponent(id) + '/' + kind + '?t=' + encodeURIComponent(token)
      const x = LS.sigs.find(s => s.id === id)
      if (!x) return ''
      return kind === 'cert' ? (x.certData || '') : kind === 'id' ? (x.idData || '') : (x.signData || '')
    }
  }
})()
