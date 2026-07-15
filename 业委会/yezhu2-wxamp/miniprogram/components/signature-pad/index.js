// 手写签名组件：触摸绘制，导出为临时图片路径，由父页面上传到云存储
Component({
  properties: {},
  data: { hasInk: false },

  lifetimes: {
    attached () { this.initCanvas() }
  },

  methods: {
    initCanvas () {
      const q = this.createSelectorQuery()
      q.select('#sig').fields({ node: true, size: true }).exec(res => {
        if (!res[0]) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio
        canvas.width = res[0].width * dpr
        canvas.height = res[0].height * dpr
        ctx.scale(dpr, dpr)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 3
        ctx.strokeStyle = '#1f2328'
        this.canvas = canvas
        this.ctx = ctx
        this.cssW = res[0].width
        this.cssH = res[0].height
      })
    },

    start (e) {
      const t = e.touches[0]
      this.last = { x: t.x, y: t.y }
      this.setData({ hasInk: true })
    },

    move (e) {
      if (!this.ctx || !this.last) return
      const t = e.touches[0]
      const ctx = this.ctx
      ctx.beginPath()
      ctx.moveTo(this.last.x, this.last.y)
      ctx.lineTo(t.x, t.y)
      ctx.stroke()
      this.last = { x: t.x, y: t.y }
    },

    end () { this.last = null },

    clear () {
      if (!this.ctx) return
      this.ctx.clearRect(0, 0, this.cssW, this.cssH)
      this.setData({ hasInk: false })
    },

    // 父页面调用：返回临时文件路径（白底）
    export () {
      return new Promise((resolve, reject) => {
        if (!this.data.hasInk) { reject(new Error('请先签名')); return }
        // 在导出前铺一层白底，避免透明 PNG 在打印件上不可见
        const ctx = this.ctx
        ctx.globalCompositeOperation = 'destination-over'
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, this.cssW, this.cssH)
        ctx.globalCompositeOperation = 'source-over'
        wx.canvasToTempFilePath({
          canvas: this.canvas,
          success: r => resolve(r.tempFilePath),
          fail: reject
        })
      })
    }
  }
})
