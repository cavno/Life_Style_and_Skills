const app = getApp()

Page({
  data: { id: '', rec: null, loading: true },

  onLoad (q) {
    this.setData({ id: q.id })
    this.load()
  },

  load () {
    app.api('getOne', { id: this.data.id }).then(res => {
      this.setData({ rec: res.rec, loading: false })
    }).catch(e => {
      this.setData({ loading: false })
      wx.showModal({ title: '加载失败', content: e.message || '记录不存在', showCancel: false, success: () => wx.navigateBack() })
    })
  },

  preview (e) {
    const url = e.currentTarget.dataset.url
    if (url) wx.previewImage({ urls: [url], current: url })
  },

  approve () { this.review('approve', '') },

  reject () {
    wx.showModal({
      title: '驳回', editable: true, placeholderText: '驳回原因（可选）',
      success: r => { if (r.confirm) this.review('reject', r.content || '') }
    })
  },

  review (action, note) {
    wx.showLoading({ title: '处理中', mask: true })
    app.api('reviewSignature', { id: this.data.id, action, note }).then(() => {
      wx.hideLoading()
      wx.showToast({ title: action === 'approve' ? '已通过' : '已驳回', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    }).catch(e => {
      wx.hideLoading()
      wx.showToast({ title: e.message, icon: 'none' })
    })
  }
})
