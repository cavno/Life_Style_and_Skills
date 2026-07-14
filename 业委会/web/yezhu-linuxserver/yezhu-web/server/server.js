// 业主之家 · 成立业委会 —— Web 后端（单文件，自托管）
// 依赖均为纯 JS：express / multer / jsonwebtoken / bcryptjs / cors（无需编译，npm install 即可）
// 数据存于 ./data/db.json（原子写入），上传文件存于 ./uploads（仅发起人凭 token 可读）。

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
let FAQ_SEED = []
try { FAQ_SEED = require(path.join(__dirname, '..', 'web', 'js', 'faq-seed.js')) } catch (e) { /* 目录结构非默认时忽略，faq 从空开始 */ }
let PROP_SEED = []
try { PROP_SEED = require(path.join(__dirname, '..', 'web', 'js', 'prop-seed.js')) } catch (e) {}

// 读取同目录下的 .env（零依赖）：每行 KEY=VALUE，# 开头为注释。
// 已存在的系统环境变量优先，不被覆盖。
;(function loadDotEnv () {
  try {
    const p = path.join(__dirname, '.env')
    if (!fs.existsSync(p)) return
    const text = fs.readFileSync(p, 'utf8')
    text.split(/\r?\n/).forEach(line => {
      const s = line.trim()
      if (!s || s[0] === '#') return
      const i = s.indexOf('=')
      if (i < 0) return
      const k = s.slice(0, i).trim()
      let v = s.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (k && process.env[k] === undefined) process.env[k] = v
    })
    console.log('已加载 .env 配置')
  } catch (e) { console.error('读取 .env 失败：', e.message) }
})()

const PORT = process.env.PORT || 3000
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads')
const DB_FILE = path.join(DATA_DIR, 'db.json')
const SERVE_WEB = process.env.SERVE_WEB === '1'
const WEB_DIR = process.env.WEB_DIR || path.join(__dirname, '..', 'web')

const STAGES = ['collecting', 'submitted', 'group', 'enroll', 'meeting', 'done']
const DEFAULT_CONFIG = {
  communityName: '', streetOffice: '', community: '',
  totalHouseholds: 0, totalArea: 0, thresholdPct: 0.2,
  headcountLabel: '业主总人数',
  lianmingMatter: '要求成立首次业主大会会议筹备组',
  currentStage: 'collecting',
  initiatorName: '', initiatorPhone: '', noticeText: '', noticeTitle: '',
  stageDates: {},
  // 楼栋房号三级选项（业主在联名页下拉选择）与显示开关；面积可选值
  buildingOptions: [],
  unitOptions: ['A', 'B', 'C'],
  roomOptions: [],
  areaOptions: ['26.47', '26.48', '50.9', '57.51', '57.67', '58.22', '59.78', '59.95'],
  showBuilding: false, showUnit: true, showRoom: true
}

/* ---------------- 数据存储（原子 JSON） ---------------- */
for (const d of [DATA_DIR, UPLOAD_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })

let DB = { config: Object.assign({}, DEFAULT_CONFIG), signatures: [], secret: '', adminHash: '' }
function loadDB () {
  if (fs.existsSync(DB_FILE)) {
    try { DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) } catch (e) { console.error('读取 db.json 失败，使用空库：', e.message) }
  }
  DB.config = Object.assign({}, DEFAULT_CONFIG, DB.config || {})
  DB.signatures = DB.signatures || []
  DB.examples = DB.examples || {}
  if (!Array.isArray(DB.faq)) DB.faq = FAQ_SEED.map(x => Object.assign({}, x))
  if (!Array.isArray(DB.propCats)) DB.propCats = PROP_SEED.map(x => Object.assign({}, x))
  DB.feedback = DB.feedback || []
  // JWT 密钥：生成一次并持久化，重启后 token 仍有效
  if (!DB.secret) DB.secret = crypto.randomBytes(32).toString('hex')
  // 管理员口令：首次用 .env 的 ADMIN_PASSCODE 生成 hash
  if (!DB.adminHash && process.env.ADMIN_PASSCODE) {
    DB.adminHash = bcrypt.hashSync(process.env.ADMIN_PASSCODE, 10)
    console.log('已根据 .env 的 ADMIN_PASSCODE 设置发起人口令。')
  }
  saveDB()
}
let saving = false, dirty = false
function saveDB () {
  if (saving) { dirty = true; return }
  saving = true
  try {
    const tmp = DB_FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(DB, null, 2))
    fs.renameSync(tmp, DB_FILE)
  } catch (e) { console.error('写入 db.json 失败：', e.message) }
  saving = false
  if (dirty) { dirty = false; saveDB() }
}

