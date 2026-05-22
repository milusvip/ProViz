// 监听来自 background / popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SHOW_RESULT_OVERLAY':
      try {
        showResultOverlay(message.entry);
      } catch (e) {
        console.error('showResultOverlay error:', e);
      }
      sendResponse({ ok: true });
      break;
    case 'SHOW_PRE_OVERLAY':
      showPreOverlay(message.imageUrl);
      sendResponse({ ok: true });
      break;
    case 'SHOW_SCREENSHOT_SELECTOR':
      showScreenshotSelector();
      sendResponse({ ok: true });
      break;
  }
});

// ---- 预分析浮层（右键后先确认再反推）----

function showPreOverlay(imageUrl) {
  removeExistingOverlay();
  removeToast();

  const overlay = document.createElement('div');
  overlay.id = 'prompt-overlay';

  const spring = 'cubic-bezier(0.16,1,0.3,1)';

  // backdrop（不绑定关闭）
  const back = document.createElement('div');
  back.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.3)';

  // panel
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;width:min(92vw,480px);max-height:min(85vh,680px);background:#fff;border:2px solid #000;box-shadow:0 32px 64px rgba(0,0,0,0.15);padding:24px;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#111;animation:oIn 0.3s ${spring}`;

  // header
  const hd = document.createElement('div');
  hd.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;border-bottom:2px solid #000;padding-bottom:12px;cursor:move';
  const title = document.createElement('span');
  title.style.cssText = 'font-size:15px;font-weight:700;color:#111;letter-spacing:-0.2px';
  title.textContent = 'ProViz';
  const xBtn = document.createElement('button');
  xBtn.textContent = '×';
  xBtn.style.cssText = 'background:none;border:2px solid #ddd;color:#999;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all 0.15s;line-height:1;font-weight:700';
  xBtn.onmouseenter = () => { xBtn.style.borderColor = '#ff0066'; xBtn.style.color = '#ff0066'; };
  xBtn.onmouseleave = () => { xBtn.style.borderColor = '#ddd'; xBtn.style.color = '#999'; };
  hd.append(title, xBtn);

  // image area
  const imgWrap = document.createElement('div');
  imgWrap.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;margin:10px 0;overflow:hidden;min-height:160px';

  const imgEl = document.createElement('img');
  imgEl.style.cssText = 'max-width:100%;max-height:300px;object-fit:contain;border:2px solid #eee';
  imgEl.src = imageUrl;
  imgWrap.appendChild(imgEl);

  // status area
  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'display:none;flex-direction:column;align-items:center;justify-content:center;margin:10px 0;gap:8px';

  const statusRow = document.createElement('div');
  statusRow.style.cssText = 'display:flex;align-items:center;font-size:14px;font-weight:600;color:#111';

  const spinner = document.createElement('span');
  spinner.textContent = '⟳';
  spinner.style.cssText = 'display:inline-block;margin-right:10px;font-size:18px;animation:prSpin 0.8s linear infinite';
  statusRow.append(spinner, document.createTextNode('正在反推中...'));

  const timerEl = document.createElement('div');
  timerEl.style.cssText = 'font-size:12px;color:#999;font-weight:500';

  statusEl.append(statusRow, timerEl);

  // language toggle（反推前可选，反推开始后隐藏）
  let selectedLang = 'zh';
  const langBar = document.createElement('div');
  langBar.style.cssText = 'display:flex;gap:4px;justify-content:center;margin-bottom:8px;flex-shrink:0';
  const makeLangBtn = (label, value) => {
    const b = document.createElement('button');
    b.textContent = label;
    const isActive = value === 'zh';
    b.style.cssText = `border:1.5px solid ${isActive?'#ff0066':'#ddd'};background:${isActive?'#fff0f5':'#fff'};color:${isActive?'#ff0066':'#999'};padding:3px 12px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;transition:all 0.15s`;
    b.addEventListener('click', () => {
      selectedLang = value;
      langBar.querySelectorAll('button').forEach(bb => {
        const is = bb === b;
        bb.style.borderColor = is ? '#ff0066' : '#ddd';
        bb.style.background = is ? '#fff0f5' : '#fff';
        bb.style.color = is ? '#ff0066' : '#999';
      });
    });
    return b;
  };
  langBar.append(makeLangBtn('中文', 'zh'), makeLangBtn('English', 'en'));

  // footer button
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;flex-shrink:0';

  const btnAct = document.createElement('button');
  btnAct.textContent = '开始反推';
  btnAct.style.cssText = 'flex:1;padding:10px 12px;background:#111;border:2px solid #000;cursor:pointer;font-size:13px;font-weight:700;color:#fff;font-family:inherit;transition:all 0.15s';
  btnAct.onmouseenter = () => { btnAct.style.background = '#ff0066'; btnAct.style.borderColor = '#ff0066'; };
  btnAct.onmouseleave = () => { btnAct.style.background = '#111'; btnAct.style.borderColor = '#000'; };

  footer.appendChild(btnAct);

  // events
  let timerInterval = null;
  xBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    overlay.remove();
  });

  btnAct.addEventListener('click', () => {
    // 切换到加载状态
    imgWrap.style.display = 'none';
    langBar.style.display = 'none';
    statusEl.style.display = 'flex';
    btnAct.disabled = true;
    btnAct.textContent = '反推中...';
    btnAct.style.opacity = '0.5';
    btnAct.onmouseenter = null;
    btnAct.onmouseleave = null;

    // 计时
    const startTime = Date.now();
    timerEl.textContent = '已等待 0 秒';
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed < 5) {
        timerEl.textContent = `正在分析... ${elapsed}秒`;
      } else if (elapsed < 15) {
        timerEl.textContent = `模型处理中，已等待 ${elapsed}秒`;
      } else if (elapsed < 30) {
        timerEl.textContent = `仍在处理，已等待 ${elapsed}秒，请稍候`;
      } else if (elapsed < 60) {
        timerEl.textContent = `已等待 ${elapsed}秒，模型思考中...`;
      } else {
        const min = Math.floor(elapsed / 60);
        const sec = elapsed % 60;
        timerEl.textContent = `已等待 ${min}分${sec}秒，再给它一点时间`;
      }
    }, 1000);

    // 根据选中语言构造提示词（覆写配置中的 systemPrompt，确保语言一致）
    const zhPrompt = '请用中文回答。分析这张图片，完成以下两项输出（以 JSON 格式返回，仅输出 JSON 对象，不要包含其他文字）：\n\n1. text_prompt: 一段详细的文字描述，包含画面主体、背景、构图、色调、风格、光线、情绪等，足以让 AI 绘画模型根据这段文字生成相似的图片。\n\n2. json_prompt: 一个结构化的 JSON 对象，包含以下字段：\n   - subject: 主体描述\n   - scene: 场景/背景\n   - style: 艺术风格（摄影/插画/油画/3D 渲染/像素风等）\n   - composition: 构图方式（特写/全景/居中/三分法等）\n   - color_tone: 色调和色彩分析\n   - lighting: 光线描述\n   - mood: 情绪氛围\n   - technical: 技术细节（镜头/焦距/光圈/渲染引擎等）\n   - tags: 关键词标签列表\n\n请确保 JSON 中包含这两个顶层键：text_prompt 和 json_prompt。注意：所有输出内容必须使用中文！';
    const enPrompt = 'Answer in English. Analyze this image and provide the following two outputs (return JSON only, no other text):\n\n1. text_prompt: A detailed text description covering subject, background, composition, color tone, style, lighting, mood, etc., sufficient for an AI art model to generate a similar image.\n\n2. json_prompt: A structured JSON object with these fields:\n   - subject: subject description\n   - scene: scene/background\n   - style: art style (photography/illustration/oil painting/3D render/pixel art/etc.)\n   - composition: composition (close-up/panorama/centered/rule of thirds/etc.)\n   - color_tone: color tone analysis\n   - lighting: lighting description\n   - mood: mood/atmosphere\n   - technical: technical details (lens/focal length/aperture/render engine/etc.)\n   - tags: list of keyword tags\n\nMake sure the JSON includes these two top-level keys: text_prompt and json_prompt. Note: ALL output content must be in English!';
    const systemPrompt = selectedLang === 'en' ? enPrompt : zhPrompt;

    chrome.runtime.sendMessage({ type: 'REVERSE_IMAGE', imageUrl, systemPrompt }, (response) => {
      clearInterval(timerInterval);
      if (chrome.runtime.lastError) {
        showToast('发送失败');
        overlay.remove();
        return;
      }
      // background 会通过 SHOW_RESULT_OVERLAY 推送结果浮层
      // overlay 会被 showResultOverlay 中的 removeExistingOverlay 移除
    });
  });

  // 注入动画
  if (!document.getElementById('o-s')) {
    const s = document.createElement('style');
    s.id = 'o-s';
    s.textContent = '@keyframes oIn{from{opacity:0;transform:translate(-50%,-50%) scale(0.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes prSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }

  makeDraggable(panel, hd);

  panel.append(hd, imgWrap, statusEl, langBar, footer);
  overlay.append(back, panel);
  document.body.appendChild(overlay);
}

