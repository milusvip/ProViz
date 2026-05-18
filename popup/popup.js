let currentResult = null;

// 模型名称映射（确保显示可读名称）
const MODEL_LABELS = {
  'claude-sonnet-4-20250506': 'Claude Sonnet 4',
  'claude-opus-4-20250514': 'Claude Opus 4',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
  'claude-3-opus-20240229': 'Claude 3 Opus',
  'claude-3-haiku-20240307': 'Claude 3 Haiku',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4.1': 'GPT-4.1',
  'gpt-4.1-mini': 'GPT-4.1 Mini',
  'gpt-4.1-nano': 'GPT-4.1 Nano',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'qwen-vl-max': 'Qwen VL Max',
  'step-2': 'Step-2',
  'deepseek-vl2': 'DeepSeek VL2',
};

document.addEventListener('DOMContentLoaded', async () => {
  // 加载配置状态 + 显示模型名称
  const hasConfig = await loadActiveApiName();
  if (!hasConfig) {
    document.getElementById('noConfig').classList.remove('hidden');
  }

  // 事件绑定
  document.getElementById('apiIndicator').addEventListener('click', openOptions);
  document.getElementById('btnSettings').addEventListener('click', openOptions);
  document.getElementById('linkOptions').addEventListener('click', openOptions);
  document.getElementById('btnCopy').addEventListener('click', copyCurrent);
  document.getElementById('btnCopyAll').addEventListener('click', copyAll);
  document.getElementById('btnClearHistory').addEventListener('click', clearHistory);
  // Tab 切换
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 加载历史（会检查 pendingResult）
  await loadHistory();
});

// 加载配置并显示模型名称，返回是否有有效配置
async function loadActiveApiName() {
  try {
    const configs = await chrome.runtime.sendMessage({ type: 'GET_CONFIGS' });
    const { activeApiId } = await chrome.storage.sync.get('activeApiId');
    const active = (configs || []).find(c => c.id === activeApiId);
    const indicator = document.getElementById('apiIndicator');
    if (active) {
      const label = MODEL_LABELS[active.model] || active.name || active.model || '未命名';
      indicator.textContent = label;
      indicator.className = 'indicator-active';
      return true;
    } else if (configs && configs.length > 0) {
      indicator.textContent = '未激活 →';
      indicator.className = 'indicator-inactive';
      return false;
    } else {
      indicator.textContent = '+ 添加配置';
      indicator.className = 'indicator-inactive';
      return false;
    }
  } catch (e) {
    return false;
  }
}

async function loadHistory() {
  try {
    const { history, pendingResult } = await chrome.storage.local.get(['history', 'pendingResult']);
    const items = history || [];
    const list = document.getElementById('historyList');
    const clearBtn = document.getElementById('btnClearHistory');

    if (pendingResult) {
      showResult(pendingResult);
      chrome.storage.local.remove('pendingResult');
    }

    if (items.length === 0) {
      list.innerHTML = '<p style="color:#999;text-align:center;padding:12px;">暂无历史记录</p>';
      clearBtn.classList.add('hidden');
      return;
    }

    clearBtn.classList.remove('hidden');
    list.innerHTML = '';
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <div class="history-meta">
          <div class="history-text">${escapeHtml(item.textPrompt || '(空)')}</div>
          <div class="history-time">${formatTime(item.timestamp)}</div>
        </div>
      `;
      div.addEventListener('click', () => showResult(item));
      list.appendChild(div);
    });
  } catch (err) {
    console.error('加载历史失败:', err);
  }
}

function showResult(item) {
  currentResult = item;
  document.getElementById('noConfig').classList.add('hidden');
  document.getElementById('resultArea').classList.remove('hidden');
  document.getElementById('textPrompt').textContent = item.textPrompt || '(无文字提示词)';
  document.getElementById('jsonPrompt').textContent = item.jsonPrompt || '(无 JSON 提示词)';
  switchTab('text');
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.getElementById('textPrompt').classList.toggle('hidden', tabName !== 'text');
  document.getElementById('jsonPrompt').classList.toggle('hidden', tabName !== 'json');
}

function copyCurrent() {
  const activeTab = document.querySelector('.tab.active');
  const content = activeTab.dataset.tab === 'text'
    ? document.getElementById('textPrompt').textContent
    : document.getElementById('jsonPrompt').textContent;
  navigator.clipboard.writeText(content).then(() => showCopyToast('已复制'));
}

function copyAll() {
  if (!currentResult) return;
  const text = `【文字提示词】\n${currentResult.textPrompt}\n\n【JSON 提示词】\n${currentResult.jsonPrompt}`;
  navigator.clipboard.writeText(text).then(() => showCopyToast('已复制全部'));
}

function openOptions(e) {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
}

async function clearHistory() {
  await chrome.storage.local.set({ history: [] });
  loadHistory();
  document.getElementById('resultArea').classList.add('hidden');
  currentResult = null;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function showCopyToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}