/* ---------------- 工具 ---------------- */
const ok = (res, data) => res.json({ ok: true, data: data == null ? {} : data })
const bad = (res, msg, code = 400) => res.status(code).json({ ok: false, msg })
function uid () { return crypto.randomBytes(9).toString('hex') }
// 清洗后台维护的下拉选项：数组化、去空白、去重、限长
function cleanOpts (v, max = 1000) {
  if (!Array.isArray(v)) return []
  const out = []; const seen = {}
  for (let x of v) {
    x = String(x == null ? '' : x).trim()
    if (!x || x.length > 20 || seen[x]) continue
    seen[x] = 1; out.push(x)
    if (out.length >= max) break
  }
  return out
}
function normRoom (b, u, r) {
  b = (b || '').replace(/\s/g, ''); u = (u || '').replace(/\s/g, ''); r = (r || '').replace(/\s/g, '')
  return (b ? b + '栋' : '') + (u ? u + '座' : '') + (r ? r + '房' : '')
}
function publicConfig () {
  const c = DB.config
  return {
    communityName: c.communityName || '（未设置小区名称）',
    streetOffice: c.streetOffice || '（未设置街道办）',
    community: c.community || '',
    totalHouseholds: c.totalHouseholds, totalArea: c.totalArea,
    thresholdPct: c.thresholdPct || 0.2,
    headcountLabel: c.headcountLabel || '业主总人数',
    lianmingMatter: c.lianmingMatter || DEFAULT_CONFIG.lianmingMatter,
    currentStage: c.currentStage || 'collecting',
    initiatorName: c.initiatorName || '', initiatorPhone: c.initiatorPhone || '',
    noticeText: c.noticeText || '',
    noticeTitle: c.noticeTitle || '',
    stageDates: c.stageDates || {},
    buildingOptions: c.buildingOptions || [],
    unitOptions: c.unitOptions || [],
    roomOptions: c.roomOptions || [],
    areaOptions: c.areaOptions || [],
    showBuilding: !!c.showBuilding, showUnit: !!c.showUnit, showRoom: !!c.showRoom,
    hasExampleCert: !!(DB.examples && DB.examples.cert),
    hasExampleIdFront: !!(DB.examples && DB.examples.idfront),
    hasExampleIdBack: !!(DB.examples && DB.examples.idback),
    configured: c.totalHouseholds > 0 && c.totalArea > 0
  }
}
function computeStats () {
  const c = DB.config
  const th = c.thresholdPct || 0.2
  const approved = DB.signatures.filter(s => s.status === 'approved')
  const approvedCount = approved.length
  const approvedArea = approved.reduce((a, s) => a + (Number(s.area) || 0), 0)
  const headcountPct = c.totalHouseholds > 0 ? approvedCount / c.totalHouseholds : 0
  const areaPct = c.totalArea > 0 ? approvedArea / c.totalArea : 0
  const headcountReached = c.totalHouseholds > 0 && headcountPct >= th
  const areaReached = c.totalArea > 0 && areaPct >= th
  return {
    community: publicConfig(),
    approvedCount, approvedArea: +approvedArea.toFixed(2),
    pendingCount: DB.signatures.filter(s => s.status === 'pending').length,
    rejectedCount: DB.signatures.filter(s => s.status === 'rejected').length,
    headcountPct: +(headcountPct * 100).toFixed(2),
    areaPct: +(areaPct * 100).toFixed(2),
    headcountReached, areaReached,
    qualified: headcountReached || areaReached,
    needHeadcount: Math.max(0, Math.ceil(c.totalHouseholds * th) - approvedCount),
    needArea: Math.max(0, +(c.totalArea * th - approvedArea).toFixed(2))
  }
}
function roomCounts () {
  const m = {}
  DB.signatures.forEach(s => { m[s.roomFull] = (m[s.roomFull] || 0) + 1 })
  return m
}

/* ---------------- 鉴权 ---------------- */
function tokenFrom (req) {
  const h = req.headers['authorization'] || ''
  if (h.startsWith('Bearer ')) return h.slice(7)
  if (req.query && req.query.t) return String(req.query.t)
  return ''
}
function adminOnly (req, res, next) {
  const t = tokenFrom(req)
  if (!t) return bad(res, '需要发起人登录', 401)
  try { jwt.verify(t, DB.secret); next() }
  catch (e) { return bad(res, '登录已过期，请重新登录', 401) }
}

/* ---------------- 上传 ---------------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '.png').slice(0, 8)
    cb(null, uid() + ext)
  }
})
const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype) || file.mimetype === 'application/pdf')
})
const sigUpload = upload.fields([
  { name: 'cert', maxCount: 1 },
  { name: 'idFront', maxCount: 1 },
  { name: 'idBack', maxCount: 1 },
  { name: 'sign', maxCount: 1 }
])
const exampleUpload = upload.single('file')
const propUpload = upload.single('photo')

/* ---------------- App ---------------- */
const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/healthz', (req, res) => res.type('text/plain').send('业主之家 · 成立业委会 后端运行中'))

// 业主端 ----------------------------------------------------
app.get('/api/stats', (req, res) => ok(res, computeStats()))
app.get('/api/config', (req, res) => ok(res, { config: publicConfig() }))

