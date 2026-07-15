// 资格自测：依据《手册》3.3 正面清单 / 3.4 负面清单
// 仅供业主报名前自测参考，最终资格由筹备组、街道办、社区党委认定。

const NEGATIVE = [
  '在小区业主群内侮辱、攻击、谩骂他人并引发争执',
  '曾担任业委会成员但被罢免，或任期内获评一星、无星级业委会',
  '恶意参与集体上访影响社会稳定',
  '干预小区业主、街道、社区工作人员正常工作和生活',
  '曾欠缴物业管理费、专项维修资金、车位管理费及水电费等达三个月以上',
  '存在煽动其他业主拒缴物业费、维修资金、车位管理费及水电费等行为',
  '在小区内存在违法违规搭建、装修等行为被行政执法部门责令整改',
  '受到公安机关训诫、治安拘留',
  '长期未在小区内居住',
  '曾担任业委会成员被业主大会终止职务',
  '街道或社区党委认为其他不适宜担任的情形'
]

const POSITIVE = [
  '具有中共党员、党代表、人大代表、政协委员或民主党派身份',
  '在政府部门或社区居民委员会任职',
  '有经验、有能力、有精力的退休干部',
  '具有星级义工证',
  '被政府部门评选为劳动模范或先进工作者',
  '获得行业荣誉奖章',
  '热心小区公共事务、愿意服务业主'
]

Page({
  data: {
    negative: NEGATIVE,
    positive: POSITIVE,
    negChecked: [],
    posChecked: [],
    negCount: 0,
    posCount: 0,
    done: false
  },

  onLoad () {
    this.setData({
      negChecked: NEGATIVE.map(() => false),
      posChecked: POSITIVE.map(() => false)
    })
  },

  toggleNeg (e) {
    const i = e.currentTarget.dataset.i
    const arr = this.data.negChecked.slice()
    arr[i] = !arr[i]
    this.setData({ negChecked: arr, negCount: arr.filter(Boolean).length })
  },

  togglePos (e) {
    const i = e.currentTarget.dataset.i
    const arr = this.data.posChecked.slice()
    arr[i] = !arr[i]
    this.setData({ posChecked: arr, posCount: arr.filter(Boolean).length })
  },

  check () { this.setData({ done: true }) },

  reset () {
    this.setData({
      negChecked: NEGATIVE.map(() => false),
      posChecked: POSITIVE.map(() => false),
      negCount: 0, posCount: 0, done: false
    })
  }
})
