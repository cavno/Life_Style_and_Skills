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
  initiatorName: '', initiatorPhone: '', noticeText: ''
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
function normRoom (b, u, r) { return [b, u, r].filter(Boolean).join('').replace(/\s/g, '') }
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
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype))
})
const sigUpload = upload.fields([{ name: 'cert', maxCount: 1 }, { name: 'id', maxCount: 1 }, { name: 'sign', maxCount: 1 }])

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
  ok(res, { mine: { name: s.name, building: s.building, unit: s.unit, room: s.room, roomFull: s.roomFull, area: s.area, phone: s.phone, certNo: s.certNo, status: s.status, reviewNote: s.reviewNote } })
})

app.post('/api/signatures', sigUpload, (req, res) => {
  const b = req.body || {}
  const files = req.files || {}
  const name = (b.name || '').trim()
  const room = (b.room || '').trim()
  const phone = (b.phone || '').trim()
  const area = Number(b.area)
  if (!name) return bad(res, '请填写业主姓名')
  if (!room) return bad(res, '请填写房号')
  if (!/^1\d{10}$/.test(phone)) return bad(res, '请填写正确的 11 位手机号')
  if (!(area > 0)) return bad(res, '请填写房屋建筑面积')

  const editToken = (b.editToken || '').trim()
  let rec = editToken ? DB.signatures.find(x => x.editToken === editToken) : null
  const newCert = files.cert && files.cert[0] ? files.cert[0].filename : null
  const newId = files.id && files.id[0] ? files.id[0].filename : null
  const newSign = files.sign && files.sign[0] ? files.sign[0].filename : null

  if (rec) {
    if (rec.status === 'approved') return bad(res, '已通过的联名请联系发起人撤回后再改')
    // 更新；未重传的证件保留旧的；签名必须有（前端每次提交都会带）
    if (!newSign && !rec.signFile) return bad(res, '请完成手写签名')
    rec.name = name; rec.building = b.building || ''; rec.unit = b.unit || ''; rec.room = room
    rec.roomFull = normRoom(b.building, b.unit, room)
    rec.phone = phone; rec.area = +area.toFixed(2); rec.certNo = (b.certNo || '').trim()
    if (newCert) rec.certFile = newCert
    if (newId) rec.idFile = newId
    if (newSign) rec.signFile = newSign
    rec.status = 'pending'; rec.reviewNote = ''; rec.reviewedAt = null; rec.submittedAt = Date.now()
    saveDB()
    return ok(res, { id: rec.id, editToken: rec.editToken })
  }

  if (!newSign) return bad(res, '请完成手写签名')
  rec = {
    id: uid(), editToken: editToken || uid(),
    name, building: b.building || '', unit: b.unit || '', room, roomFull: normRoom(b.building, b.unit, room),
    phone, area: +area.toFixed(2), certNo: (b.certNo || '').trim(),
    certFile: newCert, idFile: newId, signFile: newSign,
    status: 'pending', reviewNote: '', reviewedAt: null, submittedAt: Date.now()
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
    dupRoom: counts[x.roomFull] > 1, hasCert: !!x.certFile, hasId: !!x.idFile, hasSign: !!x.signFile
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
    noticeText: (p.noticeText || '').trim()
  })
  saveDB()
  ok(res, { saved: true })
})

// 证件 / 签名图（仅发起人，token 可走 ?t= ）
app.get('/api/admin/file/:id/:kind', adminOnly, (req, res) => {
  const x = DB.signatures.find(s => s.id === req.params.id)
  if (!x) return bad(res, '记录不存在', 404)
  const map = { cert: x.certFile, id: x.idFile, sign: x.signFile }
  const fname = map[req.params.kind]
  if (!fname) return bad(res, '无此文件', 404)
  const fp = path.join(UPLOAD_DIR, fname)
  if (!fs.existsSync(fp)) return bad(res, '文件已丢失', 404)
  res.sendFile(fp)
})

function removeFiles (rec) {
  for (const f of [rec.certFile, rec.idFile, rec.signFile]) {
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
