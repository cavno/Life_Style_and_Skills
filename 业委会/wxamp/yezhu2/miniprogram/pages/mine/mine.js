const app = getApp()

Page({
  data: {
    loading: true,
    openid: '',
    isAdmin: false,
    mine: null,
    adminExists: null,   // 是否已有管理员
    claiming: false
  },

  onShow () { this.load() },

  load () {
    Promise.all([ app.api('getMySignature'), app.api('getConfig') ])
      .then(([m, c]) => {
        app.globalData.openid = m.openid
        app.globalData.isAdmin = m.isAdmin
        this.setData({
          loading: false,
          openid: m.openid,
          isAdmin: m.isAdmin,
          mine: m.mine
        })
        // 是否已有管理员：用 amIAdmin 不够，这里通过尝试性提示。简单做法：
        // 若自己不是管理员，给出"领取管理员"入口；领取失败说明已有人领取。
      })
      .catch(e => {
        this.setData({ loading: false })
        wx.showToast({ title: e.message || '加载失败', icon: 'none' })
      })
  },

  copyOpenid () {
    wx.setClipboardData({ data: this.data.openid, success: () => {
      wx.showToast({ title: '已复制', icon: 'none' })
    }})
  },

  claimAdmin () {
    wx.showModal({
      title: '领取发起人/管理员',
      content: '仅限筹备发起人操作。领取后你将拥有审核联名、导出汇总、设置参数的权限。整个小区仅首位领取者生效。确定领取？',
      success: r => {
        if (!r.confirm) return
        this.setData({ claiming: true })
        app.api('claimFirstAdmin', { name: this.data.mine ? this.data.mine.name : '发起人' })
          .then(() => {
            wx.showToast({ title: '已成为管理员', icon: 'success' })
            this.setData({ claiming: false })
            this.load()
          })
          .catch(e => {
            this.setData({ claiming: false })
            wx.showModal({ title: '无法领取', content: e.message || '可能已有管理员', showCancel: false })
          })
      }
    })
  },

  goRegister () { wx.switchTab({ url: '/pages/register/register' }) },
  goAdmin () { wx.navigateTo({ url: '/pages/admin/admin' }) },
  goExport () { wx.navigateTo({ url: '/pages/export/export' }) },
  goConfig () { wx.navigateTo({ url: '/pages/config/config' }) }
})
