const app = getApp()

Page({
  data: { loading: true, data: null, letter: '', today: '', showSign: false },

  onLoad () {
    const d = new Date()
    this.setData({ today: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` })
  },

  onShow () { this.load() },

  load () {
    app.api('getExportData').then(res => {
      this.setData({ data: res, loading: false, letter: this.buildLetter(res) })
    }).catch(e => {
      this.setData({ loading: false })
      wx.showModal({ title: '无法导出', content: e.message || '仅管理员可用', showCancel: false, success: () => wx.navigateBack() })
    })
  },

  // 严格按官方模板 附件2《关于XX小区成立首次业主大会会议筹备组申请书》措辞
  buildLetter (res) {
    const c = res.config
    const th = (c.thresholdPct || 0.2) * 100
    const hc = res.headcountPct >= th ? '☑' : '☐'
    const ar = res.areaPct >= th ? '☑' : '☐'
    return (
`关于${c.communityName}成立首次业主大会会议筹备组申请书
（百分之二十以上业主联名）

深圳市龙岗区${c.streetOffice ? c.streetOffice.replace('深圳市龙岗区','').replace('街道办事处','') : '＿＿'}街道办事处：

  ${c.communityName}业主总人数为 ${c.totalHouseholds} 人，业主专有部分总建筑面积（总投票权数）为 ${c.totalArea} 平方米，现本小区已符合以下条件：

  ${hc}物业管理区域内 ${res.count} 名业主联名，占业主总人数 ${res.headcountPct}%（达到百分之二十以上）。

  ${ar}物业管理区域内持有专有部分建筑面积 ${res.totalSignArea} 平方米的业主联名，占全体业主总投票权数 ${res.areaPct}%（达到百分之二十以上）。

  根据《深圳经济特区物业管理条例》第十九条规定，特向街道办事处书面申请成立首次业主大会会议筹备组。

  附件：2-1. 业主联名表（共 ${res.count} 人）

  （联系人：${c.initiatorName || '＿＿＿＿'}；联系方式：${c.initiatorPhone || '＿＿＿＿＿＿'}）

  ${c.communityName}全体联名业主
  ${this.data.today}`
    )
  },

  copyLetter () {
    wx.setClipboardData({ data: this.data.letter, success: () => {
      wx.showToast({ title: '申请书已复制', icon: 'none' })
    }})
  },

  // 按官方联名表 附件2-1 的列复制为表格
  copyList () {
    const c = this.data.data.config
    const header1 = `${c.community || ''}街道${''}　社区　${c.communityName}　联名时间：${this.data.today}`
    const cols = '序号\t业主姓名\t楼栋房号\t房屋建筑面积\t联系方式\t业主本人签名'
    const rows = this.data.data.list.map((d, i) =>
      `${i + 1}\t${d.name}\t${d.roomFull}\t${d.area}\t${d.phone || ''}\t（见系统签名）`
    )
    const note = '备注：联名业主需提供身份证复印件、产权证明复印件。'
    const text = [header1, '', cols, ...rows, '', note].join('\n')
    wx.setClipboardData({ data: text, success: () => {
      wx.showToast({ title: '联名表已复制(可粘贴到表格)', icon: 'none' })
    }})
  },

  toggleSign () { this.setData({ showSign: !this.data.showSign }) },

  previewSign (e) {
    const url = e.currentTarget.dataset.url
    if (url) wx.previewImage({ urls: [url], current: url })
  }
})