app.post('/api/mine', (req, res) => {
  const t = (req.body && req.body.editToken) || ''
  if (!t) return ok(res, { mine: null })
  const s = DB.signatures.find(x => x.editToken === t)
  if (!s) return ok(res, { mine: null })
  ok(res, { mine: { name: s.name, building: s.building, unit: s.unit, room: s.room, roomFull: s.roomFull, area: s.area, phone: s.phone, certNo: s.certNo, status: s.status, reviewNote: s.reviewNote, hasCert: !!s.certFile, hasIdFront: !!s.idFrontFile, hasIdBack: !!s.idBackFile, hasSign: !!s.signFile } })
})

app.post('/api/signatures', sigUpload, async (req, res) => {
  const b = req.body || {}
  const files = req.files || {}
  const cfg = DB.config
  const name = (b.name || '').trim()
  let building = (b.building || '').trim().slice(0, 20)
  let unit = (b.unit || '').trim().slice(0, 20)
  let room = (b.room || '').trim().slice(0, 20)
  const phone = (b.phone || '').trim()
  const areaStr = (b.area != null ? String(b.area) : '').trim()
  const area = Number(areaStr)
  // 隐藏项一律置空（防前端伪造）
  if (!cfg.showBuilding) building = ''
  if (!cfg.showUnit) unit = ''
  if (!cfg.showRoom) room = ''
  // 后端兜底校验（前端已逐项校验并就地提示）
  if (!/^[\u4e00-\u9fa5]{2,4}$/.test(name)) return bad(res, '业主姓名应为 2-4 个中文字')
  const inOpts = (v, opts) => !opts || !opts.length || opts.indexOf(v) >= 0
  if (cfg.showBuilding && (!building || !inOpts(building, cfg.buildingOptions))) return bad(res, '请选择“栋”')
  if (cfg.showUnit && (!unit || !inOpts(unit, cfg.unitOptions))) return bad(res, '请选择“座”')
  if (cfg.showRoom && (!room || !inOpts(room, cfg.roomOptions))) return bad(res, '请选择“房”')
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(areaStr) || !(area > 0) || !inOpts(areaStr, cfg.areaOptions)) return bad(res, '请选择房屋建筑面积')
  if (!/^1\d{10}$/.test(phone)) return bad(res, '请填写正确的 11 位手机号')

  const editToken = (b.editToken || '').trim()
  let rec = editToken ? DB.signatures.find(x => x.editToken === editToken) : null
  if (rec && rec.status === 'approved') return bad(res, '已通过的联名请联系发起人撤回后再改')

  const newCert = files.cert && files.cert[0] ? files.cert[0].filename : null
  const newIdFront = files.idFront && files.idFront[0] ? files.idFront[0].filename : null
  const newIdBack = files.idBack && files.idBack[0] ? files.idBack[0].filename : null
  const newSign = files.sign && files.sign[0] ? files.sign[0].filename : null

  // 缺的用旧的补（编辑时未重传则保留）
  const certFile = newCert || (rec && rec.certFile) || null
  const idFrontFile = newIdFront || (rec && rec.idFrontFile) || null
  const idBackFile = newIdBack || (rec && rec.idBackFile) || null
  const signFile = newSign || (rec && rec.signFile) || null
  if (!certFile) return bad(res, '请上传产权证明文件')
  if (!idFrontFile) return bad(res, '请上传身份证人像面')
  if (!idBackFile) return bad(res, '请上传身份证国徽面')
  if (!signFile) return bad(res, '请完成手写签名')

  const roomFull = normRoom(building, unit, room)
  const now = Date.now()

  if (rec) {
    rec.name = name; rec.building = building; rec.unit = unit; rec.room = room; rec.roomFull = roomFull
    rec.phone = phone; rec.area = +area.toFixed(2)
    rec.certFile = certFile; rec.idFrontFile = idFrontFile; rec.idBackFile = idBackFile; rec.signFile = signFile
    delete rec.idFile; delete rec.certNo
    rec.status = 'pending'; rec.reviewNote = ''; rec.reviewedAt = null; rec.submittedAt = now
    saveDB()
    return ok(res, { id: rec.id, editToken: rec.editToken })
  }

  rec = {
    id: uid(), editToken: editToken || uid(),
    name, building, unit, room, roomFull,
    phone, area: +area.toFixed(2),
    certFile, idFrontFile, idBackFile, signFile,
    status: 'pending', reviewNote: '', reviewedAt: null, submittedAt: now
  }
  DB.signatures.push(rec)
  saveDB()
  ok(res, { id: rec.id, editToken: rec.editToken })
})

/* 小程序专用：四张证件以 base64 一次性提交（wx.uploadFile 单请求只能带一个文件，故走 JSON）。
   不影响网页版 /api/signatures 的多文件 multipart 流程。 */
