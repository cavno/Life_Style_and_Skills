// ============ 小工具 ============
window.UI = (function () {
  function esc (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  let toastTimer = null
  function toast (msg) {
    const t = document.getElementById('toast')
    t.textContent = msg
    t.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200)
  }

  // confirm/prompt 弹层，返回 Promise
  // opts: { title, body, input(bool), placeholder, okText, danger }
  function dialog (opts) {
    return new Promise(resolve => {
      const mask = document.getElementById('modal')
      document.getElementById('modalTitle').textContent = opts.title || ''
      document.getElementById('modalBody').innerHTML = opts.body || ''
      const input = document.getElementById('modalInput')
      if (opts.input) { input.classList.remove('hidden'); input.value = ''; input.placeholder = opts.placeholder || ''; input.type = opts.password ? 'password' : 'text' }
      else input.classList.add('hidden')
      const ok = document.getElementById('modalOk')
      const cancel = document.getElementById('modalCancel')
      ok.textContent = opts.okText || '确定'
      ok.className = 'btn' + (opts.danger ? ' danger' : '')
      mask.classList.remove('hidden')
      function done (val) {
        mask.classList.add('hidden')
        ok.onclick = null; cancel.onclick = null
        resolve(val)
      }
      ok.onclick = () => done(opts.input ? (input.value || '') : true)
      cancel.onclick = () => done(opts.input ? null : false)
    })
  }

  function loading (on) {
    let el = document.getElementById('globalLoading')
    if (on) {
      if (!el) {
        el = document.createElement('div')
        el.id = 'globalLoading'
        el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;z-index:70'
        el.innerHTML = '<div style="background:#fff;padding:16px 22px;border-radius:12px;font-size:14px;color:#5b6470">处理中…</div>'
        document.body.appendChild(el)
      }
    } else if (el) el.remove()
  }

  // 把 dataURL 转成 File，便于 multipart 上传
  function dataURLtoFile (dataURL, filename) {
    const arr = dataURL.split(',')
    const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png'
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8 = new Uint8Array(n)
    while (n--) u8[n] = bstr.charCodeAt(n)
    return new File([u8], filename, { type: mime })
  }

  return { esc, toast, dialog, loading, dataURLtoFile }
})()
