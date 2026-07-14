// 云函数 yezhuApi —— 业主联名筹备组 后端总入口
// 所有数据读写都经过本云函数（三个集合在控制台设为"所有用户不可读写"，
// 仅云函数以管理员身份访问），从而能在服务端强制：一人一签、审核后才计数、管理员鉴权。

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const CONFIG = db.collection('config')
const SIGN = db.collection('signatures')
const ADMIN = db.collection('admins')

const CONFIG_ID = 'main'

// 默认小区参数（首次未配置时返回，便于本地预览）
const DEFAULT_CONFIG = {
  _id: CONFIG_ID,
  communityName: '（请在"小区参数"中填写小区名称）',
  streetOffice: '（请填写所属街道办事处）',
  community: '',      // 所属社区（居委会）
  totalHouseholds: 0, // 业主总人数 / 总户数（人数口径分母）
  totalArea: 0,       // 全体业主专有部分建筑面积合计 ㎡（投票权口径分母）
  thresholdPct: 0.2,  // 法定门槛 20%
  headcountLabel: '业主总人数', // 人数口径分母的称呼，可改为"业主总户数"
  lianmingMatter: '要求成立首次业主大会会议筹备组', // 本次联名的具体事项
  currentStage: 'collecting', // 全流程当前阶段，见 STAGES
  initiatorName: '',
  initiatorPhone: '',
  noticeText: ''
}

// 成立业委会全流程阶段（业主视角）
const STAGES = ['collecting', 'submitted', 'group', 'enroll', 'meeting', 'done']

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const action = event.action
  const p = event.payload || {}

  try {
    switch (action) {
      case 'getStats':        return await getStats(OPENID)
      case 'getMySignature':  return await getMySignature(OPENID)
      case 'submitSignature': return await submitSignature(OPENID, p)
      case 'withdrawMine':    return await withdrawMine(OPENID)
      case 'listSignatures':  return await listSignatures(OPENID, p)
      case 'getOne':          return await getOne(OPENID, p)
      case 'reviewSignature': return await reviewSignature(OPENID, p)
      case 'getExportData':   return await getExportData(OPENID)
      case 'getConfig':       return await getConfigRaw(OPENID)
      case 'saveConfig':      return await saveConfig(OPENID, p)
      case 'claimFirstAdmin': return await claimFirstAdmin(OPENID, p)
      case 'amIAdmin':        return ok({ isAdmin: await isAdmin(OPENID), openid: OPENID })
      default:                return fail('未知的 action：' + action)
    }
  } catch (e) {
    return fail((e && e.message) || String(e))
  }
}

/* ---------------- 工具 ---------------- */
function ok (data) { return { ok: true, data } }
function fail (msg) { return { ok: false, msg } }

async function getConfigDoc () {
  const r = await CONFIG.doc(CONFIG_ID).get().catch(() => null)
  if (r && r.data) return Object.assign({}, DEFAULT_CONFIG, r.data)
  return DEFAULT_CONFIG
}

async function isAdmin (openid) {
  if (!openid) return false
  const r = await ADMIN.where({ openid }).count()
  return r.total > 0
}

async function adminCount () {
  const r = await ADMIN.count()
  return r.total
}

function requireAdminGuard (yes) {
  if (!yes) throw new Error('无权限：仅发起人/审核员可操作')
}

/* ---------------- 统计（核心：双口径 20%） ---------------- */
async function getStats (openid) {
  const cfg = await getConfigDoc()

  // 已通过审核的：户数 + 面积合计
  const aggr = await SIGN.aggregate()
    .match({ status: 'approved' })
    .group({ _id: null, cnt: $.sum(1), areaSum: $.sum('$area') })
    .end()

  const approvedCount = aggr.list.length ? aggr.list[0].cnt : 0
  const approvedArea = aggr.list.length ? (aggr.list[0].areaSum || 0) : 0

  const pending = await SIGN.where({ status: 'pending' }).count()
  const rejected = await SIGN.where({ status: 'rejected' }).count()

  const th = cfg.thresholdPct || 0.2
  const headcountPct = cfg.totalHouseholds > 0 ? approvedCount / cfg.totalHouseholds : 0
  const areaPct = cfg.totalArea > 0 ? approvedArea / cfg.totalArea : 0

  const headcountReached = cfg.totalHouseholds > 0 && headcountPct >= th
  const areaReached = cfg.totalArea > 0 && areaPct >= th
  const qualified = headcountReached || areaReached // 法定"或者"

  // 还差多少达标（取两条口径里更接近达标的提示）
  const needHeadcount = Math.max(0, Math.ceil(cfg.totalHouseholds * th) - approvedCount)
  const needArea = Math.max(0, +(cfg.totalArea * th - approvedArea).toFixed(2))

  return ok({
    community: {
      communityName: cfg.communityName,
      streetOffice: cfg.streetOffice,
      community: cfg.community || '',
      totalHouseholds: cfg.totalHouseholds,
      totalArea: cfg.totalArea,
      headcountLabel: cfg.headcountLabel || '业主总人数',
      lianmingMatter: cfg.lianmingMatter || '要求成立首次业主大会会议筹备组',
      currentStage: cfg.currentStage || 'collecting',
      thresholdPct: th,
      noticeText: cfg.noticeText || '',
      configured: cfg.totalHouseholds > 0 && cfg.totalArea > 0
    },
    approvedCount,
    approvedArea: +approvedArea.toFixed(2),
    pendingCount: pending.total,
    rejectedCount: rejected.total,
    headcountPct: +(headcountPct * 100).toFixed(2),
    areaPct: +(areaPct * 100).toFixed(2),
    headcountReached,
    areaReached,
    qualified,
    needHeadcount,
    needArea,
    isAdmin: await isAdmin(openid)
  })
}