function saveB64 (dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  let ext = 'png'
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,/i.exec(dataUrl)
  let raw = dataUrl
  if (m) { ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase(); raw = dataUrl.slice(m[0].length) }
  else { const c = dataUrl.indexOf(','); if (c >= 0 && /^data:/.test(dataUrl)) raw = dataUrl.slice(c + 1) }
  let buf
  try { buf = Buffer.from(raw, 'base64') } catch (e) { return null }
  if (!buf || !buf.length || buf.length > 12 * 1024 * 1024) return null
  const fname = 'mp_' + uid() + '.' + ext
  fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf)
  return fname
}
app.post('/api/mp/signature', express.json({ limit: '20mb' }), (req, res) => {
  const b = req.body || {}
  const cfg = DB.config
  const name = (b.name || '').trim()
  let building = (b.building || '').trim().slice(0, 20)
  let unit = (b.unit || '').trim().slice(0, 20)
  let room = (b.room || '').trim().slice(0, 20)
  const phone = (b.phone || '').trim()
  const areaStr = (b.area != null ? String(b.area) : '').trim()
  const area = Number(areaStr)
  if (!cfg.showBuilding) building = ''
  if (!cfg.showUnit) unit = ''
  if (!cfg.showRoom) room = ''
  if (!/^[\u4e00-\u9fa5]{2,4}$/.test(name)) return bad(res, '业主姓名应为 2-4 个中文字')
  const inOpts = (v, opts) => !opts || !opts.length || opts.indexOf(v) >= 0
  if (cfg.showBuilding && (!building || !inOpts(building, cfg.buildingOptions))) return bad(res, '请选择“栋”')
  if (cfg.showUnit && (!unit || !inOpts(unit, cfg.unitOptions))) return bad(res, '请选择“座”')
  if (cfg.showRoom && (!room || !inOpts(room, cfg.roomOptions))) return bad(res, '请选择“房”')
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(areaStr) || !(area > 0) || !inOpts(areaStr, cfg.areaOptions)) return bad(res, '请选择房屋建筑面积')
  if (!/^1\d{10}$/.test(phone)) return bad(res, '请填写正确的 11 位手机号')

  const editToken = (b.editToken || '').trim()
  let rec = editToken ? DB.signatures.find(x => x.editToken === editToken) : null
  if (rec && rec.status === 'approved') return bad(res, '已通过的联名请联系发起人撤回后再改')

  const newCert = saveB64(b.certB64)
  const newIdFront = saveB64(b.idFrontB64)
  const newIdBack = saveB64(b.idBackB64)
  const newSign = saveB64(b.signB64)
  const certFile = newCert || (rec && rec.certFile) || null
  const idFrontFile = newIdFront || (rec && rec.idFrontFile) || null
  const idBackFile = newIdBack || (rec && rec.idBackFile) || null
  const signFile = newSign || (rec && rec.signFile) || null
  if (!certFile) return bad(res, '请上传产权证明')
  if (!idFrontFile) return bad(res, '请上传身份证人像面')
  if (!idBackFile) return bad(res, '请上传身份证国徽面')
  if (!signFile) return bad(res, '请完成手写签名')

  const roomFull = normRoom(building, unit, room)
  const now = Date.now()
  if (rec) {
    // 若替换了文件，删除旧文件
    const delOld = (nw, old) => { if (nw && old && old !== nw) { const fp = path.join(UPLOAD_DIR, old); fs.existsSync(fp) && fs.unlink(fp, () => {}) } }
    delOld(newCert, rec.certFile); delOld(newIdFront, rec.idFrontFile); delOld(newIdBack, rec.idBackFile); delOld(newSign, rec.signFile)
    rec.name = name; rec.building = building; rec.unit = unit; rec.room = room; rec.roomFull = roomFull
    rec.phone = phone; rec.area = +area.toFixed(2)
    rec.certFile = certFile; rec.idFrontFile = idFrontFile; rec.idBackFile = idBackFile; rec.signFile = signFile
    delete rec.idFile; delete rec.certNo
    rec.status = 'pending'; rec.reviewNote = ''; rec.reviewedAt = null; rec.submittedAt = now
    saveDB()
    return ok(res, { id: rec.id, editToken: rec.editToken })
  }
  rec = {
    id: uid(), editToken: editToken || uid(),
    name, building, unit, room, roomFull, phone, area: +area.toFixed(2),
    certFile, idFrontFile, idBackFile, signFile,
    status: 'pending', reviewNote: '', reviewedAt: null, submittedAt: now
  }
  DB.signatures.push(rec)
  saveDB()
  ok(res, { id: rec.id, editToken: rec.editToken })
})

app.post('/api/signatures/withdraw', (req, res) => {
  const t = (req.body && req.body.editToken) || ''
  const i = DB.signatures.findIndex(x => x.editToken === t)
  if (i < 0) return bad(res, '没有可撤回的记录')
  if (DB.signatures[i].status === 'approved') return bad(res, '已通过的联名请联系发起人处理')
  // 删除其上传文件
  removeFiles(DB.signatures[i])
  DB.signatures.splice(i, 1)
  saveDB()
  ok(res, { removed: true })
})

// 发起人 ----------------------------------------------------
app.post('/api/admin/login', (req, res) => {
  const passcode = (req.body && req.body.passcode) || ''
  if (!DB.adminHash) {
    // 尚未设置口令：把首个登录口令设为口令（便于无 .env 时初始化）
    if (!passcode) return bad(res, '请设置发起人口令')
    DB.adminHash = bcrypt.hashSync(passcode, 10); saveDB()
  } else if (!bcrypt.compareSync(passcode, DB.adminHash)) {
    return bad(res, '口令不正确', 401)
  }
  const token = jwt.sign({ role: 'admin' }, DB.secret, { expiresIn: '30d' })
  ok(res, { token })
})