// ---- 截图区域选择器 ----

function showScreenshotSelector() {
  removeExistingOverlay();
  removeToast();

  const overlay = document.createElement('div');
  overlay.id = 'prompt-overlay';

  // 遮罩背景（用于选中后变暗区域）
  const back = document.createElement('div');
  back.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0);cursor:crosshair';

  // 选区指示器
  const selEl = document.createElement('div');
  selEl.id = 'prompt-sel-rect';
  selEl.style.cssText = 'position:fixed;z-index:2147483647;border:2px solid #ff0066;background:rgba(255,0,102,0.08);display:none;pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,0.3)';

  // 提示文字
  const hint = document.createElement('div');
  hint.id = 'prompt-sel-hint';
  hint.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;padding:10px 22px;font-size:13px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,sans-serif;border:2px solid #000;pointer-events:none;white-space:nowrap';
  hint.textContent = '拖动鼠标选择要反推的区域  ·  Esc 取消';

  // 确认工具栏（选中后显示）
  const toolbar = document.createElement('div');
  toolbar.id = 'prompt-sel-toolbar';
  toolbar.style.cssText = 'position:fixed;z-index:2147483647;display:none;gap:8px;padding:8px;min-width:200px';

  const btnConfirm = document.createElement('button');
  btnConfirm.textContent = '✓ 确认反推';
  btnConfirm.style.cssText = 'flex:1;padding:8px 18px;background:#ff0066;border:2px solid #000;color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit;transition:all 0.15s;white-space:nowrap;line-height:1.4';
  btnConfirm.onmouseenter = () => { btnConfirm.style.background = '#e00059'; };
  btnConfirm.onmouseleave = () => { btnConfirm.style.background = '#ff0066'; };

  const btnCancel = document.createElement('button');
  btnCancel.textContent = '取消';
  btnCancel.style.cssText = 'flex:1;padding:8px 14px;background:#fff;border:2px solid #ddd;color:#666;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:all 0.15s;white-space:nowrap;line-height:1.4';
  btnCancel.onmouseenter = () => { btnCancel.style.borderColor = '#ff0066'; btnCancel.style.color = '#ff0066'; };
  btnCancel.onmouseleave = () => { btnCancel.style.borderColor = '#ddd'; btnCancel.style.color = '#666'; };

  toolbar.append(btnConfirm, btnCancel);

  let startX, startY, isDragging = false;

  function updateSelection(e) {
    const clampedX = Math.max(0, Math.min(e.clientX, window.innerWidth));
    const clampedY = Math.max(0, Math.min(e.clientY, window.innerHeight));
    const x = Math.max(0, Math.min(startX, clampedX));
    const y = Math.max(0, Math.min(startY, clampedY));
    const w = Math.abs(clampedX - startX);
    const h = Math.abs(clampedY - startY);
    selEl.style.left = x + 'px';
    selEl.style.top = y + 'px';
    selEl.style.width = w + 'px';
    selEl.style.height = h + 'px';
    selEl.style.display = w > 0 || h > 0 ? 'block' : 'none';
    selEl.style.boxShadow = `0 0 0 9999px rgba(0,0,0,0.3)`;
  }

  function getSelectionRect() {
    const left = parseFloat(selEl.style.left);
    const top = parseFloat(selEl.style.top);
    const w = parseFloat(selEl.style.width);
    const h = parseFloat(selEl.style.height);
    return { x: left, y: top, w, h };
  }

  function showToolbar() {
    const rect = getSelectionRect();
    const bw = 2;
    toolbar.style.display = 'flex';
    toolbar.style.left = Math.max(4, Math.min(rect.x - bw, window.innerWidth - toolbar.offsetWidth - 4)) + 'px';
    toolbar.style.top = (rect.y + rect.h + 8) + 'px';
  }

  function cleanup() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      cleanup();
      overlay.remove();
    }
  }

  function onMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    updateSelection(e);
  }

  function onUp(e) {
    if (!isDragging) return;
    isDragging = false;
    const rect = getSelectionRect();
    if (rect.w < 5 || rect.h < 5) {
      selEl.style.display = 'none';
      return;
    }
    showToolbar();
  }

  back.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    isDragging = true;
    toolbar.style.display = 'none';
    updateSelection(e);
  });

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('keydown', onKey);

  btnCancel.addEventListener('click', () => {
    cleanup();
    overlay.remove();
  });

  btnConfirm.addEventListener('click', () => {
    const rect = getSelectionRect();
    if (rect.w < 5 || rect.h < 5) return;
    cleanup();
    overlay.remove();

    // 通知 background 截取所选区域，返回后显示预分析浮层
    chrome.runtime.sendMessage({
      type: 'CAPTURE_REGION',
      rect,
      dpr: window.devicePixelRatio || 1
    }).then(response => {
      if (response?.dataUrl) {
        showPreOverlay(response.dataUrl);
      } else {
        showToast('截图失败: ' + (response?.error || '未知错误'));
      }
    }).catch(err => {
      showToast('截图失败');
      console.error('[ProViz] CAPTURE_REGION error:', err);
    });
  });

  if (!document.getElementById('o-s')) {
    const s = document.createElement('style');
    s.id = 'o-s';
    s.textContent = '@keyframes oIn{from{opacity:0;transform:translate(-50%,-50%) scale(0.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes prSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }

  overlay.append(back, selEl, hint, toolbar);
  document.body.appendChild(overlay);
}

