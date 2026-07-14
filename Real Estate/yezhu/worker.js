// 业主之家 · 成立业委会 —— Cloudflare Worker（静态资源 + API 一体）
// 部署：wrangler deploy（读取 wrangler.toml）。静态资源在 ./public，API 走 /api/*。
// 数据：D1（绑定名 DB）；图片：R2（绑定名 BUCKET）；静态资源：ASSETS 绑定。
// 仅用 Web 标准 API（crypto.subtle / formData / D1 / R2），无需 nodejs_compat。

const STAGES = ['collecting', 'submitted', 'group', 'enroll', 'meeting', 'done']
const DEFAULT_MATTER = '要求成立首次业主大会会议筹备组'
const enc = new TextEncoder()

function cors (h = {}) {
  return Object.assign({
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS'
  }, h)
}
function json (data, status = 200) {
  return new Response(JSON.stringify({ ok: true, data: data == null ? {} : data }), { status, headers: cors({ 'content-type': 'application/json;charset=utf-8' }) })
}
function fail (msg, status = 400) {
  return new Response(JSON.stringify({ ok: false, msg }), { status, headers: cors({ 'content-type': 'application/json;charset=utf-8' }) })
}
function uid () { return crypto.randomUUID().replace(/-/g, '') }
function normRoom (b, u, r) {
  b = (b || '').replace(/\s/g, ''); u = (u || '').replace(/\s/g, ''); r = (r || '').replace(/\s/g, '')
  let s = ''; if (b) s += b + '栋'; if (u) s += u + '座'; if (r) s += r + '房'; return s
}
async function sha256hex (s) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s))
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('')
}
function b64url (bytes) {
  let bin = ''; const a = new Uint8Array(bytes)
  for (let i = 0; i < a.length; i++) bin += String.fromCharCode(a[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlBytes (str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/'); const pad = str.length % 4 ? '='.repeat(4 - str.length % 4) : ''
  const bin = atob(str + pad); const a = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i)
  return a
}
async function hmac (secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return b64url(sig)
}
async function tokenCreate (secret) {
  const payload = b64url(enc.encode(JSON.stringify({ r: 'admin', exp: Date.now() + 30 * 864e5 })))
  return payload + '.' + await hmac(secret, payload)
}
async function tokenVerify (secret, token) {
  if (!token || token.indexOf('.') < 0) return false
  const [p, sig] = token.split('.')
  if (sig !== await hmac(secret, p)) return false
  try { const o = JSON.parse(new TextDecoder().decode(b64urlBytes(p))); return o.exp > Date.now() } catch (e) { return false }
}
function tokenFrom (request, url) {
  const h = request.headers.get('authorization') || ''
  if (h.startsWith('Bearer ')) return h.slice(7)
  return url.searchParams.get('t') || ''
}

async function ensureConfig (env) {
  let c = await env.DB.prepare('SELECT * FROM config WHERE id=1').first()
  if (!c) {
    const secret = uid() + uid()
    await env.DB.prepare(
      'INSERT INTO config (id,communityName,streetOffice,community,totalHouseholds,totalArea,thresholdPct,headcountLabel,lianmingMatter,currentStage,initiatorName,initiatorPhone,noticeText,adminHash,secret) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind('', '', '', 0, 0, 0.2, '业主总人数', DEFAULT_MATTER, 'collecting', '', '', '', '', secret).run()
    c = await env.DB.prepare('SELECT * FROM config WHERE id=1').first()
  }
  if (!c.secret) { const s = uid() + uid(); await env.DB.prepare('UPDATE config SET secret=? WHERE id=1').bind(s).run(); c.secret = s }
  if (!c.adminHash && env.ADMIN_PASSCODE) {
    const h = await sha256hex(c.secret + '|' + env.ADMIN_PASSCODE)
    await env.DB.prepare('UPDATE config SET adminHash=? WHERE id=1').bind(h).run(); c.adminHash = h
  }
  return c
}
function publicConfig (c) {
  return {
    communityName: c.communityName || '（未设置小区名称）',
    streetOffice: c.streetOffice || '（未设置街道办）',
    community: c.community || '',
    totalHouseholds: c.totalHouseholds || 0, totalArea: c.totalArea || 0,
    thresholdPct: c.thresholdPct || 0.2, headcountLabel: c.headcountLabel || '业主总人数',
    lianmingMatter: c.lianmingMatter || DEFAULT_MATTER, currentStage: c.currentStage || 'collecting',
    initiatorName: c.initiatorName || '', initiatorPhone: c.initiatorPhone || '', noticeText: c.noticeText || '',
    configured: (c.totalHouseholds || 0) > 0 && (c.totalArea || 0) > 0
  }
}
async function computeStats (env, c) {
  const th = c.thresholdPct || 0.2
  const ag = await env.DB.prepare("SELECT COUNT(*) n, COALESCE(SUM(area),0) a FROM signatures WHERE status='approved'").first()
  const pend = await env.DB.prepare("SELECT COUNT(*) n FROM signatures WHERE status='pending'").first()
  const rej = await env.DB.prepare("SELECT COUNT(*) n FROM signatures WHERE status='rejected'").first()
  const cnt = ag.n || 0, ar = ag.a || 0
  const hp = c.totalHouseholds > 0 ? cnt / c.totalHouseholds : 0
  const apc = c.totalArea > 0 ? ar / c.totalArea : 0
  const hr = c.totalHouseholds > 0 && hp >= th, arr = c.totalArea > 0 && apc >= th
  return {
    community: publicConfig(c), approvedCount: cnt, approvedArea: +ar.toFixed(2),
    pendingCount: pend.n || 0, rejectedCount: rej.n || 0,
    headcountPct: +(hp * 100).toFixed(2), areaPct: +(apc * 100).toFixed(2),
    headcountReached: hr, areaReached: arr, qualified: hr || arr,
    needHeadcount: Math.max(0, Math.ceil(c.totalHouseholds * th) - cnt),
    needArea: Math.max(0, +(c.totalArea * th - ar).toFixed(2))
  }
}
function mineView (s) {
  return { name: s.name, building: s.building, unit: s.unit, room: s.room, roomFull: s.roomFull, area: s.area, phone: s.phone, certNo: s.certNo, status: s.status, reviewNote: s.reviewNote, certPhotoFileId: s.certKey, idPhotoFileId: s.idKey }
}

async function submit (env, request) {
  const form = await request.formData()
  const g = k => ((form.get(k) ?? '') + '').trim()
  const name = g('name'), building = g('building'), unit = g('unit'), room = g('room'), phone = g('phone'), certNo = g('certNo')
  const area = Number(form.get('area'))
  const editToken = g('editToken')
  if (!name) return fail('请填写业主姓名')
  if (!room) return fail('请填写房号')
  if (!/^1\d{10}$/.test(phone)) return fail('请填写正确的 11 位手机号')
  if (!(area > 0)) return fail('请填写房屋建筑面积')

  const isFile = f => f && typeof f === 'object' && typeof f.arrayBuffer === 'function' && f.size > 0
  const certFile = form.get('cert'), idFile = form.get('id'), signFile = form.get('sign')

  const row = editToken ? await env.DB.prepare('SELECT * FROM signatures WHERE editToken=?').bind(editToken).first() : null
  if (row && row.status === 'approved') return fail('已通过的联名请联系发起人撤回后再改')
  const id = row ? row.id : uid()
  let certKey = row ? row.certKey : null, idKey = row ? row.idKey : null, signKey = row ? row.signKey : null
  if (isFile(certFile)) { certKey = 'cert/' + id; await env.BUCKET.put(certKey, await certFile.arrayBuffer(), { httpMetadata: { contentType: certFile.type || 'image/png' } }) }
  if (isFile(idFile)) { idKey = 'id/' + id; await env.BUCKET.put(idKey, await idFile.arrayBuffer(), { httpMetadata: { contentType: idFile.type || 'image/png' } }) }
  if (isFile(signFile)) { signKey = 'sign/' + id; await env.BUCKET.put(signKey, await signFile.arrayBuffer(), { httpMetadata: { contentType: signFile.type || 'image/png' } }) }
  if (!signKey) return fail('请完成手写签名')

  const roomFull = normRoom(building, unit, room)
  const now = Date.now()
  if (row) {
    await env.DB.prepare('UPDATE signatures SET name=?,building=?,unit=?,room=?,roomFull=?,phone=?,area=?,certNo=?,certKey=?,idKey=?,signKey=?,status=?,reviewNote=?,reviewedAt=?,submittedAt=? WHERE id=?')
      .bind(name, building, unit, room, roomFull, phone, +area.toFixed(2), certNo, certKey, idKey, signKey, 'pending', '', null, now, id).run()
    return json({ id, editToken: row.editToken })
  }
  const newEdit = editToken || uid()
  await env.DB.prepare('INSERT INTO signatures (id,editToken,name,building,unit,room,roomFull,phone,area,certNo,certKey,idKey,signKey,status,reviewNote,reviewedAt,submittedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, newEdit, name, building, unit, room, roomFull, phone, +area.toFixed(2), certNo, certKey, idKey, signKey, 'pending', '', null, now).run()
  return json({ id, editToken: newEdit })
}

async function withdraw (env, request) {
  const b = await request.json().catch(() => ({}))
  const row = await env.DB.prepare('SELECT * FROM signatures WHERE editToken=?').bind(b.editToken || '').first()
  if (!row) return fail('没有可撤回的记录')
  if (row.status === 'approved') return fail('已通过的联名请联系发起人处理')
  for (const k of [row.certKey, row.idKey, row.signKey]) if (k) await env.BUCKET.delete(k)
  await env.DB.prepare('DELETE FROM signatures WHERE id=?').bind(row.id).run()
  return json({ removed: true })
}

async function login (env, request, c) {
  const b = await request.json().catch(() => ({}))
  const passcode = (b.passcode || '') + ''
  if (!c.adminHash) {
    if (!passcode) return fail('请设置发起人口令')
    const h = await sha256hex(c.secret + '|' + passcode)
    await env.DB.prepare('UPDATE config SET adminHash=? WHERE id=1').bind(h).run()
  } else {
    const h = await sha256hex(c.secret + '|' + passcode)
    if (h !== c.adminHash) return fail('口令不正确', 401)
  }
  return json({ token: await tokenCreate(c.secret) })
}

async function listSigs (env, url) {
  const status = (url.searchParams.get('status') || '').trim()
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10))
  const size = Math.min(100, Math.max(1, parseInt(url.searchParams.get('size') || '20', 10)))
  const where = status ? 'WHERE status=?' : ''
  const binds = status ? [status] : []
  const total = await env.DB.prepare(`SELECT COUNT(*) n FROM signatures ${where}`).bind(...binds).first()
  const rs = await env.DB.prepare(`SELECT id,name,roomFull,area,phone,certNo,status FROM signatures ${where} ORDER BY submittedAt DESC LIMIT ? OFFSET ?`).bind(...binds, size, page * size).all()
  const dupRs = await env.DB.prepare('SELECT roomFull FROM signatures GROUP BY roomFull HAVING COUNT(*)>1').all()
  const dup = new Set((dupRs.results || []).map(r => r.roomFull))
  const list = (rs.results || []).map(r => ({ id: r.id, name: r.name, roomFull: r.roomFull, area: r.area, phone: r.phone, certNo: r.certNo, status: r.status, dupRoom: dup.has(r.roomFull) }))
  return json({ list, total: total.n || 0, page, size })
}

async function getOne (env, id) {
  const s = await env.DB.prepare('SELECT * FROM signatures WHERE id=?').bind(id).first()
  if (!s) return fail('记录不存在', 404)
  const d = await env.DB.prepare('SELECT COUNT(*) n FROM signatures WHERE roomFull=?').bind(s.roomFull).first()
  return json({ rec: { id: s.id, name: s.name, building: s.building, unit: s.unit, room: s.room, roomFull: s.roomFull, area: s.area, phone: s.phone, certNo: s.certNo, status: s.status, reviewNote: s.reviewNote, dupRoom: (d.n || 0) > 1, hasCert: !!s.certKey, hasId: !!s.idKey, hasSign: !!s.signKey } })
}

async function review (env, request, id) {
  const s = await env.DB.prepare('SELECT id FROM signatures WHERE id=?').bind(id).first()
  if (!s) return fail('记录不存在', 404)
  const b = await request.json().catch(() => ({}))
  if (b.action !== 'approve' && b.action !== 'reject') return fail('无效操作')
  await env.DB.prepare('UPDATE signatures SET status=?,reviewNote=?,reviewedAt=? WHERE id=?')
    .bind(b.action === 'approve' ? 'approved' : 'rejected', b.note || '', Date.now(), id).run()
  return json({ reviewed: true })
}

async function exportData (env, c) {
  const th = c.thresholdPct || 0.2
  const rs = await env.DB.prepare("SELECT id,name,roomFull,area,phone,certNo FROM signatures WHERE status='approved' ORDER BY reviewedAt ASC").all()
  const list = rs.results || []
  const totalSignArea = list.reduce((a, s) => a + (Number(s.area) || 0), 0)
  const hp = c.totalHouseholds > 0 ? list.length / c.totalHouseholds : 0
  const ap = c.totalArea > 0 ? totalSignArea / c.totalArea : 0
  return json({
    config: publicConfig(c), list, count: list.length, totalSignArea: +totalSignArea.toFixed(2),
    headcountPct: +(hp * 100).toFixed(2), areaPct: +(ap * 100).toFixed(2),
    qualified: (c.totalHouseholds > 0 && hp >= th) || (c.totalArea > 0 && ap >= th)
  })
}

async function saveConfig (env, request) {
  const p = await request.json().catch(() => ({}))
  const stage = STAGES.indexOf(p.currentStage) >= 0 ? p.currentStage : 'collecting'
  await env.DB.prepare('UPDATE config SET communityName=?,streetOffice=?,community=?,totalHouseholds=?,totalArea=?,thresholdPct=?,headcountLabel=?,lianmingMatter=?,currentStage=?,initiatorName=?,initiatorPhone=?,noticeText=? WHERE id=1')
    .bind((p.communityName || '').trim(), (p.streetOffice || '').trim(), (p.community || '').trim(),
      Math.max(0, parseInt(p.totalHouseholds, 10) || 0), Math.max(0, Number(p.totalArea) || 0),
      p.thresholdPct ? Number(p.thresholdPct) : 0.2, (p.headcountLabel || '业主总人数').trim(),
      (p.lianmingMatter || DEFAULT_MATTER).trim(), stage, (p.initiatorName || '').trim(),
      (p.initiatorPhone || '').trim(), (p.noticeText || '').trim()).run()
  return json({ saved: true })
}

async function getFile (env, id, kind) {
  const s = await env.DB.prepare('SELECT certKey,idKey,signKey FROM signatures WHERE id=?').bind(id).first()
  if (!s) return fail('记录不存在', 404)
  const key = kind === 'cert' ? s.certKey : kind === 'id' ? s.idKey : kind === 'sign' ? s.signKey : null
  if (!key) return fail('无此文件', 404)
  const obj = await env.BUCKET.get(key)
  if (!obj) return fail('文件已丢失', 404)
  return new Response(obj.body, { headers: cors({ 'content-type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/png', 'cache-control': 'private,max-age=60' }) })
}

// /api/* 路由
async function handleApi (request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors() })
  const seg = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean)
  const path = '/' + seg.join('/')
  const m = request.method
  try {
    if (!env.DB) return fail('后端未绑定 D1 数据库（绑定名应为 DB）', 500)
    const c = await ensureConfig(env)

    if (path === '/stats' && m === 'GET') return json(await computeStats(env, c))
    if (path === '/config' && m === 'GET') return json({ config: publicConfig(c) })
    if (path === '/mine' && m === 'POST') {
      const b = await request.json().catch(() => ({}))
      if (!b.editToken) return json({ mine: null })
      const s = await env.DB.prepare('SELECT * FROM signatures WHERE editToken=?').bind(b.editToken).first()
      return json({ mine: s ? mineView(s) : null })
    }
    if (path === '/signatures' && m === 'POST') return await submit(env, request)
    if (path === '/signatures/withdraw' && m === 'POST') return await withdraw(env, request)
    if (path === '/admin/login' && m === 'POST') return await login(env, request, c)

    if (path.startsWith('/admin/')) {
      const ok = await tokenVerify(c.secret, tokenFrom(request, url))
      if (!ok) return fail('需要发起人登录', 401)
    }
    if (path === '/admin/status' && m === 'GET') return json({ isAdmin: true })
    if (path === '/admin/signatures' && m === 'GET') return await listSigs(env, url)
    if (path.startsWith('/admin/signatures/') && path.endsWith('/review') && m === 'POST') return await review(env, request, seg[2])
    if (path.startsWith('/admin/signatures/') && m === 'GET') return await getOne(env, seg[2])
    if (path === '/admin/export' && m === 'GET') return await exportData(env, c)
    if (path === '/admin/config' && m === 'POST') return await saveConfig(env, request)
    if (path.startsWith('/admin/file/') && m === 'GET') return await getFile(env, seg[2], seg[3])

    return fail('未知接口：' + m + ' ' + path, 404)
  } catch (e) {
    return fail('服务器错误：' + (e && e.message ? e.message : e), 500)
  }
}

export default {
  async fetch (request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url)
    }
    // 其余交给静态资源（public/）
    if (env.ASSETS) return env.ASSETS.fetch(request)
    return new Response('Not found', { status: 404 })
  }
}
