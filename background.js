// Vidu 批量提交助手 - 后台队列与消息编排
// - 负责接收选项页的批量任务与设置
// - 管理并发与分批延迟；驱动内容脚本在 vidu.cn 页面执行
// - 提供图片保存与跨域 dataURL 获取（供拖拽上传尝试）

let running = false
let stopFlag = false
let tasksInMemory = null // 仅在一次批量运行期间保存（避免在 storage 中存大文件）

async function getSettings() {
  const { viduSettings } = await chrome.storage.local.get('viduSettings')
  const s = viduSettings || { concurrency: 100000, delayMinutes: 0 }
  const c = Number(s.concurrency)
  const d = Number(s.delayMinutes)
  return {
    concurrency: Number.isFinite(c) && c > 0 ? c : 100000,
    delayMinutes: Number.isFinite(d) && d >= 0 ? d : 0,
  }
}

async function getTasks() {
  const { viduTasks } = await chrome.storage.local.get('viduTasks')
  return Array.isArray(viduTasks) ? viduTasks.slice() : []
}

function delay(ms) { return new Promise(res => setTimeout(res, ms)) }

async function ensureViduTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.vidu.cn/*' })
  if (tabs.length) return tabs[0]
  return await chrome.tabs.create({ url: 'https://www.vidu.cn/create/img2video' })
}

// 等待内容脚本就绪：向页面发送一次 ping，直到收到响应或超时
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
    return true
  } catch (e) {
    console.warn('强制注入内容脚本失败', e)
    return false
  }
}

async function waitForTabReady(tabId, timeoutMs = 15000) {
  const start = Date.now()
  let injected = false
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'vidu_ping' })
      if (res && res.ok) return true
    } catch (e) {
      // 忽略发送失败错误，继续等待或尝试注入
    }
    if (!injected && Date.now() - start > 1500) {
      injected = await injectContentScript(tabId)
    }
    await delay(500)
  }
  return false
}

async function runBatch(tasksOverride) {
  if (running) return
  running = true
  stopFlag = false
  const { concurrency, delayMinutes } = await getSettings()
  let tasks = Array.isArray(tasksOverride) ? tasksOverride.slice() : (await getTasks())
  let batchCount = 0
  while (tasks.length && !stopFlag) {
    const tab = await ensureViduTab()
    let ready = await waitForTabReady(tab.id)
    if (!ready) {
      console.warn('等待内容脚本就绪超时，尝试强制注入后重试')
      await injectContentScript(tab.id)
      ready = await waitForTabReady(tab.id, 8000)
      if (!ready) {
        console.warn('内容脚本仍未就绪，跳过当前批次的发送')
      }
    }
    const currentBatch = tasks.splice(0, Math.max(1, concurrency))
    // 在同一标签页内顺序执行当前批任务，避免相互覆盖
    for (const task of currentBatch) {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'vidu_apply_task', task })
        if (!res?.ok && res?.error === 'no_image_selected') {
          // 等待用户完成首帧选择后再尝试一次
          await delay(2000)
          const retry = await chrome.tabs.sendMessage(tab.id, { type: 'vidu_apply_task', task })
          if (!retry?.ok) console.warn('任务提交失败', retry)
        }
      } catch (e) {
        console.warn('内容脚本未就绪或发送失败，稍后重试', e)
      }
      // 每个任务之间稍作间隔，防止页面快速连击
      await delay(1500)
    }
    batchCount++
    if (tasks.length && !stopFlag) {
      const waitMs = Math.max(0, delayMinutes) * 60_000
      await delay(waitMs)
    }
  }
  running = false
}

chrome.runtime.onInstalled.addListener(() => {})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === 'open_options_page') {
        try {
          await chrome.runtime.openOptionsPage()
          sendResponse({ ok: true })
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || String(e) })
        }
        return
      }
      if (message?.type === 'start_batch_run') {
        stopFlag = false
        await chrome.storage.local.set({ viduRunStop: false })
        // 读取设置，若启用本地自动化服务则走服务模式
        const { viduSettings } = await chrome.storage.local.get('viduSettings')
        const useService = !!(viduSettings && viduSettings.useService)
        const serviceUrl = (viduSettings && viduSettings.serviceUrl) || 'http://127.0.0.1:5050'
        const storageStatePath = viduSettings && viduSettings.storageStatePath
        // 若 options 侧提供了任务（包含图片 dataURL），优先使用该内存任务
        tasksInMemory = Array.isArray(message.tasks) ? message.tasks : null
        if (useService) {
          runBatchViaService(serviceUrl, storageStatePath)
        } else {
          runBatch(tasksInMemory || undefined)
        }
        sendResponse({ ok: true })
        return
      }
      if (message?.type === 'stop_batch_run') {
        stopFlag = true
        await chrome.storage.local.set({ viduRunStop: true })
        sendResponse({ ok: true })
        return
      }
      if (message?.type === 'save_image' && typeof message.url === 'string') {
        const suggestedFilename = message.filename || `Vidu/${Date.now()}_image.jpg`
        chrome.downloads.download({ url: message.url, filename: suggestedFilename }, (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message })
          } else {
            sendResponse({ ok: true, id: downloadId })
          }
        })
        return
      }
      if (message?.type === 'get_image_dataurl' && typeof message.url === 'string') {
        const resp = await fetch(message.url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const blob = await resp.blob()
        const reader = new FileReader()
        reader.onloadend = () => sendResponse({ ok: true, dataUrl: reader.result })
        reader.onerror = () => sendResponse({ ok: false, error: 'FileReader error' })
        reader.readAsDataURL(blob)
        return
      }
      sendResponse({ ok: false, error: 'Unknown message type' })
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) })
    }
  })()
  return true
})

// 通过本地存储的 viduRunStop 状态来同步停止标记，确保选项页的“停止”按钮立即生效
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.viduRunStop) {
    stopFlag = !!changes.viduRunStop.newValue
  }
})

// 通过本地自动化服务执行任务：将 prompt + imagePath POST 到 Node/Playwright 服务
const SERVICE_URL_DEFAULT = 'http://127.0.0.1:5050'

async function runTaskViaService(task, serviceUrl, storageStatePath) {
  try {
    const url = (serviceUrl || SERVICE_URL_DEFAULT).replace(/\/$/, '') + '/run-task'
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: task.prompt, imagePath: task.imagePath, storageStatePath }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || !data?.ok) {
      return { ok: false, error: data?.error || `HTTP ${resp.status}` }
    }
    return { ok: true, info: data.info }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

async function runBatchViaService(serviceUrl, storageStatePath) {
  if (running) return
  running = true
  stopFlag = false
  const { concurrency, delayMinutes } = await getSettings()
  let tasks = await getTasks()
  let batchCount = 0
  while (tasks.length && !stopFlag) {
    const currentBatch = tasks.splice(0, Math.max(1, concurrency))
    for (const task of currentBatch) {
      const res = await runTaskViaService(task, serviceUrl, storageStatePath)
      if (!res?.ok) console.warn('服务执行失败', res)
      await delay(1500)
      if (stopFlag) break
    }
    batchCount++
    if (tasks.length && !stopFlag) {
      const waitMs = Math.max(0, delayMinutes) * 60_000
      await delay(waitMs)
    }
  }
  running = false
}