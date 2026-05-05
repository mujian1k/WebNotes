const COLORS = ['#ffeaa7','#fd79a8','#a29bfe','#74b9ff','#55efc4','#81ecec','#fdcb6e','#e17055','#b2bec3'];
let notes = [];
let editingNoteId = null;
let draggedCard = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let currentColorIndex = 0;
let editingSubtasks = [];
let reminderTimeouts = {};
let completedToday = 0;
let isDraggingCard = false;
let currentCanvasStyle = 'plain';
let hasMovedWhileDragging = false;
let originalNoteData = null;
let countdownInterval = null;

function getTodayKey() { return new Date().toDateString(); }

function formatCountdown(ms) {
  if (ms <= 0) return '已到期';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (h > 0) return `${h}小时${Math.floor(m)}分钟`;
  if (m > 0) return `${Math.floor(m)}分钟`;
  return `${secs}秒`;
}

function loadData() {
  const d = localStorage.getItem('stickyNotes');
  if (d) {
    const parsed = JSON.parse(d);
    notes = parsed.notes || [];
    if (parsed.completedTodayDate !== getTodayKey()) {
      completedToday = 0;
    } else {
      completedToday = parsed.completedToday || 0;
    }
    currentCanvasStyle = parsed.canvasStyle || 'plain';
  }
}

function saveData() {
  localStorage.setItem('stickyNotes', JSON.stringify({ notes, completedToday, completedTodayDate: getTodayKey(), canvasStyle: currentCanvasStyle }));
}

function updateCompletedTodayDisplay() {
  document.getElementById('completedTodayCount').textContent = completedToday;
}

function updateTrashBadge() {
  const cnt = notes.filter(n => n.isCompleted).length;
  document.getElementById('trashBadge').textContent = cnt;
}

function updateCountdowns() {
  const now = Date.now();
  notes.filter(n => !n.isCompleted && n.reminder).forEach(note => {
    const countdownEl = document.getElementById('countdown-' + note.id);
    if (countdownEl) {
      const timeLeft = new Date(note.reminder).getTime() - now;
      countdownEl.textContent = formatCountdown(timeLeft);
      // 如果时间到了但还没触发，触发一次
      if (timeLeft <= 0 && !reminderTimeouts[note.id + '_triggered']) {
        reminderTimeouts[note.id + '_triggered'] = true;
        triggerReminder(note);
      }
    }
  });
}

function triggerReminder(note) {
  if (Notification.permission === 'granted') {
    new Notification('便签提醒', { body: note.title || '便签提醒', icon: '📝' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') new Notification('便签提醒', { body: note.title || '便签提醒', icon: '📝' });
    });
  }
}

function setupReminders() {
  const now = Date.now();
  // 清除所有旧的计时器
  Object.values(reminderTimeouts).forEach(t => clearTimeout(t));
  reminderTimeouts = {};
  
  notes.filter(n => !n.isCompleted && n.reminder).forEach(note => {
    const reminderTime = new Date(note.reminder).getTime();
    const timeLeft = reminderTime - now;
    if (timeLeft > 0) {
      reminderTimeouts[note.id] = setTimeout(() => {
        triggerReminder(note);
        delete reminderTimeouts[note.id];
      }, timeLeft);
    } else {
      // 时间已到，立即触发
      triggerReminder(note);
    }
  });
}

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

function randomPosition() {
  const canvas = document.getElementById('mainCanvas');
  const canvasRect = canvas.getBoundingClientRect();
  const w = canvasRect.width || window.innerWidth - 100;
  const h = canvasRect.height || window.innerHeight - 150;
  const minY = 60;
  const maxY = h - 250;
  return {
    x: 50 + Math.random() * (w - 330),
    y: minY + Math.random() * (maxY - minY)
  };
}