// ---- 结果浮层 ----

function showResultOverlay(entry) {
  removeExistingOverlay();
  removeToast();

  const overlay = document.createElement('div');
  overlay.id = 'prompt-overlay';

  const isError = entry.isError || !entry.jsonPrompt;
  const animKf = '@keyframes oIn{from{opacity:0;transform:translate(-50%,-50%) scale(0.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}';
  const spring = 'cubic-bezier(0.16,1,0.3,1)';

  overlay.innerHTML = `
    <div class="o-back"></div>
    <div class="o-panel">
      <div class="o-hd">
        <span class="o-tt">ProViz</span>
        <button class="o-x">&#xd7;</button>
      </div>
      <div class="o-tabs">
        <button class="o-t o-ta">文字</button>
        <button class="o-t">JSON</button>
      </div>
      <div class="o-shell">
        <div class="o-body">
          <div class="o-txt"></div>
          <div class="o-json" style="display:none"></div>
        </div>
      </div>
      <div class="o-ft">
        <button class="o-btn">复制当前</button>
        <button class="o-btn">复制全部</button>
      </div>
    </div>
  `;

  // panel
  const pnl = overlay.querySelector('.o-panel');
  pnl.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;width:min(92vw,640px);max-height:min(85vh,720px);background:#fff;border:2px solid #000;box-shadow:0 32px 64px rgba(0,0,0,0.15);padding:24px;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#111;animation:oIn 0.35s ${spring}`;

  // backdrop
  const back = overlay.querySelector('.o-back');
  back.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.3)';

  // header
  const hd = overlay.querySelector('.o-hd');
  hd.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;border-bottom:2px solid #000;padding-bottom:12px;cursor:move';
  overlay.querySelector('.o-tt').style.cssText = 'font-size:15px;font-weight:700;color:#111;letter-spacing:-0.2px';
  const xBtn = overlay.querySelector('.o-x');
  xBtn.style.cssText = 'background:none;border:2px solid #ddd;color:#999;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all 0.15s;line-height:1;font-weight:700';
  xBtn.onmouseenter = () => { xBtn.style.borderColor = '#ff0066'; xBtn.style.color = '#ff0066'; };
  xBtn.onmouseleave = () => { xBtn.style.borderColor = '#ddd'; xBtn.style.color = '#999'; };

  // tabs
  const tabs = overlay.querySelector('.o-tabs');
  tabs.style.cssText = 'display:flex;gap:0;flex-shrink:0;border-bottom:2px solid #000';
  overlay.querySelectorAll('.o-t').forEach((b, i) => {
    b.style.cssText = 'padding:7px 0;margin-bottom:-2px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;color:#bbb;font-family:inherit;transition:color 0.15s;border-bottom:2px solid transparent;margin-right:20px';
  });
  overlay.querySelector('.o-ta').style.cssText += ';color:#000;border-bottom-color:#ff0066';

  // body
  const shell = overlay.querySelector('.o-shell');
  shell.style.cssText = 'flex:1;border:2px solid #000;background:#faf9f7;margin:10px 0;min-height:0;display:flex';
  const body = overlay.querySelector('.o-body');
  body.style.cssText = 'flex:1;padding:12px 14px;overflow-y:auto';

  const textEl = overlay.querySelector('.o-txt');
  textEl.style.cssText = 'white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.8;color:#333;font-family:inherit';
  textEl.textContent = entry.textPrompt || '(无结果)';

  const jsonEl = overlay.querySelector('.o-json');
  jsonEl.style.cssText = 'display:none;white-space:pre-wrap;word-break:break-word;font-family:\'SF Mono\',\'Fira Code\',Consolas,monospace;font-size:12px;line-height:1.8;color:#666';
  jsonEl.textContent = isError ? '(无 JSON 数据)' : (entry.jsonPrompt || '(无 JSON 数据)');

  // footer buttons
  const footer = overlay.querySelector('.o-ft');
  footer.style.cssText = 'display:flex;gap:8px;flex-shrink:0';

  overlay.querySelectorAll('.o-btn').forEach((b) => {
    const act = b.classList.contains('o-act');
    b.style.cssText = act
      ? 'flex:1;padding:8px 12px;background:#111;border:2px solid #000;cursor:pointer;font-size:12px;font-weight:700;color:#fff;font-family:inherit;transition:all 0.15s'
      : 'flex:1;padding:8px 12px;background:#fff;border:2px solid #ddd;cursor:pointer;font-size:12px;font-weight:600;color:#666;font-family:inherit;transition:all 0.15s';
    b.onmouseenter = () => {
      if (act) { b.style.background = '#ff0066'; b.style.borderColor = '#ff0066'; }
      else { b.style.borderColor = '#ff0066'; b.style.color = '#ff0066'; b.style.background = '#fff0f5'; }
    };
    b.onmouseleave = () => {
      if (act) { b.style.background = '#111'; b.style.borderColor = '#000'; }
      else { b.style.background = '#fff'; b.style.borderColor = '#ddd'; b.style.color = '#666'; }
    };
  });

  // events — only X closes, backdrop does NOT（用户要求弹窗不自动关闭）
  const closeAll = () => overlay.remove();
  xBtn.addEventListener('click', closeAll);

  const btns = overlay.querySelectorAll('.o-btn');

  // tab switching
  const tabEls = overlay.querySelectorAll('.o-t');
  tabEls[0].addEventListener('click', () => switchO('text', tabEls, textEl, jsonEl));
  tabEls[1].addEventListener('click', () => switchO('json', tabEls, textEl, jsonEl));

  // copy
  btns[0].addEventListener('click', () => {
    const isTxt = textEl.style.display !== 'none';
    copyToClipboard(isTxt ? textEl.textContent : jsonEl.textContent);
  });
  btns[1].addEventListener('click', () => {
    copyToClipboard('【文字提示词】\n' + (entry.textPrompt || '') + '\n\n【JSON 提示词】\n' + (entry.jsonPrompt || ''));
  });

  // 注入动画样式
  if (!document.getElementById('o-s')) {
    const s = document.createElement('style');
    s.id = 'o-s';
    s.textContent = animKf;
    document.head.appendChild(s);
  }

  makeDraggable(pnl, hd);

  document.body.appendChild(overlay);
}

