;(function(){
  const picker = document.getElementById('folderPicker')
  const projectList = document.getElementById('projectList')
  const saveBtn = document.getElementById('saveBtn')
  const clearBtn = document.getElementById('clearBtn')
  const startBtn = document.getElementById('startBatch')
  const stopBtn = document.getElementById('stopBatch')
  const concurrencyEl = document.getElementById('concurrency')
  const batchDelayEl = document.getElementById('batchDelay')
  const ratio916Btn = document.getElementById('ratio916')
  const ratio169Btn = document.getElementById('ratio169')
  const promptInput = document.getElementById('promptInput')
  const createProjectFromPromptsBtn = document.getElementById('createProjectFromPrompts')
  const imagePoolEl = document.getElementById('imagePool')
  const imagePoolPicker = document.getElementById('imagePoolPicker')
  const imagePoolList = document.getElementById('imagePoolList')

  let projects = [] // [{ name, shots: [{index, imageFile, prompt}] }]
  let isRunning = false
  let objectUrls = []
  let previewRatio = localStorage.getItem('viduPreviewRatio') || '9:16'
  let imagePool = [] // [{ file, url, name }]
  let poolUrls = []
  const hasChromeStorage = typeof chrome !== 'undefined' && chrome?.storage?.local

  function applyPreviewRatio() {
    const cssRatio = previewRatio === '16:9' ? '16 / 9' : '9 / 16'
    document.documentElement.style.setProperty('--preview-ratio', cssRatio)
    if (ratio916Btn && ratio169Btn) {
      ratio916Btn.classList.toggle('primary', previewRatio === '9:16')
      ratio169Btn.classList.toggle('primary', previewRatio === '16:9')
    }
  }
  applyPreviewRatio()

  function groupByFolder(files) {
    const byDir = new Map()
    for (const f of files) {
      const path = f.webkitRelativePath || f.name
      const parts = path.split('/')
      const dir = parts.slice(0, parts.length - 1).join('/') || 'root'
      const arr = byDir.get(dir) || []
      arr.push(f)
      byDir.set(dir, arr)
    }
    return byDir
  }

  async function parseFolder(files) {
    // Find prompt .txt (first .txt in folder) and images
    const txt = files.find(f => /\.txt$/i.test(f.name))
    let prompts = []
    if (txt) {
      const text = await txt.text()
      prompts = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    }
    const images = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f.name))
    // Determine shot index from filename (e.g., 1, 2, shot_1, shot_2)
    const shots = images.map(img => {
      const m = img.name.match(/(?:shot[_\-\s]?)(\d+)|(\b\d+\b)/i)
      const idx = m ? Number(m[1] || m[2]) : NaN
      const prompt = Number.isFinite(idx) && prompts[idx - 1] ? prompts[idx - 1] : ''
      return { index: Number.isFinite(idx) ? idx : null, imageFile: img, prompt }
    }).sort((a,b) => (a.index||99999) - (b.index||99999))
    return { shots, prompts }
  }

  function renderImagePool() {
    imagePoolList.innerHTML = ''
    poolUrls.forEach(u => URL.revokeObjectURL(u))
    poolUrls = []
    imagePool.forEach((it, idx) => {
      const item = document.createElement('div')
      item.className = 'shot'
      item.setAttribute('draggable', 'true')
      const url = it.url || (it.file ? URL.createObjectURL(it.file) : '')
      if (url) poolUrls.push(url)
      item.innerHTML = `
        <div class="row" style="justify-content:space-between"><div>${it.name || it.file?.name || '未命名'}</div><button class="remove-pool-item" data-idx="${idx}">删除</button></div>
        <div class="preview">${url ? `<img src="${url}" alt="${it.name || ''}" />` : `<div class="muted">无图片可预览</div>`}</div>
      `
      // 拖拽从池到分镜
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/pool-index', String(idx))
      })
      imagePoolList.appendChild(item)
    })
  }

  function renderProjects() {
    projectList.innerHTML = ''
    // 清理旧的 ObjectURL 防止内存泄漏
    objectUrls.forEach(url => URL.revokeObjectURL(url))
    objectUrls = []
    projects.forEach((p, i) => {
      const div = document.createElement('div')
      div.className = 'project'
      div.innerHTML = `<div class="row"><strong>${p.name}</strong><span class="badge">${p.shots.length} shots</span><button class="add-shot" data-pi="${i}">新增分镜</button><button class="fill-project" data-pi="${i}">快速填充</button><button class="remove-project" data-pi="${i}">移除项目</button></div>`
      const shots = document.createElement('div')
      shots.className = 'shots'
      p.shots.forEach((s, j) => {
        const item = document.createElement('div')
        item.className = 'shot'
        item.setAttribute('data-pi', String(i))
        item.setAttribute('data-si', String(j))
        item.setAttribute('draggable', 'true')
        const safeName = s.imageFile?.name || '未命名'
        const url = s.imageFile ? URL.createObjectURL(s.imageFile) : ''
        if (url) objectUrls.push(url)
        item.innerHTML = `
          <div class="row" style="justify-content:space-between"><div><strong>#${s.index ?? '?'}:</strong> ${safeName}</div><button class="remove-shot" data-pi="${i}" data-si="${j}">移除分镜</button></div>
          <div class="preview">${url ? `<img src="${url}" alt="${safeName}" />` : `<div class="muted">无图片可预览</div>`}</div>
          <textarea data-pi="${i}" data-si="${j}" placeholder="该分镜的提示词">${s.prompt || ''}</textarea>
        `
        shots.appendChild(item)
      })
      div.appendChild(shots)
      projectList.appendChild(div)
    })
  }

  picker.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || [])
    const grouped = groupByFolder(files)
    const nextProjects = []
    for (const [dir, arr] of grouped.entries()) {
      const { shots } = await parseFolder(arr)
      // 为每个选择的文件夹生成稳定 id（使用相对目录路径）
      nextProjects.push({ id: dir, name: dir.split('/').pop() || dir, shots })
    }
    // 合并到现有项目，支持多次选择与多文件夹一次选择
    const byId = new Map(projects.map(p => [p.id || p.name, p]))
    for (const np of nextProjects) {
      const key = np.id || np.name
      byId.set(key, np) // 若同 id/name 已存在则覆盖为最新选择
    }
    projects = Array.from(byId.values())
    renderProjects()
  })

  projectList.addEventListener('input', (e) => {
    const t = e.target
    if (t.tagName === 'TEXTAREA') {
      const pi = Number(t.getAttribute('data-pi'))
      const si = Number(t.getAttribute('data-si'))
      if (Number.isFinite(pi) && Number.isFinite(si)) {
        projects[pi].shots[si].prompt = t.value
      }
    }
  })

  // 事件委托：项目与分镜移除
  projectList.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn) return
    if (btn.classList.contains('remove-project')) {
      const pi = Number(btn.getAttribute('data-pi'))
      if (Number.isFinite(pi)) {
        projects.splice(pi, 1)
        renderProjects()
      }
    } else if (btn.classList.contains('add-shot')) {
      const pi = Number(btn.getAttribute('data-pi'))
      if (!Number.isFinite(pi)) return
      const p = projects[pi]
      if (!p) return
      const indices = (p.shots || []).map(s => s.index).filter(n => Number.isFinite(n))
      const nextIndex = indices.length ? Math.max(...indices) + 1 : 1
      const newShot = { index: nextIndex, imageFile: null, prompt: '' }
      p.shots = Array.isArray(p.shots) ? p.shots.concat(newShot) : [newShot]
      renderProjects()
    } else if (btn.classList.contains('fill-project')) {
      const pi = Number(btn.getAttribute('data-pi'))
      if (!Number.isFinite(pi)) return
      const p = projects[pi]
      if (!p) return
      // 若没有分镜，按图片池创建分镜；否则填充未设置图片的分镜
      function inferIndexFromName(name) {
        const m = name?.match(/(?:shot[_\-\s]?)(\d+)|(\b\d+\b)/i)
        return m ? Number(m[1] || m[2]) : null
      }
      if (!Array.isArray(p.shots) || p.shots.length === 0) {
        p.shots = imagePool.map((it, idx) => {
          const inferred = inferIndexFromName(it.file?.name || it.name || '')
          const index = inferred ?? (idx + 1)
          return { index, imageFile: it.file, prompt: '' }
        })
      } else {
        for (let si = 0, pi2 = 0; si < p.shots.length && pi2 < imagePool.length; si++) {
          if (!p.shots[si].imageFile) {
            p.shots[si].imageFile = imagePool[pi2].file
            pi2++
          }
        }
      }
      // 根据 index 排序
      p.shots.sort((a,b) => (a.index||99999) - (b.index||99999))
      renderProjects()
    } else if (btn.classList.contains('remove-shot')) {
      const pi = Number(btn.getAttribute('data-pi'))
      const si = Number(btn.getAttribute('data-si'))
      if (Number.isFinite(pi) && Number.isFinite(si)) {
        const p = projects[pi]
        if (p && Array.isArray(p.shots)) {
          p.shots.splice(si, 1)
          renderProjects()
        }
      }
    }
  })

  // 分镜区域拖拽：接收图片池项或桌面文件，并支持分镜排序
  projectList.addEventListener('dragover', (e) => {
    const shotEl = e.target.closest('.shot')
    if (shotEl) e.preventDefault()
  })
  projectList.addEventListener('drop', (e) => {
    const shotEl = e.target.closest('.shot')
    if (!shotEl) return
    e.preventDefault()
    const pi = Number(shotEl.getAttribute('data-pi'))
    const si = Number(shotEl.getAttribute('data-si'))
    const p = projects[pi]
    if (!p || !Number.isFinite(si)) return
    // 1) 从图片池拖拽
    const poolIdxStr = e.dataTransfer?.getData('text/pool-index')
    if (poolIdxStr !== undefined && poolIdxStr !== '') {
      const poolIdx = Number(poolIdxStr)
      if (Number.isFinite(poolIdx) && imagePool[poolIdx]?.file) {
        p.shots[si].imageFile = imagePool[poolIdx].file
        renderProjects()
        return
      }
    }
    // 2) 桌面文件直接拖入
    const files = Array.from(e.dataTransfer?.files || [])
    const img = files.find(f => /\.(png|jpg|jpeg|webp)$/i.test(f.name))
    if (img) {
      p.shots[si].imageFile = img
      renderProjects()
      return
    }
    // 3) 分镜排序：从另一个分镜拖拽到此
    const shotSrc = e.dataTransfer?.getData('text/shot-source')
    if (shotSrc) {
      const [spiStr, ssiStr] = shotSrc.split(':')
      const spi = Number(spiStr), ssi = Number(ssiStr)
      if (Number.isFinite(spi) && Number.isFinite(ssi) && spi === pi) {
        const arr = p.shots
        const [moved] = arr.splice(ssi, 1)
        arr.splice(si, 0, moved)
        renderProjects()
      }
    }
  })
  // 设置分镜的 dragstart 委托（写入来源索引）
  projectList.addEventListener('dragstart', (e) => {
    const shotEl = e.target.closest('.shot')
    if (!shotEl) return
    const pi = shotEl.getAttribute('data-pi')
    const si = shotEl.getAttribute('data-si')
    if (pi != null && si != null) {
      e.dataTransfer?.setData('text/shot-source', `${pi}:${si}`)
    }
  })

  clearBtn.addEventListener('click', () => {
    projects = []
    renderProjects()
    picker.value = ''
  })

  saveBtn.addEventListener('click', async () => {
    if (hasChromeStorage) {
      await chrome.storage.local.set({ viduProjects: projects })
      alert('已保存项目到本地')
    } else {
      alert('当前预览环境不支持存储（需在插件选项页中运行）')
    }
  })

  async function loadSaved() {
    if (!hasChromeStorage) return
    const { viduProjects } = await chrome.storage.local.get('viduProjects')
    if (Array.isArray(viduProjects)) {
      projects = viduProjects
      renderProjects()
    }
  }
  loadSaved()

  // 新建项目：按行提示词生成分镜
  createProjectFromPromptsBtn?.addEventListener('click', () => {
    const raw = (promptInput?.value || '')
    const prompts = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    if (!prompts.length) {
      alert('请输入至少一条提示词（每行一条）')
      return
    }
    const shots = prompts.map((p, i) => ({ index: i + 1, imageFile: null, prompt: p }))
    const id = `project-${Date.now()}`
    const name = `新建项目 ${projects.length + 1}`
    projects.push({ id, name, shots })
    renderProjects()
    promptInput.value = ''
  })

  // 图片池：批量选择
  imagePoolPicker?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || [])
    const imgs = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f.name))
    imagePool.push(...imgs.map(f => ({ file: f, name: f.name })))
    renderImagePool()
    imagePoolPicker.value = ''
  })
  // 图片池：拖拽添加
  imagePoolEl?.addEventListener('dragover', (e) => {
    e.preventDefault()
  })
  imagePoolEl?.addEventListener('drop', (e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || [])
    const imgs = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f.name))
    if (imgs.length) {
      imagePool.push(...imgs.map(f => ({ file: f, name: f.name })))
      renderImagePool()
    }
  })
  // 图片池：删除项
  imagePoolEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('button.remove-pool-item')
    if (!btn) return
    const idx = Number(btn.getAttribute('data-idx'))
    if (Number.isFinite(idx)) {
      const it = imagePool[idx]
      if (it?.url) URL.revokeObjectURL(it.url)
      imagePool.splice(idx, 1)
      renderImagePool()
    }
  })

  ratio916Btn?.addEventListener('click', () => {
    previewRatio = '9:16'
    localStorage.setItem('viduPreviewRatio', previewRatio)
    applyPreviewRatio()
  })
  ratio169Btn?.addEventListener('click', () => {
    previewRatio = '16:9'
    localStorage.setItem('viduPreviewRatio', previewRatio)
    applyPreviewRatio()
  })

  // --- Batch runner orchestrates via background + content ---
  stopBtn.addEventListener('click', async () => {
    isRunning = false
    await chrome.storage.local.set({ viduRunStop: true })
    // 显式通知后台停止批量运行
    chrome.runtime.sendMessage({ type: 'stop_batch_run' })
  })

  startBtn.addEventListener('click', async () => {
    if (!projects.length) {
      alert('请先选择至少一个项目文件夹')
      return
    }
    // 将选中的本地图片读为 dataURL，以便内容脚本在页面内重建 File 并使用 DataTransfer 赋值到 <input type="file">
    async function readFileAsDataURL(file) {
      return new Promise((resolve, reject) => {
        try {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(reader.error || new Error('readAsDataURL error'))
          reader.readAsDataURL(file)
        } catch (e) {
          reject(e)
        }
      })
    }

    const tasks = []
    for (const p of projects) {
      for (const s of p.shots) {
        if (!s.prompt || !s.imageFile) continue
        const imageDataUrl = await readFileAsDataURL(s.imageFile).catch(() => '')
        if (!imageDataUrl) continue
        tasks.push({
          project: p.name,
          index: s.index,
          prompt: s.prompt,
          imageName: s.imageFile.name,
          imageDataUrl
        })
      }
    }
    if (!tasks.length) {
      alert('未找到有效的分镜与提示词')
      return
    }

    // 计算并发与批次间隔：默认连续提交（并发=任务数，间隔=0）
    const concurrencyInput = Number(concurrencyEl.value)
    const delayInput = Number(batchDelayEl.value)
    const concurrency = Number.isFinite(concurrencyInput) && concurrencyInput > 0 ? concurrencyInput : tasks.length
    const delayMinutes = Number.isFinite(delayInput) && delayInput >= 0 ? delayInput : 0

    isRunning = true
    // 不将大体积的图片数据存入 local storage，避免配额与性能问题；仅保存运行设置
    await chrome.storage.local.set({ viduRunStop: false, viduSettings: { concurrency, delayMinutes } })
    // Open a tab to vidu
    const tab = await chrome.tabs.create({ url: 'https://www.vidu.cn/create/img2video' })
    // Let background orchestrate queue per settings
    chrome.runtime.sendMessage({ type: 'start_batch_run', tasks })
    alert(`已开始批量提交，共 ${tasks.length} 个分镜，当前并发 ${concurrency}。请在页面中选择图片文件，插件会自动填写提示词与点击“创作”。`)
  })
})()