function createSampleNotes() {
  if (notes.length === 0) {
    const pos1 = randomPosition();
    notes.push({
      id: generateId(),
      title: '欢迎使用便签应用',
      content: '这是一个卡通风格的便签应用，支持拖拽、子任务、提醒等功能',
      subtasks: [
        { text: '尝试拖动这个便签', done: false, level: 0 },
        { text: '创建一个新便签', done: false, level: 0 },
        { text: '添加子任务试试', done: false, level: 0 }
      ],
      color: COLORS[0],
      reminder: null,
      isCompleted: false,
      position: pos1
    });
    const pos2 = randomPosition();
    notes.push({
      id: generateId(),
      title: '今日计划',
      content: '完成这个简单的演示便签',
      subtasks: [
        { text: '查看统计信息', done: false, level: 0 },
        { text: '导出数据', done: false, level: 0 },
        { text: '导入数据', done: false, level: 0 }
      ],
      color: COLORS[2],
      reminder: null,
      isCompleted: false,
      position: pos2
    });
    saveData();
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderProgress(note) {
  const total = note.subtasks.length;
  const done = note.subtasks.filter(s => s.done).length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  return `
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="progress-text">${pct}%</div>
  `;
}

function renderCards() {
  const canvas = document.getElementById('mainCanvas');
  canvas.innerHTML = '';
  notes.filter(n => !n.isCompleted).forEach((note, index) => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.id = 'card-' + note.id;
    card.style.left = note.position.x + 'px';
    card.style.top = note.position.y + 'px';
    card.style.zIndex = 100 + index;
    const headerBg = darkenColor(note.color, 25);
    card.innerHTML = `
      <div class="note-card-header" style="background:${headerBg};" data-noteid="${note.id}">
        <div class="card-title">${escapeHtml(note.title) || '无标题'}</div>
        <div class="card-radio ${note.isCompleted ? 'checked' : ''}" data-noteid="${note.id}"></div>
      </div>
      <div class="note-card-body">
        <div class="card-content">${escapeHtml(note.content)}</div>
        ${note.subtasks.length > 0 ? `
          <div class="subtask-list">
            ${note.subtasks.map((st, i) => `
              <div class="subtask-item ${st.done ? 'sub-done' : ''}">
                <div class="subtask-checkbox ${st.done ? 'checked' : ''}" data-noteid="${note.id}" data-stidx="${i}"></div>
                <span class="subtask-text">${escapeHtml(st.text)}</span>
              </div>
            `).join('')}
          </div>
          ${renderProgress(note)}
        ` : ''}
      </div>
      ${note.reminder ? `
        <div class="reminder-icon" title="提醒：${new Date(note.reminder).toLocaleString()}">🔔</div>
        <div class="countdown-display" id="countdown-${note.id}"></div>
      ` : ''}
    `;
    canvas.appendChild(card);
    card.addEventListener('mousedown', onCardMouseDown);
    card.addEventListener('click', onCardClick);
  });
  updateCountdowns(); // 渲染完卡片后立即更新倒计时
}

function darkenColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max((num >> 16) - amt, 0);
  const G = Math.max((num >> 8 & 0x00FF) - amt, 0);
  const B = Math.max((num & 0x0000FF) - amt, 0);
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function onCardMouseDown(e) {
  const header = e.target.closest('.note-card-header');
  if (header && header.contains(e.target) && !e.target.classList.contains('card-radio')) {
    const noteId = header.dataset.noteid;
    const card = document.getElementById('card-' + noteId);
    draggedCard = card;
    card.classList.add('dragging');
    card.style.zIndex = '1000';
    const rect = card.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    isDraggingCard = true;
    hasMovedWhileDragging = false;
    e.preventDefault();
  }
}

function onCardClick(e) {
  if (isDraggingCard && hasMovedWhileDragging) {
    isDraggingCard = false;
    hasMovedWhileDragging = false;
    return;
  }
  isDraggingCard = false;
  hasMovedWhileDragging = false;
  
  if (e.target.classList.contains('card-radio')) {
    const noteId = e.target.dataset.noteid;
    toggleNoteComplete(noteId);
    return;
  }
  if (e.target.classList.contains('subtask-checkbox')) {
    const noteId = e.target.dataset.noteid;
    const stIdx = parseInt(e.target.dataset.stidx);
    toggleSubtask(noteId, stIdx);
    return;
  }
  const card = e.target.closest('.note-card');
  if (card) {
    const noteId = card.id.replace('card-', '');
    openEditModal(noteId);
  }
}

function toggleNoteComplete(noteId) {
  const note = notes.find(n => n.id === noteId);
  if (!note) return;
  if (note.isCompleted) {
    note.isCompleted = false;
    if (completedToday > 0) completedToday--;
  } else {
    note.isCompleted = true;
    note.subtasks.forEach(s => s.done = true);
    if (!note.completedDate || note.completedDate !== getTodayKey()) {
      completedToday++;
      note.completedDate = getTodayKey();
    }
  }
  saveData();
  renderCards();
  updateCompletedTodayDisplay();
  updateTrashBadge();
}

function toggleSubtask(noteId, stIdx) {
  const note = notes.find(n => n.id === noteId);
  if (!note) return;
  note.subtasks[stIdx].done = !note.subtasks[stIdx].done;
  const allDone = note.subtasks.length > 0 && note.subtasks.every(s => s.done);
  if (allDone && !note.isCompleted) {
    note.isCompleted = true;
    if (!note.completedDate || note.completedDate !== getTodayKey()) {
      completedToday++;
      note.completedDate = getTodayKey();
    }
  }
  saveData();
  renderCards();
  updateCompletedTodayDisplay();
  updateTrashBadge();
}

function handleMouseMove(e) {
  if (draggedCard) {
    const canvas = document.getElementById('mainCanvas');
    const canvasRect = canvas.getBoundingClientRect();
    const cardRect = draggedCard.getBoundingClientRect();

    let newX = e.clientX - canvasRect.left - dragOffsetX;
    let newY = e.clientY - canvasRect.top - dragOffsetY;

    newX = Math.max(10, Math.min(newX, canvasRect.width - cardRect.width - 10));
    newY = Math.max(50, Math.min(newY, canvasRect.height - cardRect.height - 80));

    draggedCard.style.left = newX + 'px';
    draggedCard.style.top = newY + 'px';
    hasMovedWhileDragging = true;

    const allCards = Array.from(document.querySelectorAll('.note-card'));
    const draggedRect = draggedCard.getBoundingClientRect();
    let currentMaxZ = 100;

    allCards.forEach(card => {
      if (card !== draggedCard) {
        const rect = card.getBoundingClientRect();
        const overlaps = !(draggedRect.right < rect.left ||
                          draggedRect.left > rect.right ||
                          draggedRect.bottom < rect.top ||
                          draggedRect.top > rect.bottom);
        if (overlaps) {
          const cardZ = parseInt(card.style.zIndex) || 100;
          if (cardZ <= currentMaxZ) {
            card.style.zIndex = String(currentMaxZ);
            currentMaxZ++;
          } else {
            currentMaxZ = cardZ + 1;
          }
        }
      }
    });

    draggedCard.style.zIndex = String(currentMaxZ);
  }
}

function handleMouseUp(e) {
  if (draggedCard) {
    const noteId = draggedCard.id.replace('card-', '');
    const note = notes.find(n => n.id === noteId);
    if (note) {
      note.position = {
        x: parseInt(draggedCard.style.left),
        y: parseInt(draggedCard.style.top)
      };
      saveData();
    }
    draggedCard.classList.remove('dragging');
    draggedCard = null;
    setTimeout(() => {
      isDraggingCard = false;
      hasMovedWhileDragging = false;
    }, 50);
  }
}

function openModal(id) {
  document.getElementById(id).classList.add('show');
}

function closeModalById(id) {
  document.getElementById(id).classList.remove('show');
}

function hideAllModals() {
  ['manageModal','trashModal','statsModal','importExportModal','canvasModal','noteModal'].forEach(m => {
    document.getElementById(m).classList.remove('show');
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
}

function renderManagePanel() {
  const list = document.getElementById('manageList');
  list.innerHTML = notes.filter(n => !n.isCompleted).map(note => {
    const done = note.subtasks.filter(s => s.done).length;
    const total = note.subtasks.length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    let statusHtml;
    if (pct === 100 && total > 0) {
      statusHtml = '<span class="status-badge status-done">已完成</span>';
    } else if (pct > 0) {
      statusHtml = `<span class="status-badge status-progress">${pct}%</span>`;
    } else {
      statusHtml = '<span class="status-badge status-pending">未完成</span>';
    }
    return `
      <div class="panel-item" data-noteid="${note.id}">
        <div class="panel-item-title">${escapeHtml(note.title) || '无标题'}</div>
        <div class="panel-item-summary">${escapeHtml(note.content)}</div>
        <div class="panel-item-status">
          ${statusHtml}
          <div class="item-actions">
            <button class="item-action-btn delete" data-action="delete" data-noteid="${note.id}">删除</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.panel-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.dataset.action === 'delete') {
        const noteId = e.target.dataset.noteid;
        notes = notes.filter(n => n.id !== noteId);
        saveData();
        renderManagePanel();
        renderCards();
        updateTrashBadge();
      } else {
        openEditModal(item.dataset.noteid);
      }
    });
  });
}

function renderTrashPanel() {
  const list = document.getElementById('trashList');
  const trashNotes = notes.filter(n => n.isCompleted);
  if (trashNotes.length === 0) {
    list.innerHTML = '<div class="trash-empty">废纸篓是空的</div>';
    return;
  }
  list.innerHTML = trashNotes.map(note => `
    <div class="trash-card">
      <div class="trash-card-title">${escapeHtml(note.title) || '无标题'}</div>
      <div class="trash-card-actions">
        <button class="item-action-btn restore" data-noteid="${note.id}">恢复</button>
        <button class="item-action-btn delete" data-noteid="${note.id}">彻底删除</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.restore').forEach(btn => {
    btn.addEventListener('click', () => {
      const note = notes.find(n => n.id === btn.dataset.noteid);
      if (note) {
        note.isCompleted = false;
        const pos = randomPosition();
        note.position = pos;
        saveData();
        renderTrashPanel();
        renderCards();
        updateTrashBadge();
        updateCompletedTodayDisplay();
      }
    });
  });

  list.querySelectorAll('.delete').forEach(btn => {
    btn.addEventListener('click', () => {
      notes = notes.filter(n => n.id !== btn.dataset.noteid);
      saveData();
      renderTrashPanel();
      updateTrashBadge();
    });
  });
}

function renderStatsPanel() {
  const total = notes.length;
  const completed = notes.filter(n => n.isCompleted).length;
  const pending = total - completed;
  const rate = total > 0 ? Math.round(completed / total * 100) : 0;
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">总便签数</div></div>
    <div class="stat-card"><div class="stat-value">${pending}</div><div class="stat-label">未完成</div></div>
    <div class="stat-card"><div class="stat-value">${completedToday}</div><div class="stat-label">今日完成</div></div>
    <div class="stat-card"><div class="stat-value">${rate}%</div><div class="stat-label">整体完成率</div></div>
  `;
}

function exportData() {
  const data = JSON.stringify({ notes, completedToday, completedTodayDate: getTodayKey(), canvasStyle: currentCanvasStyle }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sticky-notes-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.notes) {
        if (confirm('导入将完全替换现有数据，确定继续吗？')) {
          notes = data.notes;
          completedToday = data.completedToday || 0;
          currentCanvasStyle = data.canvasStyle || 'plain';
          applyCanvasStyle(currentCanvasStyle);
          saveData();
          renderCards();
          updateCompletedTodayDisplay();
          updateTrashBadge();
          hideAllModals();
        }
      }
    } catch (err) {
      alert('无效的JSON文件');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function applyCanvasStyle(style) {
  const canvas = document.getElementById('mainCanvas');
  canvas.className = 'main-canvas canvas-' + style;
  document.querySelectorAll('.canvas-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.canvas === style);
  });
}

function showModal() { document.getElementById('noteModal').classList.add('show'); }
function hideModal() { document.getElementById('noteModal').classList.remove('show'); }

function checkNoteChanges() {
  if (!originalNoteData) return false;
  
  const title = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').value.trim();
  const hours = document.getElementById('reminderHours').value;
  const minutes = document.getElementById('reminderMinutes').value;
  const preset = document.getElementById('reminderPreset').value;
  
  if (title !== originalNoteData.title) return true;
  if (content !== originalNoteData.content) return true;
  if (currentColorIndex !== originalNoteData.colorIndex) return true;
  if (editingSubtasks.length !== originalNoteData.subtasks.length) return true;
  
  for (let i = 0; i < editingSubtasks.length; i++) {
    if (editingSubtasks[i].text !== originalNoteData.subtasks[i].text ||
        editingSubtasks[i].done !== originalNoteData.subtasks[i].done) {
      return true;
    }
  }
  
  if (preset || (hours && minutes)) return true;
  
  return false;
}

function handleCloseModal() {
  if (checkNoteChanges()) {
    if (confirm('您对便签内容做了更改，确定要取消保存吗？')) {
      hideModal();
      originalNoteData = null;
    }
  } else {
    hideModal();
    originalNoteData = null;
  }
}

function renderColorPicker() {
  const picker = document.getElementById('colorPicker');
  picker.innerHTML = COLORS.map((c, i) => `
    <div class="color-block ${i === currentColorIndex ? 'selected' : ''}" style="background:${c}" data-coloridx="${i}"></div>
  `).join('');
  picker.querySelectorAll('.color-block').forEach(block => {
    block.addEventListener('click', () => {
      currentColorIndex = parseInt(block.dataset.coloridx);
      renderColorPicker();
    });
  });
}

function renderSubtaskEditList() {
  const list = document.getElementById('subtaskEditList');
  list.innerHTML = editingSubtasks.map((s, i) => `
    <div class="subtask-edit-item" data-stidx="${i}">
      <span class="subtask-edit-text">${escapeHtml(s.text)}</span>
      <button class="subtask-delete-btn" data-stidx="${i}">✕</button>
    </div>
  `).join('');
  list.querySelectorAll('.subtask-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editingSubtasks.splice(parseInt(btn.dataset.stidx), 1);
      renderSubtaskEditList();
    });
  });
}

function addSubtaskFromInput() {
  const input = document.getElementById('subtaskInput');
  const text = input.value.trim();
  if (text) {
    editingSubtasks.push({ text, done: false, level: 0 });
    input.value = '';
    renderSubtaskEditList();
  }
}

function copyNote() {
  const title = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').value.trim();
  const newNote = {
    id: generateId(),
    title: (title || '无标题') + ' (副本)',
    content,
    subtasks: editingSubtasks.map(s => ({...s})),
    color: COLORS[currentColorIndex],
    reminder: null,
    isCompleted: false,
    position: randomPosition()
  };
  notes.push(newNote);
  saveData();
  renderCards();
  updateTrashBadge();
}

function deleteNoteFromModal() {
  if (!editingNoteId) return;
  if (confirm('确定要删除这个便签吗？')) {
    notes = notes.filter(n => n.id !== editingNoteId);
    saveData();
    renderCards();
    updateTrashBadge();
    hideModal();
    originalNoteData = null;
  }
}

function saveNoteFromModal() {
  const title = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').value.trim();
  const presetMinutes = parseInt(document.getElementById('reminderPreset').value);
  const hours = parseInt(document.getElementById('reminderHours').value) || 0;
  const minutes = parseInt(document.getElementById('reminderMinutes').value) || 0;
  
  let totalMinutes = 0;
  if (presetMinutes && presetMinutes > 0) {
    totalMinutes = presetMinutes;
  } else if (hours > 0 || minutes > 0) {
    totalMinutes = hours * 60 + minutes;
  }
  
  if (editingNoteId) {
    const note = notes.find(n => n.id === editingNoteId);
    if (note) {
      note.title = title;
      note.content = content;
      note.subtasks = editingSubtasks.map(s => ({...s}));
      note.color = COLORS[currentColorIndex];
      
      if (totalMinutes > 0) {
        const reminderTime = new Date(Date.now() + totalMinutes * 60000);
        note.reminder = reminderTime.toISOString();
        if (reminderTimeouts[editingNoteId]) clearTimeout(reminderTimeouts[editingNoteId]);
        reminderTimeouts[editingNoteId] = setTimeout(() => {
          if (Notification.permission === 'granted') {
            new Notification('便签提醒', { body: title || '便签提醒', icon: '📝' });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(perm => {
              if (perm === 'granted') new Notification('便签提醒', { body: title || '便签提醒', icon: '📝' });
            });
          }
          delete reminderTimeouts[editingNoteId];
        }, totalMinutes * 60000);
      } else {
        note.reminder = null;
        if (reminderTimeouts[editingNoteId]) {
          clearTimeout(reminderTimeouts[editingNoteId]);
          delete reminderTimeouts[editingNoteId];
        }
      }
    }
  } else {
    const pos = randomPosition();
    const newNote = {
      id: generateId(),
      title,
      content,
      subtasks: editingSubtasks.map(s => ({...s})),
      color: COLORS[currentColorIndex],
      reminder: null,
      isCompleted: false,
      position: pos
    };
    notes.push(newNote);
    
    if (totalMinutes > 0) {
      const noteId = newNote.id;
      newNote.reminder = new Date(Date.now() + totalMinutes * 60000).toISOString();
      reminderTimeouts[noteId] = setTimeout(() => {
        if (Notification.permission === 'granted') {
          new Notification('便签提醒', { body: title || '便签提醒', icon: '📝' });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(perm => {
            if (perm === 'granted') new Notification('便签提醒', { body: title || '便签提醒', icon: '📝' });
          });
        }
        delete reminderTimeouts[noteId];
      }, totalMinutes * 60000);
    }
  }
  saveData();
  renderCards();
  updateTrashBadge();
  hideModal();
  originalNoteData = null;
}

function openNewModal() {
  editingNoteId = null;
  editingSubtasks = [];
  currentColorIndex = 0;
  originalNoteData = null;
  document.getElementById('modalTitle').textContent = '新建便签';
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteContent').value = '';
  document.getElementById('reminderPreset').value = '';
  document.getElementById('reminderHours').value = '';
  document.getElementById('reminderMinutes').value = '';
  renderColorPicker();
  renderSubtaskEditList();
  showModal();
}

function openEditModal(noteId) {
  const note = notes.find(n => n.id === noteId);
  if (!note) return;
  
  editingNoteId = noteId;
  editingSubtasks = note.subtasks.map(s => ({...s}));
  currentColorIndex = COLORS.indexOf(note.color);
  if (currentColorIndex < 0) currentColorIndex = 0;
  
  originalNoteData = {
    title: note.title,
    content: note.content,
    colorIndex: currentColorIndex,
    subtasks: note.subtasks.map(s => ({...s}))
  };
  
  document.getElementById('modalTitle').textContent = '编辑便签';
  document.getElementById('noteTitle').value = note.title;
  document.getElementById('noteContent').value = note.content;
  // 如果有提醒时间，显示在输入框
  if (note.reminder) {
    const now = Date.now();
    const diff = note.reminder - now;
    if (diff > 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      document.getElementById('reminderHours').value = hours > 0 ? hours : '';
      document.getElementById('reminderMinutes').value = minutes > 0 ? minutes : '';
      document.getElementById('reminderPreset').value = '';
    }
  } else {
    document.getElementById('reminderPreset').value = '';
    document.getElementById('reminderHours').value = '';
    document.getElementById('reminderMinutes').value = '';
  }
  renderColorPicker();
  renderSubtaskEditList();
  showModal();
}

function emptyTrash() {
  if (confirm('确定要清空废纸篓吗？')) {
    notes = notes.filter(n => !n.isCompleted);
    saveData();
    renderTrashPanel();
    updateTrashBadge();
    closeModalById('trashModal');
  }
}

function initEventListeners() {
  document.getElementById('btnNew').addEventListener('click', openNewModal);

  document.getElementById('btnManage').addEventListener('click', () => {
    renderManagePanel();
    openModal('manageModal');
  });

  document.getElementById('btnStats').addEventListener('click', () => {
    renderStatsPanel();
    openModal('statsModal');
  });

  document.getElementById('btnImportExport').addEventListener('click', () => {
    openModal('importExportModal');
  });

  document.getElementById('btnCanvas').addEventListener('click', () => {
    openModal('canvasModal');
  });

  document.getElementById('btnTrash').addEventListener('click', () => {
    renderTrashPanel();
    openModal('trashModal');
  });

  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      hideAllModals();
    });
  });

  document.getElementById('closeNoteModal').addEventListener('click', handleCloseModal);

  document.getElementById('emptyTrash').addEventListener('click', emptyTrash);

  document.getElementById('btnExport').addEventListener('click', exportData);
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', importData);

  document.getElementById('addSubtask').addEventListener('click', addSubtaskFromInput);
  document.getElementById('subtaskInput').addEventListener('keypress', e => { if (e.key === 'Enter') addSubtaskFromInput(); });

  document.getElementById('btnCopy').addEventListener('click', copyNote);
  document.getElementById('btnDeleteNote').addEventListener('click', deleteNoteFromModal);
  document.getElementById('saveNote').addEventListener('click', saveNoteFromModal);

  document.querySelectorAll('.canvas-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCanvasStyle = btn.dataset.canvas;
      applyCanvasStyle(currentCanvasStyle);
      saveData();
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
      }
    });
  });

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

function init() {
  loadData();
  createSampleNotes();
  applyCanvasStyle(currentCanvasStyle);
  renderCards();
  updateCompletedTodayDisplay();
  updateTrashBadge();
  initEventListeners();
  
  // 设置提醒和倒计时
  setupReminders();
  updateCountdowns(); // 立即更新一次
  countdownInterval = setInterval(() => {
    updateCountdowns();
    // 每分钟重新检查一次提醒设置，防止浏览器冻结
    const now = Date.now();
    if (!setupReminders.lastCheck || now - setupReminders.lastCheck > 60000) {
      setupReminders.lastCheck = now;
      setupReminders();
    }
  }, 1000);
  
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

document.addEventListener('DOMContentLoaded', init);