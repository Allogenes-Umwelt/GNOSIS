// Gnosis AI Chat Client

const messagesContainer = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const suggestionsContainer = document.getElementById('suggestions');
const tokenCounter = document.getElementById('tokenCounter');

let isWaiting = false;

const STORAGE_KEY = 'gnosisia_chat_messages';

// Suggestions
const SUGGESTIONS = [
  "Qué puedo hacer aquí?",
  "Dame un resumen general de la ultima sesion",
  "Cuantos vehiculos se importaron por marca?",
  "Cual es el precio promedio por marca?",
  "Cual es el estado de los cupos?",
  "Cuales son los top 10 modelos importados?",
  "Muestra el desglose de preferencia arancelaria",
  "Hay datos faltantes o errores?",
  "Muestra el seguimiento mensual de cupos"
];

function initSuggestions() {
  suggestionsContainer.innerHTML = '';
  SUGGESTIONS.forEach(text => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-btn';
    btn.textContent = text;
    btn.onclick = () => sendMessage(text);
    suggestionsContainer.appendChild(btn);
  });
}

function addMessage(text, role) {
  const div = document.createElement('div');
  div.className = `message message-${role}`;

  if (role === 'assistant') {
    div.innerHTML = renderMarkdown(text);
  } else {
    div.textContent = text;
  }

  messagesContainer.appendChild(div);

  if (role === 'assistant') {
    // Scroll al inicio del mensaje de Gnosis AI para leer desde arriba
    div.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Persistir en localStorage
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  stored.push({ role, text });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function renderMarkdown(text) {
  // La respuesta del modelo puede repetir texto de un documento (p.ej. un
  // campo "<img onerror=...>"). Se escapa ANTES del markdown: los tags que
  // insertamos luego (strong/em/table) son literales controlados; el
  // contenido del usuario/documento queda inerte. Sin esto se ejecutaría
  // y además se re-renderiza en cada carga desde localStorage.
  let html = escHtml(text);

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    return match;
  });

  // Convert markdown tables
  const lines = html.split('\n');
  let inTable = false;
  let tableHtml = '';
  let result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHtml = '<table>';
      }
      // Check if separator row
      if (line.match(/^\|[\s-:|]+\|$/)) {
        continue;
      }
      const cells = line.split('|').filter(c => c.trim() !== '');
      const isHeader = !inTable || (i + 1 < lines.length && lines[i + 1].trim().match(/^\|[\s-:|]+\|$/));
      const tag = isHeader && tableHtml === '<table>' ? 'th' : 'td';
      tableHtml += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
    } else {
      if (inTable) {
        tableHtml += '</table>';
        result.push(tableHtml);
        tableHtml = '';
        inTable = false;
      }
      result.push(line);
    }
  }
  if (inTable) {
    tableHtml += '</table>';
    result.push(tableHtml);
  }
  html = result.join('\n');

  // Headers (before line breaks so ^ and $ work)
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Code
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

async function sendMessage(text) {
  if (isWaiting) return;

  const message = text || chatInput.value.trim();
  if (!message) return;

  // Hide suggestions after first message
  suggestionsContainer.style.display = 'none';

  addMessage(message, 'user');
  chatInput.value = '';
  chatInput.style.height = 'auto';

  isWaiting = true;
  sendBtn.disabled = true;
  typingIndicator.classList.add('active');

  try {
    const resp = await fetch('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message })
    });

    const data = await resp.json();

    if (data.error) {
      addMessage('Error: ' + data.error, 'assistant');
    } else {
      addMessage(data.response, 'assistant');
      if (data.tokens) {
        tokenCounter.textContent =
          `Tokens: ${data.tokens.input || 0} in / ${data.tokens.output || 0} out | ` +
          `Sesion: ${data.tokens.total_session_input || 0} in / ${data.tokens.total_session_output || 0} out`;
      }
    }
  } catch (err) {
    addMessage('Error de conexion: ' + err.message, 'assistant');
  } finally {
    isWaiting = false;
    sendBtn.disabled = false;
    typingIndicator.classList.remove('active');
  }
}

async function resetChat() {
  try {
    await fetch('/api/v1/chat/reset', { method: 'POST' });
    localStorage.removeItem(STORAGE_KEY);
    messagesContainer.innerHTML = '';
    suggestionsContainer.style.display = 'flex';
    tokenCounter.textContent = '';
    addMessage('Hola, soy Gnosis·IA. Puedo analizar los datos de importaciones de vehículos de esta sesión. Selecciona una consulta o escribe la tuya.', 'assistant');
  } catch (err) {
    console.error('Error resetting chat:', err);
  }
}

// Event listeners
sendBtn.addEventListener('click', () => sendMessage());

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

// Initialize: restaurar mensajes guardados o mostrar bienvenida
initSuggestions();

const savedMessages = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
const hasUserMessages = savedMessages.some(m => m.role === 'user');
if (savedMessages.length > 0) {
  savedMessages.forEach(({ role, text }) => {
    const div = document.createElement('div');
    div.className = `message message-${role}`;
    if (role === 'assistant') {
      div.innerHTML = renderMarkdown(text);
    } else {
      div.textContent = text;
    }
    messagesContainer.appendChild(div);
  });
  applySupervisorVisibility();
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  if (hasUserMessages) suggestionsContainer.style.display = 'none';
} else {
  addMessage('Hola, soy Gnosis·IA. Puedo analizar los datos de importaciones de vehículos de esta sesión. Selecciona una consulta o escribe la tuya.', 'assistant');
}

// ===== Supervisor mode =====
const SUPERVISOR_KEY = 'gnosis_supervisor_enabled';

window.gnosisSupervisorEnabled = function() {
  return localStorage.getItem(SUPERVISOR_KEY) !== 'false';
};

function applySupervisorVisibility() {
  if (!window.gnosisSupervisorEnabled) return;
  const enabled = window.gnosisSupervisorEnabled();
  if (messagesContainer) messagesContainer.classList.toggle('hide-supervisor', !enabled);
  const btn = document.getElementById('supervisorBtn');
  if (btn) btn.classList.toggle('active', enabled);
}

window.gnosisSupervise = function(text) {
  const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const fullText = '[' + time + '] ' + text;
  const div = document.createElement('div');
  div.className = 'message message-supervisor';
  div.textContent = fullText;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  // Persist to localStorage using the same pattern as addMessage
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  stored.push({ role: 'supervisor', text: fullText });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  applySupervisorVisibility();
};

window.toggleSupervisor = function() {
  const next = !window.gnosisSupervisorEnabled();
  localStorage.setItem(SUPERVISOR_KEY, String(next));
  applySupervisorVisibility();
};

// Apply now (all definitions are ready at this point)
applySupervisorVisibility();
