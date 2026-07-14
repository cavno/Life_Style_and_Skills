const app = getApp()

const BUILDING_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '自定义']
const UNIT_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '自定义']

Page({
  data: {
    loading: true,
    mine: null,            // 已提交记录
    statusText: '',
    editing: false,        // 是否处于填写状态
    communityName: '',
    lianmingMatter: '要求成立首次业主大会会议筹备组',
    form: { name: '', building: '', unit: '', room: '', phone: '', area: '', certNo: '' },
    buildingOptions: BUILDING_OPTIONS,
    unitOptions: UNIT_OPTIONS,
    buildingIndex: -1,
    unitIndex: -1,
    buildingCustom: '',
    unitCustom: '',
    showBuildingCustom: false,
    showUnitCustom: false,
    certPhoto: '',         // 产权证明 本地临时路径（预览）
    certPhotoFileId: '',   // 产权证明 云存储 fileID
    idPhoto: '',           // 身份证 本地临时路径（预览）
    idPhotoFileId: '',     // 身份证 云存储 fileID
    submitting: false
  },

  onShow () { this.load() },

  load () {
    Promise.all([ app.api('getMySignature'), app.api('getStats') ]).then(([res, s]) => {
      app.globalData.openid = res.openid
      app.globalData.isAdmin = res.isAdmin
      const mine = res.mine
      this.setData({
        loading: false,
        mine,
        statusText: this.statusLabel(mine),
        editing: !mine, // 没有记录则直接进入填写
        communityName: s.community.communityName,
        lianmingMatter: s.community.lianmingMatter || '要求成立首次业主大会会议筹备组'
      })
    }).catch(e => {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    })
  },

  statusLabel (mine) {
    if (!mine) return ''
    return { pending: '待发起人审核', approved: '已通过，计入联名', rejected: '已驳回' }[mine.status] || ''
  },

  onInput (e) {
    const k = e.currentTarget.dataset.k
    this.setData({ [`form.${k}`]: e.detail.value })
  },

  onBuildingPick (e) {
    const i = Number(e.detail.value)
    const v = BUILDING_OPTIONS[i]
    if (v === '自定义') {
      this.setData({ buildingIndex: i, showBuildingCustom: true, 'form.building': this.data.buildingCustom || '' })
    } else {
      this.setData({ buildingIndex: i, showBuildingCustom: false, buildingCustom: '', 'form.building': v })
    }
  },

  onUnitPick (e) {
    const i = Number(e.detail.value)
    const v = UNIT_OPTIONS[i]
    if (v === '自定义') {
      this.setData({ unitIndex: i, showUnitCustom: true, 'form.unit': this.data.unitCustom || '' })
    } else {
      this.setData({ unitIndex: i, showUnitCustom: false, unitCustom: '', 'form.unit': v })
    }
  },

  onBuildingCustom (e) {
    const v = e.detail.value
    this.setData({ buildingCustom: v, 'form.building': v })
  },

  onUnitCustom (e) {
    const v = e.detail.value
    this.setData({ unitCustom: v, 'form.unit': v })
  },

  // 由已有记录回填下拉/自定义状态
  syncAddrPickers (building, unit) {
    const bi = BUILDING_OPTIONS.indexOf(building)
    if (building && bi < 0) {
      const ci = BUILDING_OPTIONS.indexOf('自定义')
      this.setData({ buildingIndex: ci, showBuildingCustom: true, buildingCustom: building })
    } else {
      this.setData({ buildingIndex: bi, showBuildingCustom: false, buildingCustom: '' })
    }
    const ui = UNIT_OPTIONS.indexOf(unit)
    if (unit && ui < 0) {
      const ci = UNIT_OPTIONS.indexOf('自定义')
      this.setData({ unitIndex: ci, showUnitCustom: true, unitCustom: unit })
    } else {
      this.setData({ unitIndex: ui, showUnitCustom: false, unitCustom: '' })
    }
  },

  // 选择并上传房产证（产权证明）照片
  chooseCert () {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'],
      success: r => {
        const path = r.tempFiles[0].tempFilePath
        this.setData({ certPhoto: path })
        this.uploadFile(path, 'cert').then(fileId => {
          this.setData({ certPhotoFileId: fileId })
        }).catch(() => wx.showToast({ title: '照片上传失败', icon: 'none' }))
      }
    })
  },

  // 选择并上传身份证照片
  chooseId () {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sizeType: ['compressed'],
      success: r => {
        const path = r.tempFiles[0].tempFilePath
        this.setData({ idPhoto: path })
        this.uploadFile(path, 'id').then(fileId => {
          this.setData({ idPhotoFileId: fileId })
        }).catch(() => wx.showToast({ title: '照片上传失败', icon: 'none' }))
      }
    })
  },

  uploadFile (filePath, prefix) {
    const name = `${prefix}/${app.globalData.openid || 'u'}_${Date.now()}.png`
    return wx.cloud.uploadFile({ cloudPath: name, filePath }).then(r => r.fileID)
  },

  startEdit () {
    // 重新填写：把已有记录回填
    const m = this.data.mine
    if (m) {
      this.setData({
        editing: true,
        form: {
          name: m.name, building: m.building, unit: m.unit, room: m.room,
          phone: m.phone, area: String(m.area), certNo: m.certNo || ''
        },
        certPhotoFileId: m.certPhotoFileId || '',
        certPhoto: '',
        idPhotoFileId: m.idPhotoFileId || '',
        idPhoto: ''
      })
      this.syncAddrPickers(m.building || '', m.unit || '')
    } else {
      this.setData({ editing: true })
    }
  },

  async submit () {
    const f = this.data.form
    if (!f.name.trim()) return this.toast('请填写业主姓名')
    if (!f.building.trim()) return this.toast('请选择楼栋（或填写自定义栋号）')
    if (!f.room.trim()) return this.toast('请填写房号')
    if (!/^1\d{10}$/.test(f.phone.trim())) return this.toast('请填写正确的手机号')
    if (!(Number(f.area) > 0)) return this.toast('请填写专有部分建筑面积')
    if (!f.certNo.trim()) return this.toast('请填写不动产权证号 / 房产证号')
    if (!this.data.certPhotoFileId) return this.toast('请上传产权证明照片')
    if (!this.data.idPhotoFileId) return this.toast('请上传身份证照片')

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      // 导出签名图并上传
      const sigPad = this.selectComponent('#sigpad')
      let sigTemp
      try {
        sigTemp = await sigPad.export()
      } catch (e) {
        wx.hideLoading()
        this.setData({ submitting: false })
        return this.toast('请先手写签名')
      }
      const signatureFileId = await this.uploadFile(sigTemp, 'sign')

      await app.api('submitSignature', {
        name: f.name, building: f.building, unit: f.unit, room: f.room,
        phone: f.phone, area: Number(f.area), certNo: f.certNo,
        certPhotoFileId: this.data.certPhotoFileId,
        idPhotoFileId: this.data.idPhotoFileId,
        signatureFileId
      })

      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showToast({ title: '已提交，待审核', icon: 'success' })
      this.setData({ editing: false })
      this.load()
    } catch (e) {
      wx.hideLoading()
      this.setData({ submitting: false })
      this.toast(e.message || '提交失败')
    }
  },

  withdraw () {
    wx.showModal({
      title: '撤回联名', content: '撤回后该房号将不计入联名，可重新提交。确定撤回？',
      success: r => {
        if (!r.confirm) return
        app.api('withdrawMine').then(() => {
          wx.showToast({ title: '已撤回', icon: 'none' })
          this.setData({
            mine: null, editing: true,
            form: { name: '', building: '', unit: '', room: '', phone: '', area: '', certNo: '' },
            buildingIndex: -1, unitIndex: -1, buildingCustom: '', unitCustom: '',
            showBuildingCustom: false, showUnitCustom: false,
            certPhotoFileId: '', certPhoto: '', idPhotoFileId: '', idPhoto: ''
          })
        }).catch(e => this.toast(e.message))
      }
    })
  },

  toast (t) { wx.showToast({ title: t, icon: 'none' }) }
})
