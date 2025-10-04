# VIDU批量提交视频工具 Chrome 插件

1. 打开Chrome浏览器，在网页页输入 chrome://extensions/，打开右上角开发者模式
2. 把解压的插件目录拖进来
3. 打开vidu.cn，在页面中间会悬浮一个设置按钮，点击进入
4. 左上角点击打开文件，选择项目文件

## 项目文件夹说明
1. 项目文件夹应该包含：分镜图、prompt.txt

![项目目录内容](/guide/1.png)

2. prompt.txt 的提示词一行一条，也可以后面添加

![prompt内容](/guide/2.png)

3. 插件工作界面

批量提交默认是将所有分镜一次性按顺序提交（可能存在bug）

![插件界面](/guide/3.png)

## 豆包视频批量提交插件未完成：😂 Creative Workbench → Doubao Video (Chrome Extension MVP)

This Chrome extension reads `cw` param from `doubao.com` and attempts to automate the video generation workflow.

## Install (Developer Mode)
1. Open Chrome → Extensions → Manage Extensions.
2. Enable Developer Mode.
3. Click "Load unpacked" and select `f:\2025\youtube\doubao\API_Guide\chrome-extension`.

## Usage
- In your Creative Workbench Storyboard workflow, click the "Doubao video" button on a Shot card.
- It will open `https://www.doubao.com/?cw=<payload>` where payload contains `imageUrl` and `prompt`.
- The extension content script decodes it and:
  - Tries to click "新对话".
  - Attempts to upload the image (MVP: inserts the image URL in the prompt area if file upload is restricted).
  - Fills the prompt text.
  - Clicks submit.

## Notes
- Real file uploads usually require a user gesture; extensions cannot arbitrarily write local files. This MVP focuses on URL insertion.
- You can adapt selectors in `content.js` to match doubao.com UI.
- If you already have login/session, the workflow should proceed immediately.

## 今日更新（UI 与功能）
- 新建项目输入改为多行 `textarea`（分镜提示词，每行一个分镜）。
- 调整布局：收窄输入框与按钮宽度，创建按钮移至输入框下方；图片池提示移至图片池下方并加粗。
- 分镜列表响应式：根据窗口宽度自动排版为 1–4 列，最多 4 列横排。
- 项目操作新增：
  - “新增分镜”按钮，可在项目创建后追加空分镜（空提示、空图片）。
  - “压缩图片”按钮，批量将项目内分镜图片压缩为 WebP（保持分辨率与清晰度）。

## 压缩图片（WebP）
- 入口位置：每个项目卡片顶部的“压缩图片”按钮，旁有加粗提示“压缩图片可以避免提交失败”。
- 处理范围：仅压缩已选择图片的分镜，空分镜跳过。
- 保真策略：
  - 保留原始分辨率，不拉伸、不缩放。
  - 质量参数设为 `0.95`，兼顾体积与清晰度。
  - 处理 EXIF 方向，确保导出方向正确。
- 导出结果：将每个分镜的 `imageFile` 替换为 `.webp` 文件，压缩完成后弹窗提示“已压缩 N 张分镜图片为 WebP（保持原分辨率与清晰度）”。
- 推荐使用场景：素材图片过大导致上传缓慢或提交失败时。

## 使用补充：新建项目（分镜提示词）
- 在左侧输入框填写分镜提示词，每行一个，对应一个分镜。
- 点击“新建项目”，系统按行生成分镜卡片（索引从 1 开始）。
- 右侧图片池可拖拽图片到项目或具体分镜中进行填充。