const app = getApp()

const STAGE_OPTIONS = [
  { key: 'collecting', label: '1 联名征集中' },
  { key: 'submitted', label: '2 已提交申请·街道办受理' },
  { key: 'group', label: '3 筹备组已成立' },
  { key: 'enroll', label: '4 代表/委员报名遴选中' },
  { key: 'meeting', label: '5 首次业主大会·选举中' },
  { key: 'done', label: '6 业委会已成立·备案' }
]

Page({
  data: {
    loading: true,
    stageOptions: STAGE_OPTIONS,
    stageIndex: 0,
    form: {
      communityName: '', streetOffice: '', community: '',
      totalHouseholds: '', totalArea: '',
      headcountLabel: '业主总人数',
      lianmingMatter: '要求成立首次业主大会会议筹备组',
      currentStage: 'collecting',
      initiatorName: '', initiatorPhone: '', noticeText: ''
    },
    saving: false
  },

  onShow () { this.load() },

  load () {
    app.api('getConfig').then(res => {
      const c = res.config
      const idx = Math.max(0, STAGE_OPTIONS.findIndex(x => x.key === (c.currentStage || 'collecting')))
      this.setData({
        loading: false,
        stageIndex: idx,
        form: {
          communityName: c.communityName && c.communityName.indexOf('请') === -1 ? c.communityName : '',
          streetOffice: c.streetOffice && c.streetOffice.indexOf('请') === -1 ? c.streetOffice : '',
          community: c.community || '',
          totalHouseholds: c.totalHouseholds || '',
          totalArea: c.totalArea || '',
          headcountLabel: c.headcountLabel || '业主总人数',
          lianmingMatter: c.lianmingMatter || '要求成立首次业主大会会议筹备组',
          currentStage: c.currentStage || 'collecting',
          initiatorName: c.initiatorName || '',
          initiatorPhone: c.initiatorPhone || '',
          noticeText: c.noticeText || ''
        }
      })
      if (!res.isAdmin) {
        wx.showModal({ title: '无权限', content: '仅发起人/审核员可设置', showCancel: false, success: () => wx.navigateBack() })
      }
    }).catch(e => {
      this.setData({ loading: false })
      wx.showToast({ title: e.message, icon: 'none' })
    })
  },

  onInput (e) {
    const k = e.currentTarget.dataset.k
    this.setData({ [`form.${k}`]: e.detail.value })
  },

  pickLabel (e) {
    this.setData({ 'form.headcountLabel': e.currentTarget.dataset.v })
  },

  onStageChange (e) {
    const i = Number(e.detail.value)
    this.setData({ stageIndex: i, 'form.currentStage': STAGE_OPTIONS[i].key })
  },

  save () {
    const f = this.data.form
    if (!f.communityName.trim()) return wx.showToast({ title: '请填写小区名称', icon: 'none' })
    if (!f.streetOffice.trim()) return wx.showToast({ title: '请填写街道办名称', icon: 'none' })
    if (!(parseInt(f.totalHouseholds, 10) > 0)) return wx.showToast({ title: '请填写业主总人数/户数', icon: 'none' })
    if (!(Number(f.totalArea) > 0)) return wx.showToast({ title: '请填写建筑面积总数', icon: 'none' })

    this.setData({ saving: true })
    app.api('saveConfig', f).then(() => {
      this.setData({ saving: false })
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    }).catch(e => {
      this.setData({ saving: false })
      wx.showToast({ title: e.message, icon: 'none' })
    })
  }
})