app.get('/api/admin/status', adminOnly, (req, res) => ok(res, { isAdmin: true }))

app.get('/api/admin/signatures', adminOnly, (req, res) => {
  const status = (req.query.status || '').trim()
  const page = Math.max(0, parseInt(req.query.page, 10) || 0)
  const size = Math.min(100, Math.max(1, parseInt(req.query.size, 10) || 20))
  let arr = DB.signatures.slice().sort((a, b) => b.submittedAt - a.submittedAt)
  if (status) arr = arr.filter(x => x.status === status)
  const counts = roomCounts()
  const list = arr.slice(page * size, page * size + size).map(x => ({
    id: x.id, name: x.name, roomFull: x.roomFull, area: x.area, phone: x.phone,
    certNo: x.certNo, status: x.status, dupRoom: counts[x.roomFull] > 1
  }))
  ok(res, { list, total: arr.length, page, size })
})

app.get('/api/admin/signatures/:id', adminOnly, (req, res) => {
  const x = DB.signatures.find(s => s.id === req.params.id)
  if (!x) return bad(res, '记录不存在', 404)
  const counts = roomCounts()
  ok(res, { rec: {
    id: x.id, name: x.name, building: x.building, unit: x.unit, room: x.room, roomFull: x.roomFull,
    area: x.area, phone: x.phone, certNo: x.certNo, status: x.status, reviewNote: x.reviewNote,
    dupRoom: counts[x.roomFull] > 1, hasCert: !!x.certFile, hasIdFront: !!x.idFrontFile, hasIdBack: !!x.idBackFile, hasSign: !!x.signFile
  } })
})

app.post('/api/admin/signatures/:id/review', adminOnly, (req, res) => {
  const x = DB.signatures.find(s => s.id === req.params.id)
  if (!x) return bad(res, '记录不存在', 404)
  const action = (req.body && req.body.action) || ''
  if (action !== 'approve' && action !== 'reject') return bad(res, '无效操作')
  x.status = action === 'approve' ? 'approved' : 'rejected'
  x.reviewNote = (req.body && req.body.note) || ''
  x.reviewedAt = Date.now()
  saveDB()
  ok(res, { reviewed: true })
})

app.get('/api/admin/export', adminOnly, (req, res) => {
  const c = DB.config
  const th = c.thresholdPct || 0.2
  const approved = DB.signatures.filter(s => s.status === 'approved').sort((a, b) => (a.reviewedAt || 0) - (b.reviewedAt || 0))
  const list = approved.map(s => ({ id: s.id, name: s.name, roomFull: s.roomFull, area: s.area, phone: s.phone, certNo: s.certNo }))
  const totalSignArea = list.reduce((a, s) => a + (Number(s.area) || 0), 0)
  const headcountPct = c.totalHouseholds > 0 ? list.length / c.totalHouseholds : 0
  const areaPct = c.totalArea > 0 ? totalSignArea / c.totalArea : 0
  ok(res, {
    config: publicConfig(), list, count: list.length,
    totalSignArea: +totalSignArea.toFixed(2),
    headcountPct: +(headcountPct * 100).toFixed(2),
    areaPct: +(areaPct * 100).toFixed(2),
    qualified: (c.totalHouseholds > 0 && headcountPct >= th) || (c.totalArea > 0 && areaPct >= th)
  })
})

app.post('/api/admin/config', adminOnly, (req, res) => {
  const p = req.body || {}
  DB.config = Object.assign({}, DB.config, {
    communityName: (p.communityName || '').trim(),
    streetOffice: (p.streetOffice || '').trim(),
    community: (p.community || '').trim(),
    totalHouseholds: Math.max(0, parseInt(p.totalHouseholds, 10) || 0),
    totalArea: Math.max(0, Number(p.totalArea) || 0),
    thresholdPct: p.thresholdPct ? Number(p.thresholdPct) : 0.2,
    headcountLabel: (p.headcountLabel || '业主总人数').trim(),
    lianmingMatter: (p.lianmingMatter || DEFAULT_CONFIG.lianmingMatter).trim(),
    currentStage: STAGES.indexOf(p.currentStage) >= 0 ? p.currentStage : 'collecting',
    initiatorName: (p.initiatorName || '').trim(),
    initiatorPhone: (p.initiatorPhone || '').trim(),
    noticeText: (p.noticeText || '').trim(),
    noticeTitle: (p.noticeTitle || '').trim().slice(0, 60),
    stageDates: (function (sd) {
      const out = {}; const allow = STAGES
      if (sd && typeof sd === 'object') allow.forEach(k => { const v = (sd[k] == null ? '' : String(sd[k])).trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) out[k] = v })
      return out
    })(p.stageDates),
    buildingOptions: cleanOpts(p.buildingOptions, 200),
    unitOptions: cleanOpts(p.unitOptions, 200),
    roomOptions: cleanOpts(p.roomOptions, 2000),
    areaOptions: cleanOpts(p.areaOptions, 2000).filter(x => /^\d{1,4}(\.\d{1,2})?$/.test(x) && Number(x) > 0),
    showBuilding: !!p.showBuilding, showUnit: !!p.showUnit, showRoom: !!p.showRoom
  })
  // 至少保留“房”可见，避免所有房号信息被同时隐藏导致无法区分住户
  if (!DB.config.showBuilding && !DB.config.showUnit && !DB.config.showRoom) DB.config.showRoom = true
  saveDB()
  ok(res, { saved: true })
})

