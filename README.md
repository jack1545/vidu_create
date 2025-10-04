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