function switchO(name, tabs, textEl, jsonEl) {
  const isTxt = name === 'text';
  tabs.forEach((t, i) => {
    const active = (i === 0) === isTxt;
    t.style.color = active ? '#000' : '#bbb';
    t.style.borderBottomColor = active ? '#ff0066' : 'transparent';
  });
  textEl.style.display = isTxt ? '' : 'none';
  jsonEl.style.display = isTxt ? 'none' : '';
}

function removeExistingOverlay() {
  const existing = document.getElementById('prompt-overlay');
  if (existing) existing.remove();
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('已复制');
  });
}

// ---- Toast ----

function showToast(msg) {
  removeToast();
  const toast = document.createElement('div');
  toast.id = 'prompt-toast';
  toast.style.cssText = [
    'position:fixed;top:24px;left:50%;transform:translateX(-50%)',
    'background:#111;border:2px solid #000',
    'color:#fff;padding:10px 22px;font-size:13px;font-weight:600',
    'z-index:2147483647',
    'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
    'white-space:pre-line;text-align:center',
    'box-shadow:0 8px 24px rgba(0,0,0,0.15)'
  ].join(';');
  toast.textContent = msg;
  document.body.appendChild(toast);
}

function removeToast() {
  const existing = document.getElementById('prompt-toast');
  if (existing) existing.remove();
}

// ---- 窗口拖拽 ----

function makeDraggable(el, handle) {
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  function onMove(e) {
    if (!isDragging) return;
    el.style.left = (startLeft + e.clientX - startX) + 'px';
    el.style.top = (startTop + e.clientY - startY) + 'px';
  }

  function onUp() {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target !== handle && !handle.contains(e.target)) return;
    const btn = e.target.closest('button');
    if (btn) return; // 按钮不触发拖拽
    e.preventDefault();

    const rect = el.getBoundingClientRect();
    if (el.style.transform && el.style.transform !== 'none') {
      el.style.left = rect.left + 'px';
      el.style.top = rect.top + 'px';
      el.style.transform = 'none';
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(el.style.left);
    startTop = parseInt(el.style.top);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
