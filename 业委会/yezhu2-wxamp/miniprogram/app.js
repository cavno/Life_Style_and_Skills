App({
  globalData: {
    // ↓↓↓ 部署时务必改成你自己的云开发环境 ID ↓↓↓
    envId: 'cloud1-d4gn5vvf0874b77a3',
    openid: '',
    isAdmin: false
  },

  onLaunch () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    wx.cloud.init({
      env: this.globalData.envId,
      traceUser: true
    })
  },

  // 全局统一调用云函数：app.api('getStats', {...}) → 返回 data，失败抛出可读错误
  api (action, payload = {}) {
    return wx.cloud
      .callFunction({ name: 'yezhuApi', data: { action, payload } })
      .then(res => {
        const r = res.result || {}
        if (r.ok) return r.data
        const e = new Error(r.msg || '操作失败')
        e._handled = true
        throw e
      })
  }
})