/* ---------------- 我的联名 ---------------- */
async function getMySignature (openid) {
  const r = await SIGN.where({ openid }).limit(1).get()
  const mine = r.data.length ? r.data[0] : null
  return ok({ mine, openid, isAdmin: await isAdmin(openid) })
}

function normRoom (b, u, room) {
  b = (b || '').replace(/\s/g, '')
  u = (u || '').replace(/\s/g, '')
  room = (room || '').replace(/\s/g, '')
  let s = ''
  if (b) s += b + '栋'
  if (u) s += u + '座'
  if (room) s += room + '房'
  return s
}

async function submitSignature (openid, p) {
  // 必填校验
  const name = (p.name || '').trim()
  const building = (p.building || '').trim()
  const unit = (p.unit || '').trim()
  const room = (p.room || '').trim()
  const phone = (p.phone || '').trim()
  const area = Number(p.area)

  if (!name) return fail('请填写业主姓名')
  if (!building) return fail('请选择楼栋')
  if (!room) return fail('请填写房号')
  if (!/^1\d{10}$/.test(phone)) return fail('请填写正确的 11 位手机号')
  if (!(area > 0)) return fail('请填写专有部分建筑面积（㎡）')
  if (!(p.certNo || '').trim()) return fail('请填写不动产权证号/房产证号')
  if (!p.certPhotoFileId) return fail('请上传产权证明照片')
  if (!p.idPhotoFileId) return fail('请上传身份证照片')
  if (!p.signatureFileId) return fail('请完成手写签名')

  const roomFull = normRoom(building, unit, room)

  const record = {
    openid,
    name,
    building,
    unit,
    room,
    roomFull,
    phone,
    area: +area.toFixed(2),
    certNo: (p.certNo || '').trim(),
    certPhotoFileId: p.certPhotoFileId || '',   // 产权证明（房产证）照片
    idPhotoFileId: p.idPhotoFileId || '',       // 身份证复印件照片
    signatureFileId: p.signatureFileId,
    status: 'pending',
    reviewNote: '',
    reviewerOpenid: '',
    submittedAt: db.serverDate(),
    reviewedAt: null
  }

  // 一人（一个微信号）一签：已存在则更新（仅在待审核/被驳回时允许重交）
  const exist = await SIGN.where({ openid }).limit(1).get()
  if (exist.data.length) {
    const old = exist.data[0]
    if (old.status === 'approved') {
      return fail('你的联名已审核通过，如需修改请联系发起人撤回后再提交')
    }
    await SIGN.doc(old._id).update({
      data: {
        name, building, unit, room, roomFull, phone,
        area: record.area, certNo: record.certNo,
        certPhotoFileId: record.certPhotoFileId,
        idPhotoFileId: record.idPhotoFileId,
        signatureFileId: record.signatureFileId,
        status: 'pending', reviewNote: '', reviewerOpenid: '',
        submittedAt: db.serverDate(), reviewedAt: null
      }
    })
    return ok({ updated: true })
  }

  await SIGN.add({ data: record })
  return ok({ created: true })
}

async function withdrawMine (openid) {
  const r = await SIGN.where({ openid }).limit(1).get()
  if (!r.data.length) return fail('没有可撤回的记录')
  if (r.data[0].status === 'approved') return fail('已通过的联名请联系发起人处理')
  await SIGN.doc(r.data[0]._id).remove()
  return ok({ removed: true })
}

/* ---------------- 审核（管理员） ---------------- */
async function listSignatures (openid, p) {
  requireAdminGuard(await isAdmin(openid))
  const status = p.status // 'pending' | 'approved' | 'rejected' | undefined(全部)
  const page = p.page || 0
  const size = Math.min(p.size || 20, 50)

  let q = SIGN
  if (status) q = SIGN.where({ status })
  const res = await q.orderBy('submittedAt', 'desc').skip(page * size).limit(size).get()

  // 标记房号重复（不同微信号填了相同房号）
  const rooms = {}
  const all = await SIGN.field({ roomFull: true, openid: true }).get()
  all.data.forEach(d => { rooms[d.roomFull] = (rooms[d.roomFull] || 0) + 1 })
  const list = res.data.map(d => Object.assign({}, d, { dupRoom: rooms[d.roomFull] > 1 }))

  const cnt = status ? (await SIGN.where({ status }).count()).total : (await SIGN.count()).total
  return ok({ list, total: cnt, page, size })
}

