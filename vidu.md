# Vidu 谷歌浏览器插件（批量提交助手）

本插件用于从本地“视频项目”文件夹读取分镜图片与提示词，并在 `vidu.cn` 的图生视频页面协助批量提交。当前版本已具备以下能力：

## 功能概览
- 项目管理：
  - 支持一次或多次选择多个项目文件夹；每个文件夹为一个项目，自动解析分镜与提示词。
  - 在选项页显示每个分镜的图片预览（默认 9:16，可切换为 16:9）。
  - 支持移除项目、移除分镜，并可保存项目到浏览器本地存储。
- 批量提交：
  - 打开 `https://www.vidu.cn/create/img2video` 页面。
  - 为每个任务自动填充提示词，并在检测到已选择首帧图片后点击“创作”。
  - 任务按批次顺序执行，每个任务之间有防抖间隔；批次之间按设置的分钟延时暂停。
  - 当未检测到首帧图片时会提示并重试一次（仍需用户完成文件选择）。

## 使用步骤
1. 在 Chrome 打开 `chrome://extensions`，开启开发者模式，加载已解压的扩展程序（选择 `chrome-extension` 文件夹）。
2. 打开扩展选项页：
   - 点击“选择文件”，从本地选择一个或多个项目文件夹；支持多选与多次选择，会自动合并列表并对同目录项目去重。
   - 在“项目列表”中查看每个分镜的图片预览与提示词，可编辑提示词，必要时移除项目或分镜。
   - 如需持久化当前项目，点击“保存项目到本地”。
3. 在“批量提交”区域设置并发与批次间隔（当前版本在单标签页内顺序执行，每个任务有间隔，批次之间按分钟延时）。
4. 点击“开始批量提交”：
   - 扩展会打开/激活 `vidu.cn` 的图生视频页面。
   - 页面中请依次点击“首帧”，选择每个分镜对应的图片文件（扩展无法自动选择本地文件）。
   - 扩展将自动填充提示词并在检测到已选择图片后点击“创作”。
5. 如需中断，点击“停止”。

## 文件结构与脚本职责
- `manifest.json`：MV3 清单，声明后台、选项页与内容脚本（域限定为 `vidu.cn`）。
- `options.html` / `options.js`：
  - 选项页 UI：项目选择、图片预览（9:16/16:9）、提示词编辑、项目/分镜移除、批量提交控制。
  - 发起批量运行：构建任务并将设置与任务保存到 `chrome.storage.local`，然后通知后台开始运行。
- `background.js`：
  - 批量编排：按设置分批顺序驱动内容脚本，每个任务之间增加间隔；对未选择首帧的任务进行一次重试。
  - 辅助能力：图片下载与跨域 dataURL 读取（后续如需拖拽上传可复用）。
- `content.js`：
  - 页面自动化：接收单个任务消息，填充提示词；检测首帧文件是否已选择后点击“创作”。
  - 提示用户点击“首帧”：若未检测到文件，会高亮“首帧”区域并在超时后返回提示。

## 已知限制与后续计划
- 由于浏览器安全限制，扩展无法直接为页面的 `<input type="file">` 设置本地文件，需用户在页面中完成文件选择。
- 目前在单标签页内顺序执行任务；如需真正并发，可在后台打开多标签页并为每个标签页分配队列（后续版本可选）。
- 可增加任务状态面板、失败重试次数、选择器自定义、以及对页面更新的适配策略。

## 扩展 + 本地自动化服务（Node 版）
为实现真正的文件选择与全自动提交，现支持通过本地 Node（Express + Playwright）服务执行上传与提交，由扩展后台按队列调用该服务。

### 准备本地服务
- 进入 `node-playwright-service` 目录：
  - `npm i`
  - `npm run playwright:install`
  - `npm start`
- 默认监听 `http://127.0.0.1:5050`
- 推荐复用登录会话：确保 `f:/2025/youtube/doubao/API_Guide/doubao_video/storage_state.json` 存在（可先用 Python/Playwright 或手动登录保存）。

### 扩展权限
- 已在 `manifest.json` 增加 `host_permissions`：
  - `http://localhost/*`, `http://127.0.0.1/*`
- 如为首次加载或更新清单，请在 `chrome://extensions` 重新加载扩展。

