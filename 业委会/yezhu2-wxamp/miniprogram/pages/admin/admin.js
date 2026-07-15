const app = getApp()

Page({
  data: {
    tab: 'pending',     // pending | approved | rejected | all
    list: [],
    total: 0,
    page: 0,
    size: 20,
    loading: true,
    noMore: false
  },

  onShow () {
    if (!app.globalData.isAdmin) {
      // 兜底校验
      app.api('amIAdmin').then(r => {
        if (!r.isAdmin) {
          wx.showModal({ title: '无权限', content: '仅发起人/审核员可访问', showCancel: false, success: () => wx.navigateBack() })
        } else {
          app.globalData.isAdmin = true
          this.reload()
        }
      })
    } else {
      this.reload()
    }
  },

  switchTab (e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab }, () => this.reload())
  },

  reload () {
    this.setData({ list: [], page: 0, noMore: false })
    this.fetch()
  },

  fetch () {
    this.setData({ loading: true })
    const status = this.data.tab === 'all' ? undefined : this.data.tab
    app.api('listSignatures', { status, page: this.data.page, size: this.data.size })
      .then(res => {
        const list = this.data.page === 0 ? res.list : this.data.list.concat(res.list)
        this.setData({
          list, total: res.total, loading: false,
          noMore: list.length >= res.total
        })
      })
      .catch(e => {
        this.setData({ loading: false })
        wx.showToast({ title: e.message || '加载失败', icon: 'none' })
      })
  },

  loadMore () {
    if (this.data.noMore || this.data.loading) return
    this.setData({ page: this.data.page + 1 }, () => this.fetch())
  },

  openDetail (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  // 列表内快捷通过/驳回
  quick (e) {
    const { id, act } = e.currentTarget.dataset
    if (act === 'reject') {
      wx.showModal({
        title: '驳回', editable: true, placeholderText: '填写驳回原因（可选）',
        success: r => {
          if (!r.confirm) return
          this.doReview(id, 'reject', r.content || '')
        }
      })
    } else {
      this.doReview(id, 'approve', '')
    }
  },

  doReview (id, action, note) {
    wx.showLoading({ title: '处理中', mask: true })
    app.api('reviewSignature', { id, action, note }).then(() => {
      wx.hideLoading()
      wx.showToast({ title: action === 'approve' ? '已通过' : '已驳回', icon: 'none' })
      this.reload()
    }).catch(e => {
      wx.hideLoading()
      wx.showToast({ title: e.message || '失败', icon: 'none' })
    })
  }
})
