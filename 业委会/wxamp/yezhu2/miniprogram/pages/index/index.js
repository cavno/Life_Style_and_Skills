const app = getApp()

const STAGE_LABELS = [
  { key: 'collecting', short: '联名' },
  { key: 'submitted', short: '受理' },
  { key: 'group', short: '筹备组' },
  { key: 'enroll', short: '报名' },
  { key: 'meeting', short: '选举' },
  { key: 'done', short: '成立' }
]

Page({
  data: {
    loading: true,
    stats: null,
    stageLabels: STAGE_LABELS,
    currentNo: 1
  },

  onShow () {
    this.load()
  },

  onPullDownRefresh () {
    this.load(() => wx.stopPullDownRefresh())
  },

  load (done) {
    this.setData({ loading: true })
    app.api('getStats').then(stats => {
      app.globalData.isAdmin = stats.isAdmin
      const idx = STAGE_LABELS.findIndex(x => x.key === (stats.community.currentStage || 'collecting'))
      this.setData({ stats, loading: false, currentNo: idx >= 0 ? idx + 1 : 1 })
      done && done()
    }).catch(e => {
      this.setData({ loading: false })
      done && done()
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    })
  },

  goRegister () { wx.switchTab({ url: '/pages/register/register' }) },
  goAdmin () { wx.navigateTo({ url: '/pages/admin/admin' }) },
  goExport () { wx.navigateTo({ url: '/pages/export/export' }) },
  goConfig () { wx.navigateTo({ url: '/pages/config/config' }) },
  goGuide () { wx.switchTab({ url: '/pages/guide/guide' }) }
})
