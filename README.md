# Creative Workbench → Doubao Video (Chrome Extension MVP)

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