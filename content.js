// Vidu 批量提交助手 - 内容脚本 (MV3)
// 职责：
// - 接收后台/选项页发送的任务消息 `vidu_apply_task`
// - 在 https://www.vidu.cn 页面定位输入框并填充提示词
// - 尝试点击“创作”按钮以提交
// 注意：Chrome 内容脚本无法直接访问本地文件进行上传，图片上传需由站点自身交互或后续增强实现。

(() => {
  function log(...args) { console.log('[ViduBatch]', ...args) }

  async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

  async function waitForSelector(selector, timeout = 8000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector)
      if (el) return el
      await sleep(200)
    }
    return null
  }

  // 在页面右上角显示当前分镜信息，提示用户选择对应图片
  function showTaskOverlay(task) {
    try {
      // 若顶部悬浮菜单存在，则将任务信息融合到菜单中，而不再单独弹出覆盖层
      const taskInMenu = document.getElementById('vidu-floating-task')
      if (taskInMenu) {
        const proj = task?.project ? `项目：${task.project}` : ''
        const index = Number.isFinite(task?.index) ? `分镜：#${task.index}` : ''
        const img = task?.imageName ? `图片：${task.imageName}` : ''
        const parts = [proj, index, img].filter(Boolean)
        taskInMenu.textContent = parts.length
          ? `当前任务 ${parts.join(' ｜ ')} — 请选择对应图片`
          : '请选择对应图片'
        // 如存在旧的右上角覆盖层，移除以避免重复展示
        const oldBox = document.getElementById('vidu-batch-overlay')
        if (oldBox && oldBox.parentNode) oldBox.parentNode.removeChild(oldBox)
        return
      }
      let box = document.getElementById('vidu-batch-overlay')
      if (!box) {
        box = document.createElement('div')
        box.id = 'vidu-batch-overlay'
        box.style.cssText = [
          'position:fixed',
          'top:12px',
          'right:12px',
          'z-index:999999',
          'background:rgba(0,0,0,0.7)',
          'color:#fff',
          'padding:8px 10px',
          'border-radius:8px',
          'font-size:12px',
          'max-width:320px',
          'line-height:1.4',
          'box-shadow:0 2px 8px rgba(0,0,0,.35)'
        ].join(';')
        document.body.appendChild(box)
        // 绑定一次事件：用户点击按钮后，在同一用户手势内触发文件选择器
        box.addEventListener('click', (e) => {
          const btn = e.target && e.target.closest && e.target.closest('#vidu-batch-open-picker')
          if (btn) {
            openFirstFramePicker()
          }
        })
      }
      const proj = task?.project ? `项目：${task.project}` : ''
      const index = Number.isFinite(task?.index) ? `分镜：#${task.index}` : ''
      const img = task?.imageName ? `图片：${task.imageName}` : ''
      const parts = [proj, index, img].filter(Boolean)
      box.innerHTML = `
        <div>当前任务 ${parts.join(' ｜ ')} — 请选择对应图片</div>
        <div style="margin-top:6px; text-align:right">
          <button id="vidu-batch-open-picker" style="padding:4px 8px; border:1px solid #1677ff; border-radius:6px; background:#1677ff; color:#fff; cursor:pointer">打开首帧文件选择器</button>
        </div>
      `
    } catch (e) {
      // no-op
    }
  }

  // 在“用户点击”同一次事件处理中触发文件选择器
  function openFirstFramePicker() {
    try {
      const input = document.querySelector('input[type="file"][accept*="image"]')
        || document.querySelector('input[type="file"]')
      if (input && typeof input.click === 'function') {
        // 注意：这里只是打开系统文件选择对话框，无法预选具体文件
        input.click()
      }
    } catch (e) {
      // no-op
    }
  }

  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element.__proto__, 'value')?.set
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype
                   : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
                   : null
    const prototypeValueSetter = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value')?.set : null
    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value)
    } else if (valueSetter) {
      valueSetter.call(element, value)
    } else {
      element.value = value
    }
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function hasSelectedImage() {
    try {
      const inputs = Array.from(document.querySelectorAll('input[type="file"]'))
      return inputs.some(i => i.files && i.files.length > 0)
    } catch { return false }
  }

  async function highlightFirstFrame() {
    const containers = Array.from(document.querySelectorAll('*'))
    const target = containers.find(el => /首帧|第一帧|封面|First/i.test(el.textContent || ''))
    if (target) {
      const prevOutline = target.style.outline
      target.style.outline = '2px solid #1677ff'
      await sleep(1200)
      target.style.outline = prevOutline || ''
    }
  }

  async function fillPrompt(text) {
    if (!text) return false
    // 优先查找常见输入区域
    const candidates = [
      'textarea',
      'input[type="text"]',
      '[contenteditable="true"]',
      '[role="textbox"]',
      '[data-testid*="input"]'
    ]
    let target = null
    for (const sel of candidates) {
      target = document.querySelector(sel)
      if (target) break
    }
    // 如未找到，尝试在明显的输入容器内搜索
    if (!target) {
      const containers = document.querySelectorAll('.editor, .input, .composer, .chat-input, .prompt')
      for (const c of containers) {
        target = c.querySelector('textarea, input[type="text"], [contenteditable="true"], [role="textbox"]')
        if (target) break
      }
    }
    if (!target) return false

    if (target.getAttribute('contenteditable') === 'true') {
      target.focus()
      // 尝试直接设置文本内容
      target.textContent = text
      target.dispatchEvent(new InputEvent('input', { bubbles: true }))
      target.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }

    setNativeValue(target, text)
    target.focus()
    return true
  }

  function isVisible(el) {
    if (!el) return false
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
  }

  function hasDisabled(el) {
    const aria = el.getAttribute('aria-disabled')
    const state = el.getAttribute('data-state')
    // 仅依据真实属性判断；同时识别站点使用的 data-state="closed" 作为禁用态
    return !!el.disabled || aria === 'true' || el.hasAttribute('disabled') || state === 'closed'
  }

  function textIncludes(el, ...keywords) {
    const t = (el.textContent || '').replace(/\s+/g, '')
    return keywords.some(k => t.includes(k))
  }

  async function waitEnabled(el, timeout = 6000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (!hasDisabled(el)) return true
      await sleep(200)
    }
    return !hasDisabled(el)
  }

  function observeUntilEnabled(el, timeout = 6000) {
    return new Promise(resolve => {
      if (!el) return resolve(false)
      const start = Date.now()
      const check = () => {
        const cls = el.className || ''
        const state = el.getAttribute('data-state')
        const enabledAppearance = /bg-ShengshuButton|hover:bg-ShengshuButtonHover/i.test(cls) || state === 'open' || (!state && /bg-ShengshuButton/i.test(cls))
        if (!hasDisabled(el) && enabledAppearance) return resolve(true)
        if (Date.now() - start > timeout) return resolve(false)
      }
      const mo = new MutationObserver(() => check())
      mo.observe(el, { attributes: true, attributeFilter: ['class','data-state'] })
      const timer = setInterval(() => {
        check()
        if (Date.now() - start > timeout) { clearInterval(timer); mo.disconnect() }
      }, 200)
    })
  }

  function clickLikeHuman(el) {
    if (!el) return false
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const rect = el.getBoundingClientRect()
      const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }
      el.dispatchEvent(new PointerEvent('pointerdown', opts))
      el.dispatchEvent(new MouseEvent('mousedown', opts))
      el.dispatchEvent(new PointerEvent('pointerup', opts))
      el.dispatchEvent(new MouseEvent('mouseup', opts))
      el.dispatchEvent(new MouseEvent('click', opts))
      return true
    } catch { return false }
  }

  function scoreButton(el) {
    const cls = el.className || ''
    let score = 0
    if (/bg-ShengshuButton/i.test(cls)) score += 3
    if (/hover:bg-ShengshuButtonHover/i.test(cls)) score += 2
    if (/text-black/i.test(cls)) score += 1
    if (/cursor-not-allowed|text-system-white24/i.test(cls)) score -= 2
    const rect = el.getBoundingClientRect()
    score += Math.max(0, (window.innerHeight - rect.top) / 100) // 越靠近底部分值越高
    return score
  }

  async function clickCreateButton() {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      // 1) 重新抓取候选，避免按钮在启用时被替换为新元素
      const candidatesBase = [
        ...Array.from(document.querySelectorAll('button')),
        ...Array.from(document.querySelectorAll('[role="button"]'))
      ]
      const candidates = candidatesBase.filter(el => isVisible(el) && textIncludes(el, '创作', 'Create'))
      if (!candidates.length) {
        await sleep(200)
        continue
      }
      // 2) 评分选择更像启用态的按钮
      candidates.sort((a, b) => scoreButton(b) - scoreButton(a))
      const btn = candidates[0]
      // 3) 等到启用（不含 disabled 属性、data-state!==closed）且样式接近启用态
      const cls = btn.className || ''
      const enabledAppearance = /bg-ShengshuButton|hover:bg-ShengshuButtonHover/i.test(cls) || btn.getAttribute('data-state') === 'open'
      if (!hasDisabled(btn) && enabledAppearance) {
        return clickLikeHuman(btn)
      }
      // 4) 若当前为禁用态（data-state="closed" 等），监听到启用后再点击
      const enabled = await observeUntilEnabled(btn, 3000)
      if (enabled) return clickLikeHuman(btn)
      await sleep(200)
    }
    return false
  }

  async function uploadImageFromData(task) {
    try {
      const dataUrl = task?.imageDataUrl
      if (!dataUrl) return false
      const input = document.querySelector('input[type="file"][accept*="image"]')
        || document.querySelector('input[type="file"]')
      if (!input) return false
      const blob = await (await fetch(dataUrl)).blob()
      const fileName = task?.imageName || `image_${Date.now()}.jpg`
      const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
      const dt = new DataTransfer()
      dt.items.add(file)
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    } catch {
      return false
    }
  }

  async function applyTask(task) {
    try {
      log('Apply task:', task)
      showTaskOverlay(task)
      await fillPrompt(task?.prompt || '')
      // 优先尝试从任务数据自动上传图片（DataTransfer）
      const autoUploaded = await uploadImageFromData(task)
      if (!autoUploaded) {
        // 回退：等待用户选择首帧图片（最多等待 25s）
        const start = Date.now()
        while (!hasSelectedImage() && Date.now() - start < 25_000) {
          await highlightFirstFrame()
          // 尝试将首帧区域滚动到视口中，便于用户点击
          const fi = document.querySelector('input[type="file"][accept*="image"]')
          if (fi && fi.parentElement && typeof fi.parentElement.scrollIntoView === 'function') {
            fi.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
          await sleep(800)
        }
        if (!hasSelectedImage()) {
          log('未检测到首帧文件，跳过提交')
          return { ok: false, error: 'no_image_selected' }
        }
      }
      await sleep(300)
      const clicked = await clickCreateButton()
      if (!clicked) {
        log('未找到或未能点击“创作”按钮')
        return { ok: false, error: 'create_button_not_found' }
      }
      return { ok: true }
    } catch (e) {
      log('applyTask error', e)
      return { ok: false, error: e?.message || String(e) }
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (message?.type === 'vidu_ping') {
        sendResponse({ ok: true })
        return
      }
      if (message?.type === 'vidu_apply_task' && message.task) {
        const res = await applyTask(message.task)
        sendResponse(res)
        return
      }
      sendResponse({ ok: false, error: 'Unknown message' })
    })()
    return true
  })

  // 激活后立即注入顶部悬浮菜单，支持折叠与进入选项
  ensureFloatingMenu()
})()
  // 顶部悬浮菜单：可折叠，提供进入选项设置入口
  function ensureFloatingMenu() {
    try {
      if (document.getElementById('vidu-floating-menu')) return
      const bar = document.createElement('div')
      bar.id = 'vidu-floating-menu'
      bar.style.cssText = [
        'position:fixed',
        'top:0',
        'left:50%',
        'transform:translateX(-50%)',
        'z-index:999999',
        'background:rgba(2,11,19,0.85)',
        'backdrop-filter:saturate(180%) blur(6px)',
        'color:#fff',
        'padding:8px 12px',
        'border-radius:0 0 12px 12px',
        'box-shadow:0 6px 14px rgba(0,0,0,.25)',
        'display:flex',
        'align-items:center',
        'gap:10px',
        'font-size:13px',
        'max-width:860px'
      ].join(';')

      const title = document.createElement('span')
      title.textContent = 'Vidu 批量助手'
      title.style.fontWeight = '600'

      const collapseBtn = document.createElement('button')
      collapseBtn.textContent = '折叠'
      collapseBtn.style.cssText = 'padding:4px 8px; border:1px solid #4c9fff; border-radius:8px; background:#1a6fff; color:#fff; cursor:pointer'

      const optionsBtn = document.createElement('button')
      optionsBtn.textContent = '设置（选项）'
      optionsBtn.style.cssText = 'padding:4px 8px; border:1px solid #4c9fff; border-radius:8px; background:#1a6fff; color:#fff; cursor:pointer'

      const pickerBtn = document.createElement('button')
      pickerBtn.textContent = '首帧选择器'
      pickerBtn.style.cssText = 'padding:4px 8px; border:1px solid #4c9fff; border-radius:8px; background:#1a6fff; color:#fff; cursor:pointer'

      const state = localStorage.getItem('viduFloatingMenuCollapsed') === '1'
      const content = document.createElement('div')
      content.style.cssText = 'display:flex; align-items:center; gap:10px'
      content.appendChild(title)
      content.appendChild(pickerBtn)
      content.appendChild(optionsBtn)

      const taskInfo = document.createElement('span')
      taskInfo.id = 'vidu-floating-task'
      taskInfo.style.cssText = 'max-width:520px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.9'
      content.appendChild(taskInfo)

      if (state) {
        content.style.display = 'none'
        collapseBtn.textContent = '展开'
      }

      collapseBtn.addEventListener('click', () => {
        const collapsed = content.style.display === 'none'
        content.style.display = collapsed ? 'flex' : 'none'
        collapseBtn.textContent = collapsed ? '折叠' : '展开'
        localStorage.setItem('viduFloatingMenuCollapsed', collapsed ? '0' : '1')
      })

      optionsBtn.addEventListener('click', () => {
        try {
          chrome.runtime.sendMessage({ type: 'open_options_page' }, (res) => {
            if (chrome.runtime.lastError) {
              try { chrome.runtime.openOptionsPage?.() } catch {}
              return
            }
            if (!res || res.ok !== true) {
              try { chrome.runtime.openOptionsPage?.() } catch {}
            }
          })
        } catch {
          try { chrome.runtime.openOptionsPage?.() } catch {}
        }
      })

      // 在用户手势内打开系统文件选择器
      pickerBtn.addEventListener('click', () => {
        try { openFirstFramePicker() } catch {}
      })

      bar.appendChild(collapseBtn)
      bar.appendChild(content)
      document.body.appendChild(bar)
    } catch (e) {
      // no-op
    }
  }