// 证件 / 签名图（仅发起人，token 可走 ?t= ）
app.get('/api/admin/file/:id/:kind', adminOnly, (req, res) => {
  const x = DB.signatures.find(s => s.id === req.params.id)
  if (!x) return bad(res, '记录不存在', 404)
  const map = { cert: x.certFile, idfront: x.idFrontFile, idback: x.idBackFile, sign: x.signFile }
  const fname = map[req.params.kind]
  if (!fname) return bad(res, '无此文件', 404)
  const fp = path.join(UPLOAD_DIR, fname)
  if (!fs.existsSync(fp)) return bad(res, '文件已丢失', 404)
  res.sendFile(fp)
})

// 示例文件（产权证明 / 身份证）：公开查看，发起人可上传/删除
function exKind (k) { return ['cert', 'idfront', 'idback'].indexOf(k) >= 0 ? k : null }
app.get('/api/example/:kind', (req, res) => {
  const kind = exKind(req.params.kind)
  if (!kind) return bad(res, '无此示例', 404)
  const fname = DB.examples && DB.examples[kind]
  if (!fname) return bad(res, '示例未上传', 404)
  const fp = path.join(UPLOAD_DIR, fname)
  if (!fs.existsSync(fp)) return bad(res, '示例文件已丢失', 404)
  res.sendFile(fp)
})
app.post('/api/admin/example/:kind', adminOnly, exampleUpload, (req, res) => {
  const kind = exKind(req.params.kind)
  if (!kind) return bad(res, '无此示例')
  if (!req.file) return bad(res, '请选择文件')
  DB.examples = DB.examples || {}
  if (!Array.isArray(DB.faq)) DB.faq = FAQ_SEED.map(x => Object.assign({}, x))
  const old = DB.examples[kind]
  if (old) { const op = path.join(UPLOAD_DIR, old); fs.existsSync(op) && fs.unlink(op, () => {}) }
  DB.examples[kind] = req.file.filename
  saveDB()
  ok(res, { saved: true })
})
app.delete('/api/admin/example/:kind', adminOnly, (req, res) => {
  const kind = exKind(req.params.kind)
  if (!kind) return bad(res, '无此示例')
  DB.examples = DB.examples || {}
  if (!Array.isArray(DB.faq)) DB.faq = FAQ_SEED.map(x => Object.assign({}, x))
  const old = DB.examples[kind]
  if (old) { const op = path.join(UPLOAD_DIR, old); fs.existsSync(op) && fs.unlink(op, () => {}) }
  delete DB.examples[kind]
  saveDB()
  ok(res, { removed: true })
})

/* ---------------- 常见问题（FAQ）：公开读取，发起人增删改 ---------------- */
app.get('/api/faq', (req, res) => ok(res, { list: DB.faq || [] }))
function cleanFaq (b) {
  return {
    group: String(b.group == null ? '' : b.group).trim().slice(0, 20) || '其他',
    q: String(b.q == null ? '' : b.q).trim().slice(0, 200),
    a: String(b.a == null ? '' : b.a).trim().slice(0, 4000),
    pinned: !!b.pinned
  }
}
app.post('/api/admin/faq', adminOnly, (req, res) => {
  const f = cleanFaq(req.body || {})
  if (!f.q || !f.a) return bad(res, '问题与回答均不能为空')
  f.id = uid()
  DB.faq = DB.faq || []
  if (f.pinned) DB.faq.forEach(x => { x.pinned = false })
  DB.faq.push(f)
  saveDB()
  ok(res, { id: f.id })
})
app.post('/api/admin/faq/:id', adminOnly, (req, res) => {
  const x = (DB.faq || []).find(i => i.id === req.params.id)
  if (!x) return bad(res, '条目不存在', 404)
  const f = cleanFaq(req.body || {})
  if (!f.q || !f.a) return bad(res, '问题与回答均不能为空')
  if (f.pinned) DB.faq.forEach(i => { i.pinned = false })
  Object.assign(x, f, { id: x.id })
  saveDB()
  ok(res, { saved: true })
})
app.delete('/api/admin/faq/:id', adminOnly, (req, res) => {
  const idx = (DB.faq || []).findIndex(i => i.id === req.params.id)
  if (idx < 0) return bad(res, '条目不存在', 404)
  DB.faq.splice(idx, 1)
  saveDB()
  ok(res, { removed: true })
})

/* ================= 物业反馈（劣迹记录与统计） ================= */
const PROP_CATMAP = () => { const m = {}; (DB.propCats || []).forEach(c => { m[c.id] = c }); return m }
function feedbackReflect (f) { return 1 + ((f.votes && f.votes.length) || 0) } // 反映人次 = 提交人 + 附议数