### 启用服务模式（临时方法）
- 选项页尚未提供开关；可在扩展页面的开发者工具 Console 执行一次：
```js
chrome.storage.local.set({
  viduSettings: {
    useService: true,
    serviceUrl: 'http://127.0.0.1:5050',
    storageStatePath: 'f:/2025/youtube/doubao/API_Guide/doubao_video/storage_state.json',
    concurrency: 1,
    delayMinutes: 0
  }
})
```
- 之后点击“开始批量提交”，后台将改为调用本地服务执行上传与提交；每个任务会将 `{ prompt, imagePath }` 发送到服务端。

### 注意事项
- 若服务未启动或返回错误，后台会记录失败日志；当前版本不自动降级为页面内容脚本模式。
- 页面结构更新可能导致选择器失效；如遇上传/点击失败，请调整服务端脚本中的选择器。

## 基础功能
### 读取本地指定文件夹内的图片和Prompt文档
1. 图片：支持jpg、png、webp等格式
- 分镜判断：根据图片名判断分镜，例如 1、2、3...或者shot_1、shot_2...
2. Prompt提示词输入
- 一行一条图生视频Prompt，每个Prompt对应一个分镜图片
- 支持本地txt格式
- 支持在插件内创建和编辑Prompt提示词，但需要和"视频项目"文件夹关联
3. 支持选定多个文件夹路径，一个文件夹为一个"视频项目"

### 提交功能

1. 进入 https://www.vidu.cn/create/img2video
2. 选择首帧图片：
   - 点击页面中的“首帧”区域，或点击右上角浮层的“打开首帧文件选择器”按钮，打开系统文件选择对话框。
   - 在对话框中手动选择本地项目文件夹中的对应分镜图片（扩展无法为对话框预选文件）。
```html
<div class="inline-flex h-full w-full flex-col items-center justify-center rounded-10 cursor-pointer hover:bg-system-black64"><svg width="1em" height="1em" fill="none" viewBox="0 0 25 25" xmlns="http://www.w3.org/2000/svg" class="flex-shrink-0 text-2xl text-system-white"><path d="M12.28 5.96875L12.2617 19.9688" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M5.25 12.9688H19.25" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg><div class="mx-2 mt-2 text-center text-xs sm:mt-1.5">首帧</div><input hidden="" accept="image/jpeg,image/png,image/webp" multiple="" type="file"></div>
```

3. 点击输入框，输入提示词
```html
<textarea class="flex rounded-10 border border-input ring-offset-system-bg06 placeholder:text-system-text04 focus-visible:outline-none focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[calc(100%-24px)] w-full flex-1 resize-none rounded-none border-none bg-transparent p-0 text-sm text-system-white caret-system-blue02 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-sm lg:text-xs" maxlength="1500" required="">女孩开心地笑了</textarea>
```

4. 点击"创作"按钮，完成一次视频分镜创作，进行下一个分镜的创作
```html
<button class="inline-flex items-center justify-center whitespace-nowrap ring-offset-white transition-colors bg-ShengshuButton hover:bg-ShengshuButtonHover text-black font-semibold h-12 rounded-12 px-8 relative w-full overflow-hidden text-lg disabled:cursor-not-allowed"><div class="flex items-center justify-center"><span>创作</span><svg width="1em" height="1em" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="mr-1 ml-2 shrink-0 text-base"><path d="M12 24C18.6274 24 24 18.6274 24 12C24 5.37258 18.6274 0 12 0C5.37258 0 0 5.37258 0 12C0 18.6274 5.37258 24 12 24ZM14.8571 9.14286C12.8929 7.17857 12 3.42857 12 3.42857C12 3.42857 11.1071 7.17857 9.14286 9.14286C7.17857 11.1071 3.42857 12 3.42857 12C3.42857 12 7.29018 13.0045 9.14286 14.8571C10.9955 16.7098 12 20.5714 12 20.5714C12 20.5714 12.7366 16.9777 14.8571 14.8571C16.9777 12.7366 20.5714 12 20.5714 12C20.5714 12 16.8214 11.1071 14.8571 9.14286Z" fill="currentColor" fill-rule="evenodd"></path></svg><span class="mr-1" style="color: inherit;">10</span></div></button>
```

## 批量提交功能
### 提交多个视频项目
1. 点击"批量提交"按钮
2. 在弹出的对话框中，选择要提交的视频项目文件夹
3. 点击"确认"按钮
4. 插件会自动读取选中文件夹内的图片和Prompt文档，按照分镜顺序提交视频创作（启用“服务模式”后由本地服务完成上传与提交）
5. 每次提交4个视频后，会等待2分钟，再继续提交下一批视频