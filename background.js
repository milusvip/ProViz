// 右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'prompt-reverse',
    title: '反推此图片的提示词',
    contexts: ['image']
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'prompt-reverse' && info.srcUrl) {
    // 先尝试显示预分析浮层（让用户确认后再调用 API）
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PRE_OVERLAY', imageUrl: info.srcUrl })
      .catch(() => {
        // content script 未加载 → 直接调用 API 并显示结果浮层
        handleImageReverse(info.srcUrl, tab).then(() => {
          showOverlayInTab(tab.id);
        });
      });
  }
});

// 监听来自 popup / content 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'REVERSE_IMAGE':
      handleImageReverse(message.imageUrl, sender.tab || null, message.systemPrompt)
        .then(result => {
          showOverlayInTab(sender.tab?.id);
          sendResponse(result);
        });
      return true; // keep channel open

    case 'GET_HISTORY':
      getHistory().then(sendResponse);
      return true;

    case 'CLEAR_HISTORY':
      chrome.storage.local.set({ history: [] }).then(() => sendResponse({ ok: true }));
      return true;

    case 'OPEN_OPTIONS':
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      break;

    case 'CHECK_CONFIG':
      getConfig().then(cfg => sendResponse({ configured: !!cfg.apiUrl }));
      return true;

    // ---- 多 API 配置管理 ----

    case 'GET_CONFIGS':
      getConfigsList().then(sendResponse);
      return true;

    case 'SAVE_CONFIG': {
      const { config } = message;
      saveConfig(config).then(sendResponse);
      return true;
    }

    case 'DELETE_CONFIG': {
      const { id } = message;
      deleteConfig(id).then(sendResponse);
      return true;
    }

    case 'SET_ACTIVE_CONFIG': {
      const { id } = message;
      chrome.storage.sync.set({ activeApiId: id || null }).then(() => {
        sendResponse({ ok: true });
      });
      return true;
    }

    case 'GET_CONFIG':
      getConfig().then(cfg => sendResponse(cfg));
      return true;

    case 'GET_CONFIG_BY_ID': {
      const { id } = message;
      getConfigById(id).then(cfg => sendResponse(cfg));
      return true;
    }
  }
});

// ---- 核心逻辑 ----

async function handleImageReverse(imageUrl, tab, systemPrompt) {
  try {
    const dataUrl = await fetchImageAsDataUrl(imageUrl);
    return await callApiAndSave(dataUrl, systemPrompt);
  } catch (err) {
    console.error('反推失败:', err);
    // 错误也保存为历史记录，让结果窗口能显示
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      textPrompt: '[错误] ' + err.message,
      jsonPrompt: '',
      thumbnail: '',
      isError: true
    };
    const history = await getHistory();
    history.unshift(entry);
    if (history.length > 50) history.length = 50;
    await chrome.storage.local.set({ history, pendingResult: entry });
    return { error: err.message };
  }
}

async function callApiAndSave(dataUrl, systemPrompt) {
  const config = await getConfig();
  if (systemPrompt) config.systemPrompt = systemPrompt;
  const result = await callApi(dataUrl, config);

  // 存入历史
  const history = await getHistory();
  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    textPrompt: result.text_prompt,
    jsonPrompt: result.json_prompt,
    thumbnail: dataUrl
  };
  history.unshift(entry);
  if (history.length > 50) history.length = 50;
  await chrome.storage.local.set({ history, pendingResult: entry });

  return result;
}

async function callApi(dataUrl, config) {
  if (!config.apiUrl) {
    throw new Error('请先在设置中配置 API 端点 URL');
  }

  const base64 = dataUrl.split(',')[1];
  const mimeType = dataUrl.split(';')[0].replace('data:', '');

  const requestBody = buildRequestBody(base64, mimeType, config);

  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) {
    const headerValue = config.apiKey.startsWith('Bearer ')
      ? config.apiKey : `Bearer ${config.apiKey}`;
    // 确保 header 值只包含 ISO-8859-1 字符
    if (/^[\x00-\xFF]*$/.test(headerValue)) {
      headers[config.apiKeyHeader || 'Authorization'] = headerValue;
    }
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
  }

  const responseData = await response.json();
  return parseResponse(responseData, config);
}

