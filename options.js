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

  let projects = [] // [{ name, shots: [{index, imageFile, prompt}] }]
  let isRunning = false
  let objectUrls = []
  let previewRatio = localStorage.getItem('viduPreviewRatio') || '9:16'

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

  function renderProjects() {
    projectList.innerHTML = ''
    // 清理旧的 ObjectURL 防止内存泄漏
    objectUrls.forEach(url => URL.revokeObjectURL(url))
    objectUrls = []
    projects.forEach((p, i) => {
      const div = document.createElement('div')
      div.className = 'project'
      div.innerHTML = `<div class="row"><strong>${p.name}</strong><span class="badge">${p.shots.length} shots</span><button class="remove-project" data-pi="${i}">移除项目</button></div>`
      const shots = document.createElement('div')
      shots.className = 'shots'
      p.shots.forEach((s, j) => {
        const item = document.createElement('div')
        item.className = 'shot'
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

  clearBtn.addEventListener('click', () => {
    projects = []
    renderProjects()
    picker.value = ''
  })

  saveBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ viduProjects: projects })
    alert('已保存项目到本地')
  })

  async function loadSaved() {
    const { viduProjects } = await chrome.storage.local.get('viduProjects')
    if (Array.isArray(viduProjects)) {
      projects = viduProjects
      renderProjects()
    }
  }
  loadSaved()

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