async function getOne (openid, p) {
  requireAdminGuard(await isAdmin(openid))
  if (!p.id) return fail('缺少 id')
  const r = await SIGN.doc(p.id).get().catch(() => null)
  if (!r || !r.data) return fail('记录不存在')
  const rec = r.data
  // 房号重复标记
  const same = await SIGN.where({ roomFull: rec.roomFull }).count()
  return ok({ rec: Object.assign({}, rec, { dupRoom: same.total > 1 }) })
}

async function reviewSignature (openid, p) {
  requireAdminGuard(await isAdmin(openid))
  const { id, action, note } = p
  if (!id || !['approve', 'reject'].includes(action)) return fail('参数有误')
  await SIGN.doc(id).update({
    data: {
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewNote: note || '',
      reviewerOpenid: openid,
      reviewedAt: db.serverDate()
    }
  })
  return ok({ reviewed: true })
}

/* ---------------- 导出汇总（管理员） ---------------- */
async function getExportData (openid) {
  requireAdminGuard(await isAdmin(openid))
  const cfg = await getConfigDoc()

  // 取全部已通过记录（联名清单）
  const out = []
  const MAX = 1000
  let skip = 0
  while (skip < MAX) {
    const r = await SIGN.where({ status: 'approved' })
      .orderBy('reviewedAt', 'asc')
      .field({ name: true, building: true, unit: true, room: true, roomFull: true, area: true, phone: true, certNo: true, signatureFileId: true })
      .skip(skip).limit(100).get()
    out.push(...r.data)
    if (r.data.length < 100) break
    skip += 100
  }

  const totalSignArea = out.reduce((s, d) => s + (d.area || 0), 0)
  const th = cfg.thresholdPct || 0.2
  const headcountPct = cfg.totalHouseholds > 0 ? out.length / cfg.totalHouseholds : 0
  const areaPct = cfg.totalArea > 0 ? totalSignArea / cfg.totalArea : 0

  return ok({
    config: cfg,
    list: out,
    count: out.length,
    totalSignArea: +totalSignArea.toFixed(2),
    headcountPct: +(headcountPct * 100).toFixed(2),
    areaPct: +(areaPct * 100).toFixed(2),
    qualified: (cfg.totalHouseholds > 0 && headcountPct >= th) || (cfg.totalArea > 0 && areaPct >= th)
  })
}

/* ---------------- 小区参数（管理员） ---------------- */
async function getConfigRaw (openid) {
  const cfg = await getConfigDoc()
  return ok({ config: cfg, isAdmin: await isAdmin(openid) })
}

async function saveConfig (openid, p) {
  requireAdminGuard(await isAdmin(openid))
  const data = {
    communityName: (p.communityName || '').trim(),
    streetOffice: (p.streetOffice || '').trim(),
    community: (p.community || '').trim(),
    totalHouseholds: Math.max(0, parseInt(p.totalHouseholds, 10) || 0),
    totalArea: Math.max(0, Number(p.totalArea) || 0),
    thresholdPct: p.thresholdPct ? Number(p.thresholdPct) : 0.2,
    headcountLabel: (p.headcountLabel || '业主总人数').trim(),
    lianmingMatter: (p.lianmingMatter || '要求成立首次业主大会会议筹备组').trim(),
    currentStage: STAGES.indexOf(p.currentStage) >= 0 ? p.currentStage : 'collecting',
    initiatorName: (p.initiatorName || '').trim(),
    initiatorPhone: (p.initiatorPhone || '').trim(),
    noticeText: (p.noticeText || '').trim(),
    updatedAt: db.serverDate()
  }
  // upsert
  const r = await CONFIG.doc(CONFIG_ID).get().catch(() => null)
  if (r && r.data) {
    await CONFIG.doc(CONFIG_ID).update({ data })
  } else {
    await CONFIG.add({ data: Object.assign({ _id: CONFIG_ID }, data) })
  }
  return ok({ saved: true })
}

/* ---------------- 首位管理员领取（免手动改库） ---------------- */
async function claimFirstAdmin (openid, p) {
  const n = await adminCount()
  if (n > 0) return fail('管理员已存在，无法再次领取；如需新增请由现有管理员在后续版本中添加')
  await ADMIN.add({ data: { openid, name: (p.name || '发起人').trim(), addedAt: db.serverDate() } })
  return ok({ becameAdmin: true })
}
