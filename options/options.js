let editingId = null;

/* ===== 模型预设 ===== */
const MODEL_PRESETS = {
  'claude-sonnet-4':     { label: 'Claude Sonnet 4',         apiUrl: 'https://api.anthropic.com/v1/messages',                                 model: 'claude-sonnet-4-20250506',       group: 'Anthropic Claude', provider: 'anthropic' },
  'claude-opus-4':       { label: 'Claude Opus 4',           apiUrl: 'https://api.anthropic.com/v1/messages',                                 model: 'claude-opus-4-20250514',         group: 'Anthropic Claude', provider: 'anthropic' },
  'claude-3.5-sonnet':   { label: 'Claude 3.5 Sonnet',       apiUrl: 'https://api.anthropic.com/v1/messages',                                 model: 'claude-3-5-sonnet-20241022',     group: 'Anthropic Claude', provider: 'anthropic' },
  'claude-3.5-haiku':    { label: 'Claude 3.5 Haiku',        apiUrl: 'https://api.anthropic.com/v1/messages',                                 model: 'claude-3-5-haiku-20241022',      group: 'Anthropic Claude', provider: 'anthropic' },
  'claude-3-opus':       { label: 'Claude 3 Opus',           apiUrl: 'https://api.anthropic.com/v1/messages',                                 model: 'claude-3-opus-20240229',         group: 'Anthropic Claude', provider: 'anthropic' },
  'claude-3-haiku':      { label: 'Claude 3 Haiku',          apiUrl: 'https://api.anthropic.com/v1/messages',                                 model: 'claude-3-haiku-20240307',        group: 'Anthropic Claude', provider: 'anthropic' },
  'gpt-4o':              { label: 'GPT-4o',                  apiUrl: 'https://api.openai.com/v1/chat/completions',                            model: 'gpt-4o',                         group: 'OpenAI', provider: 'openai' },
  'gpt-4o-mini':         { label: 'GPT-4o Mini',             apiUrl: 'https://api.openai.com/v1/chat/completions',                            model: 'gpt-4o-mini',                    group: 'OpenAI', provider: 'openai' },
  'gpt-4.1':             { label: 'GPT-4.1',                 apiUrl: 'https://api.openai.com/v1/chat/completions',                            model: 'gpt-4.1',                        group: 'OpenAI', provider: 'openai' },
  'gpt-4.1-mini':        { label: 'GPT-4.1 Mini',            apiUrl: 'https://api.openai.com/v1/chat/completions',                            model: 'gpt-4.1-mini',                   group: 'OpenAI', provider: 'openai' },
  'gpt-4.1-nano':        { label: 'GPT-4.1 Nano',            apiUrl: 'https://api.openai.com/v1/chat/completions',                            model: 'gpt-4.1-nano',                   group: 'OpenAI', provider: 'openai' },
  'gemini-2.5-pro':      { label: 'Gemini 2.5 Pro',          apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',        model: 'gemini-2.5-pro',    group: 'Google Gemini', provider: 'gemini' },
  'gemini-2.0-flash':    { label: 'Gemini 2.0 Flash',        apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',       model: 'gemini-2.0-flash',  group: 'Google Gemini', provider: 'gemini' },
  'qwen-vl-max':         { label: 'Qwen VL Max',             apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',     model: 'qwen-vl-max',                    group: '其他', provider: 'openai' },
  'step-2':              { label: 'Step-2',                  apiUrl: 'https://api.stepfun.com/v1/chat/completions',                            model: 'step-2',                         group: '其他', provider: 'openai' },
  'deepseek-vl2':        { label: 'DeepSeek VL2',            apiUrl: 'https://api.deepseek.com/v1/chat/completions',                           model: 'deepseek-vl2',                   group: '其他', provider: 'openai' },
};

/* ===== 模型对应的 API Key 提示 ===== */
const API_KEY_HINTS = {
  'anthropic': '支持 sk-ant- 开头的 Anthropic API Key',
  'openai':    '支持 sk- 开头的 OpenAI API Key / 中转站 Key',
  'gemini':    '支持 Google AI Studio 获取的 API Key',
};

/* ===== 初始化 ===== */
document.addEventListener('DOMContentLoaded', () => {
  loadConfigs();

  document.getElementById('modelSelect').addEventListener('change', applyModelPreset);
  document.getElementById('promptLang').addEventListener('change', fillDefaultPrompt);
  document.getElementById('btnNewConfig').addEventListener('click', () => showForm());
  document.getElementById('btnSave').addEventListener('click', saveConfig);
  document.getElementById('btnTest').addEventListener('click', testConnection);
  document.getElementById('btnCancelForm').addEventListener('click', hideForm);
  document.getElementById('useCustomTemplate').addEventListener('change', toggleCustomTemplate);
  document.getElementById('btnBack').addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
  });

  // 初始填入默认模型的预设
  applyModelPreset();
});

/* ===== 表单显示/隐藏 ===== */
function showForm() {
  clearForm();
  document.getElementById('formSection').classList.remove('hidden');
  document.getElementById('configListSection').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideForm() {
  document.getElementById('formSection').classList.add('hidden');
  document.getElementById('configListSection').classList.remove('hidden');
  loadConfigs();
}

/* ===== 模型预设 ===== */
function applyModelPreset() {
  const key = document.getElementById('modelSelect').value;
  const preset = MODEL_PRESETS[key];

  if (!preset) {
    // 自定义模式
    document.getElementById('apiUrl').value = '';
    document.getElementById('apiUrl').placeholder = 'https://api.example.com/v1/chat/completions';
    document.getElementById('modelName').value = '';
    document.getElementById('modelName').placeholder = '输入模型名称';
    document.getElementById('modelName').readOnly = false;
    document.getElementById('responseTextPath').value = '';
    document.getElementById('responseJsonPath').value = '';
    document.getElementById('apiKeyHint').textContent = '输入你的 API Key';
    return;
  }

  document.getElementById('apiUrl').value = preset.apiUrl;
  document.getElementById('modelName').value = preset.model;
  document.getElementById('modelName').readOnly = preset.provider !== 'custom';

  // 根据供应商设置默认响应路径
  if (preset.provider === 'anthropic') {
    document.getElementById('responseTextPath').value = '';
    document.getElementById('responseJsonPath').value = '';
  } else if (preset.provider === 'openai') {
    document.getElementById('responseTextPath').value = 'choices[0].message.content';
    document.getElementById('responseJsonPath').value = '';
  } else if (preset.provider === 'gemini') {
    document.getElementById('responseTextPath').value = 'candidates[0].content.parts[0].text';
    document.getElementById('responseJsonPath').value = '';
  }

  // API Key hint
  document.getElementById('apiKeyHint').textContent = API_KEY_HINTS[preset.provider] || '输入你的 API Key';
}

/* ===== 配置列表 ===== */
async function loadConfigs() {
  const configs = await chrome.runtime.sendMessage({ type: 'GET_CONFIGS' });
  const { activeApiId } = await chrome.storage.sync.get('activeApiId');
  renderConfigList(configs || [], activeApiId);
}

function renderConfigList(configs, activeId) {
  const list = document.getElementById('configList');
  const empty = document.getElementById('emptyHint');

  list.innerHTML = '';

  if (configs.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  configs.forEach(cfg => {
    const card = document.createElement('div');
    card.className = 'config-card' + (cfg.id === activeId ? ' active' : '');

    const isActive = cfg.id === activeId;
    const urlDisplay = cfg.apiUrl ? cfg.apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : '(未设置)';
    const modelLabel = getModelLabel(cfg.model);

    card.innerHTML = `
      <div class="config-card-info">
        <div class="config-card-name">${escapeHtml(modelLabel)}</div>
        <div class="config-card-url">${escapeHtml(urlDisplay)}</div>
      </div>
      ${isActive ? '<span class="config-badge">当前使用</span>' : ''}
      <div class="config-card-actions">
        ${!isActive ? `<button class="btn-sm primary" data-id="${cfg.id}">激活</button>` : ''}
        <button class="btn-sm" data-id="${cfg.id}">编辑</button>
        <button class="btn-sm danger" data-id="${cfg.id}">删除</button>
      </div>
    `;

    const actionBtns = card.querySelectorAll('.config-card-actions .btn-sm');
    actionBtns.forEach(btn => {
      if (btn.textContent.includes('编辑')) btn.addEventListener('click', () => editConfig(cfg.id));
      else if (btn.textContent.includes('激活')) btn.addEventListener('click', () => setActive(cfg.id));
      else if (btn.textContent.includes('删除')) btn.addEventListener('click', () => deleteConfig(cfg.id));
    });

    list.appendChild(card);
  });
}

function getModelLabel(model) {
  if (!model) return '未命名';
  for (const key in MODEL_PRESETS) {
    if (MODEL_PRESETS[key].model === model) return MODEL_PRESETS[key].label;
  }
  return model;
}

/* ===== 编辑 / 清空 ===== */
function editConfig(id) {
  chrome.runtime.sendMessage({ type: 'GET_CONFIG_BY_ID', id }, (resp) => {
    if (!resp) return;
    showForm();
    const cfg = resp;
    editingId = cfg.id;
    document.getElementById('formTitle').textContent = '编辑配置';

    // 尝试匹配预设
    let matchedKey = null;
    for (const key in MODEL_PRESETS) {
      const p = MODEL_PRESETS[key];
      if (p.model === cfg.model && p.apiUrl === cfg.apiUrl) {
        matchedKey = key;
        break;
      }
    }

    if (matchedKey) {
      document.getElementById('modelSelect').value = matchedKey;
      applyModelPreset();
    } else {
      document.getElementById('modelSelect').value = 'custom';
      applyModelPreset();
      document.getElementById('apiUrl').value = cfg.apiUrl || '';
      document.getElementById('modelName').value = cfg.model || '';
      document.getElementById('modelName').readOnly = false;
    }

    document.getElementById('apiKey').value = cfg.apiKey || '';
    document.getElementById('systemPrompt').value = cfg.systemPrompt || '';
    document.getElementById('responseTextPath').value = cfg.responseTextPath || '';
    document.getElementById('responseJsonPath').value = cfg.responseJsonPath || '';
    document.getElementById('useCustomTemplate').checked = cfg.useCustomTemplate || false;
    document.getElementById('customTemplate').value = cfg.customTemplate || '';
    toggleCustomTemplate();

    document.getElementById('saveStatus').textContent = '';
    document.getElementById('saveStatus').className = 'save-status';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function clearForm() {
  editingId = null;
  document.getElementById('formTitle').textContent = '新建配置';
  document.getElementById('modelSelect').value = 'claude-sonnet-4';
  document.getElementById('apiKey').value = '';
  document.getElementById('promptLang').value = 'zh';
  document.getElementById('systemPrompt').value = '';
  document.getElementById('customTemplate').value = '';
  document.getElementById('useCustomTemplate').checked = false;
  toggleCustomTemplate();
  document.getElementById('saveStatus').textContent = '';
  document.getElementById('saveStatus').className = 'save-status';
  applyModelPreset();
}

function fillDefaultPrompt() {
  const lang = document.getElementById('promptLang').value;
  if (lang === 'en') {
    document.getElementById('systemPrompt').value = `Answer in English. Analyze this image and provide the following two outputs (return JSON only, no other text):

1. text_prompt: A detailed text description covering subject, background, composition, color tone, style, lighting, mood, etc., sufficient for an AI art model to generate a similar image.

2. json_prompt: A structured JSON object with these fields:
   - subject: subject description
   - scene: scene/background
   - style: art style (photography/illustration/oil painting/3D render/pixel art/etc.)
   - composition: composition (close-up/panorama/centered/rule of thirds/etc.)
   - color_tone: color tone analysis
   - lighting: lighting description
   - mood: mood/atmosphere
   - technical: technical details (lens/focal length/aperture/render engine/etc.)
   - tags: list of keyword tags

Make sure the JSON includes these two top-level keys: text_prompt and json_prompt. Note: ALL output content must be in English!`;
  } else {
    document.getElementById('systemPrompt').value = '';
  }
}

/* ===== 保存 / 删除 / 激活 ===== */
function getModelValue() {
  return document.getElementById('modelName').value.trim();
}

function toggleCustomTemplate() {
  const checked = document.getElementById('useCustomTemplate').checked;
  document.getElementById('customTemplate').disabled = !checked;
}

async function saveConfig() {
  const model = getModelValue();
  const selectedText = document.getElementById('modelSelect').selectedOptions[0].textContent;
  const config = {
    id: editingId || crypto.randomUUID(),
    name: selectedText,
    apiUrl: document.getElementById('apiUrl').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim(),
    model: model,
    systemPrompt: document.getElementById('systemPrompt').value.trim(),
    customTemplate: document.getElementById('customTemplate').value.trim(),
    useCustomTemplate: document.getElementById('useCustomTemplate').checked,
    responseTextPath: document.getElementById('responseTextPath').value.trim(),
    responseJsonPath: document.getElementById('responseJsonPath').value.trim()
  };

  if (!config.apiUrl) {
    showStatus('请填写 API 端点 URL', true);
    return;
  }
  if (!config.apiKey) {
    showStatus('请填写 API Key', true);
    return;
  }

  const result = await chrome.runtime.sendMessage({ type: 'SAVE_CONFIG', config });
  if (result?.ok) {
    showStatus('已保存', false);
    editingId = null;
    document.getElementById('formTitle').textContent = '新建配置';
    hideForm();
  } else {
    showStatus('保存失败', true);
  }
}

async function deleteConfig(id) {
  if (!confirm('确定要删除此配置吗？')) return;
  const result = await chrome.runtime.sendMessage({ type: 'DELETE_CONFIG', id });
  if (result?.ok) {
    if (editingId === id) { clearForm(); }
    loadConfigs();
  }
}

async function setActive(id) {
  await chrome.runtime.sendMessage({ type: 'SET_ACTIVE_CONFIG', id });
  loadConfigs();
}

async function testConnection() {
  const apiUrl = document.getElementById('apiUrl').value.trim();
  if (!apiUrl) {
    showStatus('请先填写 API 端点 URL', true);
    return;
  }

  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    showStatus('请先填写 API Key', true);
    return;
  }

  const statusEl = document.getElementById('saveStatus');
  statusEl.textContent = '测试中...';
  statusEl.className = 'save-status';

  const model = getModelValue();

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey.startsWith('Bearer ') ? apiKey : 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }]
      })
    });

    if (response.ok) {
      showStatus('连接成功 (' + response.status + ')', false);
    } else {
      const text = await response.text();
      showStatus('响应错误: ' + response.status + ' - ' + text.slice(0, 100), true);
    }
  } catch (err) {
    showStatus('连接失败: ' + err.message, true);
  }
}

function showStatus(msg, isError) {
  const el = document.getElementById('saveStatus');
  el.textContent = msg;
  el.className = 'save-status' + (isError ? ' error' : '');
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 5000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