function computeProp () {
  const cats = DB.propCats || []
  const approved = (DB.feedback || []).filter(f => f.status === 'approved')
  // 参与户数：提交与附议中出现过的、非匿名的房号去重
  const rooms = {}
  approved.forEach(f => {
    if (f.room) rooms[f.room] = 1
    ;(f.votes || []).forEach(v => { if (v.room) rooms[v.room] = 1 })
  })
  const totalVotes = approved.reduce((n, f) => n + ((f.votes && f.votes.length) || 0), 0)
  // 分类计数
  const perCat = cats.map(c => {
    const items = approved.filter(f => f.catId === c.id)
    return { id: c.id, name: c.name, count: items.length, reflect: items.reduce((n, f) => n + feedbackReflect(f), 0) }
  })
  const maxCount = perCat.reduce((m, x) => Math.max(m, x.count), 0)
  // 综合 Top5：按反映人次降序，其次提交时间
  const top5 = approved.slice().sort((a, b) => feedbackReflect(b) - feedbackReflect(a) || b.createdAt - a.createdAt).slice(0, 5)
  const shape = f => ({ id: f.id, catId: f.catId, catName: (PROP_CATMAP()[f.catId] || {}).name || '其他', tags: f.tags || [], text: f.text, room: f.room || '', hasPhoto: !!f.photo, votes: (f.votes && f.votes.length) || 0, reflect: feedbackReflect(f), createdAt: f.createdAt })
  return {
    totalReports: approved.length,
    totalReflect: approved.length + totalVotes,
    participants: Object.keys(rooms).length,
    top5: top5.map(shape),
    perCat, maxCount,
    cats: cats.map(c => ({ id: c.id, name: c.name, tags: c.tags || [], std: c.std || '', level: c.level || '' }))
  }
}

// 公开：概览统计 + 分类 + 综合Top5
app.get('/api/property', (req, res) => ok(res, computeProp()))

// 公开：某分类下已通过的反馈（按反映人次降序）
app.get('/api/property/list', (req, res) => {
  const cat = (req.query.cat || '').trim()
  let items = (DB.feedback || []).filter(f => f.status === 'approved')
  if (cat) items = items.filter(f => f.catId === cat)
  items.sort((a, b) => feedbackReflect(b) - feedbackReflect(a) || b.createdAt - a.createdAt)
  const cmap = PROP_CATMAP()
  ok(res, { list: items.map(f => ({ id: f.id, catId: f.catId, catName: (cmap[f.catId] || {}).name || '其他', tags: f.tags || [], text: f.text, room: f.room || '', hasPhoto: !!f.photo, votes: (f.votes && f.votes.length) || 0, reflect: feedbackReflect(f), createdAt: f.createdAt })) })
})

// 公开：提交反馈（可附一张图）→ 待审核
app.post('/api/property', propUpload, (req, res) => {
  const b = req.body || {}
  const cmap = PROP_CATMAP()
  const catId = (b.catId || '').trim()
  if (!cmap[catId]) return bad(res, '请选择反馈类别')
  const text = (b.text || '').trim()
  if (text.length < 4) return bad(res, '请描述具体问题（至少 4 个字）')
  if (text.length > 500) return bad(res, '问题描述过长（500 字以内）')
  const anon = String(b.anon) === '1' || String(b.anon) === 'true'
  const room = anon ? '' : (b.room || '').trim().slice(0, 30)
  // 标签：仅保留该类别预置标签中的有效项，最多 3 个
  let tags = []
  try { tags = Array.isArray(b.tags) ? b.tags : JSON.parse(b.tags || '[]') } catch (e) { tags = String(b.tags || '').split(',') }
  const allow = cmap[catId].tags || []
  tags = tags.map(x => String(x).trim()).filter(x => x && allow.indexOf(x) >= 0).slice(0, 3)
  const rec = {
    id: uid(), catId, text, tags, room, anon,
    photo: req.file ? req.file.filename : '',
    fp: (b.fp || '').toString().slice(0, 40),
    votes: [],
    status: 'pending', reviewNote: '', createdAt: Date.now()
  }
  DB.feedback.push(rec)
  saveDB()
  ok(res, { id: rec.id })
})

// 公开：+1 我也遇到过（同一浏览器指纹或提交人本人不重复计）
app.post('/api/property/:id/vote', (req, res) => {
  const f = (DB.feedback || []).find(x => x.id === req.params.id)
  if (!f || f.status !== 'approved') return bad(res, '反馈不存在', 404)
  const b = req.body || {}
  const fp = (b.fp || '').toString().slice(0, 40)
  if (!fp) return bad(res, '缺少去重标识')
  if (fp === f.fp) return bad(res, '这是你提交的反馈，无需 +1')
  if ((f.votes || []).some(v => v.fp === fp)) return bad(res, '你已经 +1 过了')
  const anon = String(b.anon) === '1' || String(b.anon) === 'true'
  const room = anon ? '' : (b.room || '').trim().slice(0, 30)
  f.votes = f.votes || []
  f.votes.push({ fp, room, at: Date.now() })
  saveDB()
  ok(res, { votes: f.votes.length, reflect: feedbackReflect(f) })
})