function buildRequestBody(base64, mimeType, config) {
  if (config.customTemplate) {
    let body = config.customTemplate
      .replace(/{{BASE64}}/g, base64)
      .replace(/{{MIME_TYPE}}/g, mimeType)
      .replace(/{{MODEL}}/g, config.model || '');
    try { return JSON.parse(body); } catch { return body; }
  }

  // 通用请求格式（OpenAI 格式，Claude / DashScope 均可兼容）
  return {
    model: config.model || 'claude-sonnet-4-20250506',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64}`
            }
          },
          {
            type: 'text',
            text: config.systemPrompt || `请用中文回答。分析这张图片，完成以下两项输出（以 JSON 格式返回，仅输出 JSON 对象，不要包含其他文字）：

1. text_prompt: 一段详细的文字描述，包含画面主体、背景、构图、色调、风格、光线、情绪等，足以让 AI 绘画模型根据这段文字生成相似的图片。

2. json_prompt: 一个结构化的 JSON 对象，包含以下字段：
   - subject: 主体描述
   - scene: 场景/背景描述
   - style: 艺术风格（摄影/插画/油画/3D 渲染/像素风等）
   - composition: 构图方式（特写/全景/居中/三分法等）
   - color_tone: 色调和色彩分析
   - lighting: 光线描述
   - mood: 情绪氛围
   - technical: 技术细节（镜头/焦距/光圈/渲染引擎等）
   - tags: 关键词标签列表

请确保 JSON 中包含这两个顶层键：text_prompt 和 json_prompt。注意：所有输出内容必须使用中文！`
          }
        ]
      }
    ]
  };
}

function parseResponse(responseData, config) {
  if (config.responseTextPath || config.responseJsonPath) {
    const textPath = config.responseTextPath || 'text_prompt';
    const jsonPath = config.responseJsonPath || 'json_prompt';
    return {
      text_prompt: getNestedValue(responseData, textPath) || '',
      json_prompt: getNestedValue(responseData, jsonPath) || ''
    };
  }

  // 默认：从 Anthropic Claude 响应中提取
  try {
    const content = responseData.content?.[0]?.text
      || responseData.choices?.[0]?.message?.content
      || responseData.message?.content
      || responseData.text || '';

    // 尝试从响应中提取 JSON
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*"text_prompt"[\s\S]*"json_prompt"[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : null;

    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        return {
          text_prompt: parsed.text_prompt || content,
          json_prompt: typeof parsed.json_prompt === 'object'
            ? JSON.stringify(parsed.json_prompt, null, 2)
            : parsed.json_prompt || jsonStr
        };
      } catch {
        // JSON 解析失败，返回原始内容
      }
    }

    return { text_prompt: content, json_prompt: '' };
  } catch (err) {
    return { text_prompt: JSON.stringify(responseData), json_prompt: '' };
  }
}

// ---- 工具函数 ----

async function fetchImageAsDataUrl(imageUrl) {
  // 如果是 base64 data URL，直接返回
  if (imageUrl.startsWith('data:')) return imageUrl;

  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((curr, key) => {
    const match = key.match(/^([^\[]+)\[(\d+)\]$/);
    if (match) {
      return curr?.[match[1]]?.[parseInt(match[2])];
    }
    return curr?.[key];
  }, obj);
}

async function getConfig() {
  const result = await chrome.storage.sync.get([
    'apiConfigs', 'activeApiId', 'apiUrl', 'apiKey', 'apiKeyHeader',
    'model', 'systemPrompt', 'customTemplate', 'useCustomTemplate',
    'responseTextPath', 'responseJsonPath'
  ]);
  // 迁移旧配置
  if (result.apiUrl && (!result.apiConfigs || result.apiConfigs.length === 0)) {
    await migrateOldConfig(result);
    // 重新读取
    const updated = await chrome.storage.sync.get(['apiConfigs', 'activeApiId']);
    return getActiveConfig(updated.apiConfigs || [], updated.activeApiId);
  }
  return getActiveConfig(result.apiConfigs || [], result.activeApiId);
}

function getActiveConfig(configs, activeId) {
  const active = configs.find(c => c.id === activeId);
  if (active) {
    return {
      apiUrl: active.apiUrl || '',
      apiKey: active.apiKey || '',
      apiKeyHeader: active.apiKeyHeader || 'Authorization',
      model: active.model || 'claude-sonnet-4-20250506',
      systemPrompt: active.systemPrompt || '',
      customTemplate: active.customTemplate || '',
      responseTextPath: active.responseTextPath || '',
      responseJsonPath: active.responseJsonPath || ''
    };
  }
  return { apiUrl: '' };
}

async function migrateOldConfig(old) {
  const config = {
    id: crypto.randomUUID(),
    name: '默认配置',
    apiUrl: old.apiUrl || '',
    apiKey: old.apiKey || '',
    apiKeyHeader: old.apiKeyHeader || 'Authorization',
    model: old.model || 'claude-sonnet-4-20250506',
    systemPrompt: old.systemPrompt || '',
    customTemplate: old.customTemplate || '',
    useCustomTemplate: old.useCustomTemplate || false,
    responseTextPath: old.responseTextPath || '',
    responseJsonPath: old.responseJsonPath || '',
    createdAt: Date.now()
  };
  const keysToRemove = [
    'apiUrl', 'apiKey', 'apiKeyHeader', 'model', 'systemPrompt',
    'customTemplate', 'useCustomTemplate', 'responseTextPath', 'responseJsonPath'
  ];
  await chrome.storage.sync.set({ apiConfigs: [config], activeApiId: config.id });
  await chrome.storage.sync.remove(keysToRemove);
}

async function getConfigsList() {
  const { apiConfigs } = await chrome.storage.sync.get('apiConfigs');
  // 返回不含 apiKey 的安全列表
  return (apiConfigs || []).map(({ apiKey, ...rest }) => rest);
}

async function saveConfig(config) {
  const { apiConfigs = [] } = await chrome.storage.sync.get('apiConfigs');
  const idx = apiConfigs.findIndex(c => c.id === config.id);
  if (idx >= 0) {
    apiConfigs[idx] = { ...apiConfigs[idx], ...config };
  } else {
    apiConfigs.push({
      ...config,
      id: config.id || crypto.randomUUID(),
      createdAt: config.createdAt || Date.now()
    });
  }
  await chrome.storage.sync.set({ apiConfigs });
  // 如果是第一个配置，自动设为激活
  if (apiConfigs.length === 1) {
    await chrome.storage.sync.set({ activeApiId: apiConfigs[0].id });
  }
  return { ok: true };
}

async function deleteConfig(id) {
  const { apiConfigs = [], activeApiId } = await chrome.storage.sync.get(['apiConfigs', 'activeApiId']);
  const filtered = apiConfigs.filter(c => c.id !== id);
  await chrome.storage.sync.set({ apiConfigs: filtered });
  if (activeApiId === id) {
    // 删除的是激活配置，自动选第一个
    await chrome.storage.sync.set({ activeApiId: filtered.length > 0 ? filtered[0].id : null });
  }
  return { ok: true };
}

async function getConfigById(id) {
  const { apiConfigs } = await chrome.storage.sync.get('apiConfigs');
  return (apiConfigs || []).find(c => c.id === id) || null;
}

async function getHistory() {
  const result = await chrome.storage.local.get('history');
  return result.history || [];
}

async function showOverlayInTab(tabId) {
  if (!tabId) return;
  const { history } = await chrome.storage.local.get('history');
  if (!history || history.length === 0) return;

  const entry = history[0];

  // 通过 content script 显示浮层
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_RESULT_OVERLAY', entry });
  } catch (err) {
    console.log('sendMessage failed, trying executeScript:', err.message);
    // content script 未就绪，直接注入浮层脚本
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: injectOverlay,
        args: [entry]
      });
    } catch (err2) {
      console.error('注入浮层失败:', err2.message);
    }
  }
}

// 注入到页面中执行的函数（必须自包含，不能引用外部变量）
function injectOverlay(entry) {
  const existing = document.getElementById('prompt-injected-overlay');
  if (existing) existing.remove();

  const style = document.createElement('style');
  style.textContent = `@keyframes proIn{from{opacity:0;transform:translate(-50%,-50%) scale(0.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'prompt-injected-overlay';
  root.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647';

  // 背景
  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3)';

  // 面板
  const panel = document.createElement('div');
  panel.style.cssText = `
    position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
    width:min(92vw,640px);max-height:min(85vh,720px);
    background:#fff;border:2px solid #000;
    box-shadow:0 32px 64px rgba(0,0,0,0.15);
    padding:24px;display:flex;flex-direction:column;
    animation:proIn 0.35s cubic-bezier(0.16,1,0.3,1);
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    font-size:13px;color:#111
  `;

  // 头部
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;border-bottom:2px solid #000;padding-bottom:12px';
  const title = document.createElement('span');
  title.style.cssText = 'font-size:15px;font-weight:700;color:#111;letter-spacing:-0.2px';
  title.textContent = 'ProViz';
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:2px solid #ddd;color:#999;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all 0.15s;line-height:1;font-weight:700';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('mouseenter', () => { closeBtn.style.borderColor = '#ff0066'; closeBtn.style.color = '#ff0066'; });
  closeBtn.addEventListener('mouseleave', () => { closeBtn.style.borderColor = '#ddd'; closeBtn.style.color = '#999'; });
  header.append(title, closeBtn);

  // 判断是否为错误
  const isError = entry.isError || !entry.jsonPrompt;

  // Tab
  const tabs = document.createElement('div');
  tabs.style.cssText = 'display:flex;gap:0;flex-shrink:0;border-bottom:2px solid #000';

  const tabT = document.createElement('button');
  tabT.textContent = '文字';
  const tabJ = document.createElement('button');
  tabJ.textContent = 'JSON';

  [tabT, tabJ].forEach((b, i) => {
    b.style.cssText = 'padding:7px 0;margin-bottom:-2px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:600;color:#bbb;font-family:inherit;transition:color 0.15s;border-bottom:2px solid transparent;margin-right:20px';
  });
  tabT.style.cssText += ';color:#000;border-bottom-color:#ff0066';

  // 内容区
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow-y:auto;min-height:80px;max-height:440px;border:2px solid #000;background:#faf9f7;padding:14px;margin:10px 0';

  const cText = document.createElement('div');
  cText.style.cssText = 'white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.8;color:#333;font-family:inherit';
  cText.textContent = entry.textPrompt || '(无结果)';

  const cJson = document.createElement('div');
  cJson.style.cssText = 'display:none;white-space:pre-wrap;word-break:break-word;font-family:\'SF Mono\',\'Fira Code\',Consolas,monospace;font-size:12px;color:#666';
  cJson.textContent = isError ? '(无 JSON 数据)' : (entry.jsonPrompt || '(无 JSON 数据)');

  // 底部按钮
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;flex-shrink:0';

  const makeBtn = (text, isAction) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = isAction
      ? 'flex:1;padding:8px 12px;background:#111;border:2px solid #000;cursor:pointer;font-size:12px;font-weight:700;color:#fff;font-family:inherit;transition:all 0.15s'
      : 'flex:1;padding:8px 12px;background:#fff;border:2px solid #ddd;cursor:pointer;font-size:12px;font-weight:600;color:#666;font-family:inherit;transition:all 0.15s';
    b.addEventListener('mouseenter', () => {
      if (isAction) { b.style.background = '#ff0066'; b.style.borderColor = '#ff0066'; }
      else { b.style.borderColor = '#ff0066'; b.style.color = '#ff0066'; b.style.background = '#fff0f5'; }
    });
    b.addEventListener('mouseleave', () => {
      if (isAction) { b.style.background = '#111'; b.style.borderColor = '#000'; }
      else { b.style.background = '#fff'; b.style.borderColor = '#ddd'; b.style.color = '#666'; }
    });
    return b;
  };
  const btnCopy = makeBtn('复制当前', false);
  const btnAll = makeBtn('复制全部', false);

  // 功能
  function switchTab(name) {
    const isTxt = name === 'text';
    tabT.style.color = isTxt ? '#000' : '#bbb';
    tabT.style.borderBottomColor = isTxt ? '#ff0066' : 'transparent';
    tabJ.style.color = isTxt ? '#bbb' : '#000';
    tabJ.style.borderBottomColor = isTxt ? 'transparent' : '#ff0066';
    cText.style.display = isTxt ? '' : 'none';
    cJson.style.display = isTxt ? 'none' : '';
  }

  const closeAll = () => root.remove();
  closeBtn.addEventListener('click', closeAll);

  tabT.addEventListener('click', () => switchTab('text'));
  tabJ.addEventListener('click', () => switchTab('json'));

  btnCopy.addEventListener('click', () => {
    const isTxt = cText.style.display !== 'none';
    navigator.clipboard.writeText(isTxt ? cText.textContent : cJson.textContent).catch(() => {});
  });
  btnAll.addEventListener('click', () => {
    const full = '【文字提示词】\n' + (entry.textPrompt || '') + '\n\n【JSON 提示词】\n' + (entry.jsonPrompt || '');
    navigator.clipboard.writeText(full).catch(() => {});
  });

  body.append(cText, cJson);
  footer.append(btnCopy, btnAll);

  panel.append(header, tabs, body, footer);
  root.append(backdrop, panel);
  document.body.appendChild(root);
}