// 公开：查看已通过反馈的图片
app.get('/api/property/photo/:id', (req, res) => {
  const f = (DB.feedback || []).find(x => x.id === req.params.id)
  if (!f || f.status !== 'approved' || !f.photo) return bad(res, '无图片', 404)
  const fp = path.join(UPLOAD_DIR, f.photo)
  if (!fs.existsSync(fp)) return bad(res, '图片已丢失', 404)
  res.sendFile(fp)
})

// 管理：全部反馈（含待审核）
app.get('/api/admin/property', adminOnly, (req, res) => {
  const cmap = PROP_CATMAP()
  const list = (DB.feedback || []).slice().sort((a, b) => b.createdAt - a.createdAt).map(f => ({
    id: f.id, catId: f.catId, catName: (cmap[f.catId] || {}).name || '其他', tags: f.tags || [], text: f.text,
    room: f.room || '', anon: !!f.anon, hasPhoto: !!f.photo, votes: (f.votes && f.votes.length) || 0,
    status: f.status, reviewNote: f.reviewNote || '', createdAt: f.createdAt
  }))
  ok(res, { list, pending: list.filter(x => x.status === 'pending').length })
})

// 管理：查看任意反馈图片
app.get('/api/admin/property/photo/:id', adminOnly, (req, res) => {
  const f = (DB.feedback || []).find(x => x.id === req.params.id)
  if (!f || !f.photo) return bad(res, '无图片', 404)
  const fp = path.join(UPLOAD_DIR, f.photo)
  if (!fs.existsSync(fp)) return bad(res, '图片已丢失', 404)
  res.sendFile(fp)
})

// 管理：审核
app.post('/api/admin/property/:id/review', adminOnly, (req, res) => {
  const f = (DB.feedback || []).find(x => x.id === req.params.id)
  if (!f) return bad(res, '反馈不存在', 404)
  const action = (req.body && req.body.action) || ''
  if (action === 'approve') f.status = 'approved'
  else if (action === 'reject') f.status = 'rejected'
  else return bad(res, '无效操作')
  f.reviewNote = ((req.body && req.body.note) || '').toString().slice(0, 200)
  saveDB()
  ok(res, { reviewed: true, status: f.status })
})

// 管理：删除反馈（连同图片）
app.delete('/api/admin/property/:id', adminOnly, (req, res) => {
  const idx = (DB.feedback || []).findIndex(x => x.id === req.params.id)
  if (idx < 0) return bad(res, '反馈不存在', 404)
  const f = DB.feedback[idx]
  if (f.photo) { const fp = path.join(UPLOAD_DIR, f.photo); fs.existsSync(fp) && fs.unlink(fp, () => {}) }
  DB.feedback.splice(idx, 1)
  saveDB()
  ok(res, { removed: true })
})

// 管理：读取分类配置（供后台编辑）
app.get('/api/admin/property/cats', adminOnly, (req, res) => ok(res, { cats: DB.propCats || [] }))

// 管理：保存分类配置（名称固定，可改标签/标准要点/量化档位）
app.post('/api/admin/property/cats', adminOnly, (req, res) => {
  const incoming = (req.body && req.body.cats) || []
  if (!Array.isArray(incoming)) return bad(res, '参数错误')
  const byId = {}; incoming.forEach(c => { if (c && c.id) byId[c.id] = c })
  DB.propCats = (DB.propCats || []).map(c => {
    const n = byId[c.id]
    if (!n) return c
    return {
      id: c.id, name: c.name,
      tags: cleanOpts(Array.isArray(n.tags) ? n.tags : String(n.tags || '').split(/[,，、;；\n]+/), 30),
      std: String(n.std == null ? '' : n.std).trim().slice(0, 500),
      level: String(n.level == null ? '' : n.level).trim().slice(0, 40)
    }
  })
  saveDB()
  ok(res, { saved: true })
})

function removeFiles (rec) {
  for (const f of [rec.certFile, rec.idFrontFile, rec.idBackFile, rec.signFile, rec.idFile]) {
    if (!f) continue
    const fp = path.join(UPLOAD_DIR, f)
    fs.existsSync(fp) && fs.unlink(fp, () => {})
  }
}

// 可选：用本服务直接托管前端（all-in-one，单域名免跨域）
if (SERVE_WEB && fs.existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR, { index: 'index.html' }))
  console.log('已启用静态前端托管：', WEB_DIR)
}

// 全局兜底
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return bad(res, '图片过大（上限 12MB）')
  console.error(err)
  bad(res, (err && err.message) || '服务器错误', 500)
})

loadDB()
app.listen(PORT, () => {
  console.log('业主之家后端已启动： http://localhost:' + PORT)
  if (!DB.adminHash) console.log('⚠ 尚未设置发起人口令：可在 .env 配置 ADMIN_PASSCODE 后重启，或首次登录时输入的口令将被设为口令。')
})

module.exports = app
