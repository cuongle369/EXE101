// ====== CONFIG ======
// Tự động chọn backend URL: local dev hoặc Render production
const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'https://ai-task-manager-backend.onrender.com';
const COLORS = ['#2563EB', '#7C3AED', '#EC4899', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#8B5CF6', '#F97316', '#14B8A6'];

// ====== STATE ======
let state = {
    currentUser: null, // Simple login name
    group: null,       // { id, name, invite_code, ... }
    member: null,      // { id, name, role, group_id }
    members: [],
    tasks: [],
    currentParsed: null,
    currentDistribution: null,
};

function saveLocal() {
    localStorage.setItem('aitm_state', JSON.stringify(state));
}

function loadLocal() {
    const s = localStorage.getItem('aitm_state');
    if (s) {
        try { Object.assign(state, JSON.parse(s)); } catch (e) { }
    }
}

// ====== API HELPERS ======
async function api(path, opts = {}) {
    const url = `${API}${path}`;
    const config = {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
    };
    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }
    const resp = await fetch(url, config);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `API Error: ${resp.status}`);
    }
    if (resp.status === 204) return null;
    return resp.json();
}

// ====== NAVIGATION ======
function switchScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(`screen-${name}`);
    if (screen) screen.classList.add('active');

    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.view === name);
    });
}

function navigateTo(view) {
    if (view === 'dashboard') {
        if (state.member && state.member.role === 'member') {
            switchScreen('mytasks');
            loadMyTasks();
        } else {
            switchScreen('dashboard');
            loadDashboard();
        }
    } else if (view === 'chat') {
        switchScreen('chat');
    } else if (view === 'team') {
        switchScreen('dashboard');
        loadDashboard();
    } else {
        switchScreen(view);
    }
}

function showMainApp() {
    document.getElementById('mainNav').style.display = 'flex';
    document.getElementById('headerRight').style.display = 'flex';

    if (state.member) {
        document.getElementById('userName').textContent = state.member.name;
        document.getElementById('userRole').textContent = state.member.role === 'leader' ? 'TRƯỞNG NHÓM' : 'THÀNH VIÊN';
    }

    if (state.member && state.member.role === 'member') {
        navigateTo('dashboard');
    } else {
        navigateTo('dashboard');
    }
}

// ====== SCREEN 0 & 1: LOGIN & ROLE SELECT ======
function handleLogin() {
    const name = document.getElementById('loginNameInput').value.trim();
    if (!name) return showToast('⚠ Vui lòng nhập tên hiển thị của bạn');

    state.currentUser = name;
    saveLocal();
    switchScreen('role');
}

function showCreateGroupForm() {
    document.getElementById('createGroupModal').classList.add('active');
    document.getElementById('groupNameInput').focus();
    if (state.currentUser) {
        document.getElementById('leaderNameInput').value = state.currentUser;
    }
}

function showJoinGroupModal() {
    document.getElementById('joinGroupModal').classList.add('active');
    document.getElementById('joinCodeInput').focus();
    if (state.currentUser) {
        document.getElementById('memberNameInput').value = state.currentUser;
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

async function createGroup() {
    const name = document.getElementById('groupNameInput').value.trim();
    const leaderName = document.getElementById('leaderNameInput').value.trim();
    if (!name) return showToast('⚠ Vui lòng nhập tên nhóm');
    if (!leaderName) return showToast('⚠ Vui lòng nhập tên của bạn');

    try {
        const group = await api('/api/groups', { method: 'POST', body: { name } });
        state.group = group;

        // Add leader as first member
        const member = await api(`/api/groups/${group.id}/members`, {
            method: 'POST',
            body: { name: leaderName, role: 'leader' },
        });
        state.member = member;
        saveLocal();

        closeModal('createGroupModal');
        showInviteScreen(group.invite_code, group.name);
    } catch (e) {
        showToast('❌ ' + e.message);
    }
}

async function joinGroup() {
    const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
    const memberName = document.getElementById('memberNameInput').value.trim();
    if (!code || code.length < 6) return showToast('⚠ Mã mời phải có 6 ký tự');
    if (!memberName) return showToast('⚠ Vui lòng nhập tên của bạn');

    try {
        const group = await api('/api/groups/join', { method: 'POST', body: { invite_code: code } });
        state.group = group;

        // Add as member
        const member = await api(`/api/groups/${group.id}/members`, {
            method: 'POST',
            body: { name: memberName, role: 'member' },
        });
        state.member = member;
        saveLocal();

        closeModal('joinGroupModal');
        showToast('✅ Đã tham gia nhóm: ' + group.name);
        showMainApp();
    } catch (e) {
        showToast('❌ ' + e.message);
    }
}

// ====== SCREEN 2: INVITE CODE ======
function showInviteScreen(code, groupName) {
    switchScreen('invite');
    document.getElementById('inviteGroupName').textContent = groupName;

    // Render code digits
    const display = document.getElementById('inviteCodeDisplay');
    display.innerHTML = '';
    const chars = code.split('');
    chars.forEach((c, i) => {
        if (i === 3) {
            display.innerHTML += '<div class="separator">-</div>';
        }
        display.innerHTML += `<div class="digit">${c}</div>`;
    });

    // QR Code
    const qrDiv = document.getElementById('qrCode');
    qrDiv.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
        new QRCode(qrDiv, {
            text: `${window.location.origin}?invite=${code}`,
            width: 150,
            height: 150,
            colorDark: '#1E293B',
            colorLight: '#FFFFFF',
        });
    }
}

function copyInviteCode() {
    if (state.group) {
        navigator.clipboard.writeText(state.group.invite_code);
        showToast('✅ Đã sao chép mã mời!');
    }
}

function shareInvite() {
    if (navigator.share && state.group) {
        navigator.share({
            title: 'AI Task Manager - Mời tham gia nhóm',
            text: `Tham gia nhóm "${state.group.name}" bằng mã: ${state.group.invite_code}`,
        });
    } else {
        copyInviteCode();
    }
}

function finishInvite() {
    showMainApp();
}

// ====== SCREEN 3: AI CHAT + CANVAS ======
let pendingTaskText = '';

function addUserMsg(text) {
    const msgs = document.getElementById('chatMessages');
    msgs.innerHTML += `<div class="msg msg-user">${esc(text)}</div>`;
    scrollChat();
}

function addAIMsg(html, actions = '') {
    const msgs = document.getElementById('chatMessages');
    msgs.innerHTML += `
        <div class="msg msg-ai">
            <div class="msg-sender">🤖 AI Assistant</div>
            ${html}
            ${actions ? `<div class="msg-actions">${actions}</div>` : ''}
        </div>
    `;
    scrollChat();
}

function addTyping() {
    const msgs = document.getElementById('chatMessages');
    msgs.innerHTML += `<div class="msg msg-typing" id="typingIndicator"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    scrollChat();
}

function removeTyping() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
}

function scrollChat() {
    const msgs = document.getElementById('chatMessages');
    setTimeout(() => msgs.scrollTop = msgs.scrollHeight, 50);
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    let text = input.value.trim();
    if (!text) return;
    input.value = '';

    addUserMsg(text);
    addTyping();

    try {
        const apiKey = getApiKey();

        // If the AI previously asked for clarification, merge the old text with the new input
        // so the AI has full context (e.g. "sấy 50 tấn" + "trước ngày 30")
        if (state.currentParsed && state.currentParsed.needs_clarification) {
            text = pendingTaskText + " " + text;
            pendingTaskText = text; // Update pending text to the combined version
        } else {
            pendingTaskText = text; // New standalone task
        }

        const body = { text };
        if (apiKey) body.api_key = apiKey;

        const parsed = await api('/api/ai/parse', { method: 'POST', body });
        removeTyping();

        state.currentParsed = parsed;

        // Check if we have members
        if (state.group) {
            const members = await api(`/api/groups/${state.group.id}/members`);
            state.members = members;
        }

        // Calculate distribution preview
        let distPreview = [];
        if (state.members.length > 0) {
            if (parsed.quantity_number) {
                const perPerson = parsed.quantity_number / state.members.length;
                const rounded = Math.round(perPerson * 100) / 100;
                const unit = parsed.unit || '';
                distPreview = state.members.map(m => ({
                    member_id: m.id,
                    member_name: m.name,
                    assigned_amount: `${Number.isInteger(rounded) ? rounded : rounded} ${unit}`.trim(),
                }));
            } else {
                distPreview = state.members.map(m => ({
                    member_id: m.id,
                    member_name: m.name,
                    assigned_amount: 'Phần việc được giao',
                }));
            }
        }
        state.currentDistribution = distPreview;

        if (parsed.needs_clarification) {
            addAIMsg(
                `<p>${esc(parsed.description || 'Bạn có thể bổ sung thêm thông tin không?')}</p>
                 <p style="font-size:0.85rem;color:var(--text-muted);margin-top:6px">💡 Bạn cũng có thể điền trực tiếp trên bảng Canvas bên phải.</p>`,
                `<button class="btn btn-sm btn-outline" onclick="cancelTask()">↩ Hủy bỏ</button>`
            );
        } else {
            addAIMsg(
                `<p>Tôi đã cấu trúc xong nhiệm vụ <strong>${esc(parsed.title)}</strong>. Bạn có thể chỉnh sửa ở bảng Canvas bên phải.</p>`,
                `<button class="btn btn-sm btn-outline" onclick="cancelTask()">↩ Hủy bỏ</button>`
            );
        }

        renderCanvas(parsed, distPreview);

        // If the task is fully parsed and good to go, clear the clarification state
        if (!parsed.needs_clarification) {
            pendingTaskText = '';
        }

    } catch (e) {
        removeTyping();
        addAIMsg(`<p>❌ Có lỗi xảy ra: ${esc(e.message)}</p>`);
    }
}

function renderCanvas(parsed, dist) {
    const canvas = document.getElementById('canvasContent');
    const empty = document.getElementById('canvasEmpty');
    empty.style.display = 'none';
    canvas.style.display = 'block';

    const assigneeHtml = dist.length > 0
        ? dist.map(d => `<span class="canvas-assignee-tag">🔵 ${esc(d.member_name)} (${esc(d.assigned_amount)})</span>`).join('')
        : '<span class="canvas-assignee-tag">+ Thêm người</span>';

    const priorityOptions = ['high', 'medium', 'low'].map(p => {
        const label = p === 'high' ? '🚩 Cao' : p === 'low' ? '🏷 Thấp' : '🏷 Trung bình';
        const sel = (parsed.priority || 'medium') === p ? 'selected' : '';
        return `<option value="${p}" ${sel}>${label}</option>`;
    }).join('');

    canvas.innerHTML = `
        <div class="canvas-card">
            <div class="canvas-card-header">
                <span class="icon">📋</span>
                <div>
                    <h3>Task Canvas</h3>
                    <div class="sub">Drafting Task • Có thể chỉnh sửa trước khi giao</div>
                </div>
            </div>

            <div class="canvas-label">TIÊU ĐỀ NHIỆM VỤ</div>
            <input type="text" id="canvasTitle" class="canvas-input canvas-input-lg" value="${esc(parsed.title)}" placeholder="Tiêu đề nhiệm vụ">

            <div class="canvas-row">
                <div>
                    <div class="canvas-label">HẠN CHÓT</div>
                    <input type="text" id="canvasDeadline" class="canvas-input" value="${esc(parsed.deadline || '')}" placeholder="VD: ngày 30">
                </div>
                <div>
                    <div class="canvas-label">ĐỘ ƯU TIÊN</div>
                    <select id="canvasPriority" class="canvas-input">${priorityOptions}</select>
                </div>
            </div>

            <div class="canvas-row">
                <div>
                    <div class="canvas-label">SỐ LƯỢNG</div>
                    <input type="number" id="canvasQtyNum" class="canvas-input" value="${parsed.quantity_number || ''}" placeholder="VD: 50">
                </div>
                <div>
                    <div class="canvas-label">ĐƠN VỊ</div>
                    <input type="text" id="canvasUnit" class="canvas-input" value="${esc(parsed.unit || '')}" placeholder="VD: tấn, bao">
                </div>
            </div>

            <div class="canvas-label">CHI TIẾT CÔNG VIỆC</div>
            <textarea id="canvasDesc" class="canvas-input canvas-textarea" rows="3" placeholder="Mô tả chi tiết...">${esc(parsed.needs_clarification ? pendingTaskText : (parsed.description || pendingTaskText))}</textarea>

            <div class="canvas-assignees">
                <div class="canvas-label">NGƯỜI THỰC HIỆN</div>
                ${assigneeHtml}
            </div>

            <div class="canvas-footer">
                <div class="hint">ℹ Bạn có thể chỉnh sửa các trường trên trước khi giao việc.</div>
                <button class="btn btn-primary" onclick="confirmTask()">✅ Giao việc ngay</button>
            </div>
        </div>
    `;
}

async function confirmTask() {
    if (!state.group) return;

    // Read values from editable canvas inputs
    const title = document.getElementById('canvasTitle')?.value.trim();
    const deadline = document.getElementById('canvasDeadline')?.value.trim();
    const priority = document.getElementById('canvasPriority')?.value || 'medium';
    const qtyNum = parseFloat(document.getElementById('canvasQtyNum')?.value) || null;
    const unit = document.getElementById('canvasUnit')?.value.trim() || null;
    const description = document.getElementById('canvasDesc')?.value.trim();

    if (!title) return showToast('⚠ Vui lòng nhập tiêu đề nhiệm vụ');

    const quantity = qtyNum && unit ? `${qtyNum} ${unit}` : (qtyNum ? `${qtyNum}` : null);

    try {
        const result = await api(`/api/groups/${state.group.id}/tasks`, {
            method: 'POST',
            body: {
                title,
                description: description || pendingTaskText,
                quantity,
                quantity_number: qtyNum,
                unit,
                deadline: deadline || null,
                priority,
            },
        });

        addAIMsg(`<p>✅ Đã tạo nhiệm vụ <strong>${esc(title)}</strong> và phân bổ cho ${result.distribution.length} thành viên!</p>`);
        resetCanvas();
        state.currentParsed = null;
        state.currentDistribution = null;
        showToast('✅ Đã giao việc thành công!');
    } catch (e) {
        showToast('❌ ' + e.message);
    }
}

function cancelTask() {
    resetCanvas();
    state.currentParsed = null;
    state.currentDistribution = null;
    addAIMsg('<p>Đã hủy. Bạn có thể nhập lại yêu cầu mới.</p>');
}

function resetCanvas() {
    document.getElementById('canvasContent').style.display = 'none';
    document.getElementById('canvasEmpty').style.display = 'flex';
}

// ====== SCREEN 4: DASHBOARD LEADER ======
async function loadDashboard() {
    if (!state.group) return;

    try {
        const data = await api(`/api/groups/${state.group.id}/dashboard`);

        document.getElementById('dashGroupName').textContent = data.group_name;
        document.getElementById('dashTitle').textContent = data.group_name;
        document.getElementById('dashInviteCode').textContent = data.invite_code;

        // Progress ring
        const pct = Math.round(data.completion_percent);
        document.getElementById('progressPercent').textContent = pct + '%';
        const ring = document.getElementById('progressRing');
        const circumference = 2 * Math.PI * 65;
        ring.style.strokeDasharray = circumference;
        ring.style.strokeDashoffset = circumference - (pct / 100) * circumference;

        // Stats
        document.getElementById('statTotal').textContent = data.total_tasks;
        document.getElementById('statProgress').textContent = data.in_progress;

        // Members
        const memberDiv = document.getElementById('memberList');
        memberDiv.innerHTML = data.members.map((m, i) => `
            <div class="member-item">
                <div class="member-avatar" style="background:${COLORS[i % COLORS.length]}">${m.name.charAt(0)}</div>
                <div class="member-info">
                    <div class="member-name">${esc(m.name)}</div>
                </div>
                <div class="member-perf">${m.performance_percent}% Hiệu suất</div>
            </div>
        `).join('');

        // Tasks grouped by status
        const taskDiv = document.getElementById('taskListDashboard');
        const inProgress = data.tasks.filter(t => t.status !== 'done');
        const done = data.tasks.filter(t => t.status === 'done');

        let html = '';

        if (inProgress.length > 0) {
            html += `
                <div class="task-section">
                    <div class="task-section-header">
                        <div class="task-section-title">📋 Công việc đang thực hiện</div>
                        <div class="task-section-count">${inProgress.length} Đang chạy</div>
                    </div>
                    <div class="task-cards">
                        ${inProgress.map(t => renderTaskCard(t, data.members)).join('')}
                    </div>
                </div>
            `;
        }

        if (done.length > 0) {
            html += `
                <div class="task-section">
                    <div class="task-section-header">
                        <div class="task-section-title">✅ Đã hoàn thành</div>
                        <div class="task-section-count">${done.length} task</div>
                    </div>
                    <div class="task-cards">
                        ${done.map(t => renderTaskCard(t, data.members)).join('')}
                    </div>
                </div>
            `;
        }

        if (data.tasks.length === 0) {
            html = `
                <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
                    <div style="font-size:3rem;margin-bottom:12px">📋</div>
                    <h3 style="color:var(--text-secondary)">Chưa có công việc nào</h3>
                    <p>Sử dụng AI Chat để tạo công việc mới.</p>
                    <button class="btn btn-primary" style="margin-top:16px" onclick="navigateTo('chat')">+ Thêm công việc bằng AI</button>
                </div>
            `;
        }

        taskDiv.innerHTML = html;
        state.tasks = data.tasks;
        state.members = data.members;

    } catch (e) {
        showToast('❌ Không thể tải dashboard: ' + e.message);
    }
}

function renderTaskCard(task, members) {
    const doneCount = task.assignments.filter(a => a.status === 'done').length;
    const totalCount = task.assignments.length;
    const progressPct = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
    const priorityBadge = task.priority === 'high' ? '<span class="badge badge-high">CAO</span>'
        : task.priority === 'low' ? '<span class="badge badge-low">THẤP</span>'
            : '<span class="badge badge-medium">TRUNG BÌNH</span>';

    const avatarHtml = task.assignments.slice(0, 3).map((a, i) => {
        const color = COLORS[(a.member_id - 1) % COLORS.length];
        return `<div class="mini-avatar" style="background:${color}">${a.member_name.charAt(0)}</div>`;
    }).join('');
    const extra = task.assignments.length > 3 ? `<div class="mini-avatar" style="background:var(--text-muted)">+${task.assignments.length - 3}</div>` : '';

    return `
        <div class="task-card" onclick="openTaskDetail(${task.id})">
            <div class="task-card-header">
                <div class="task-card-title">${esc(task.title)}</div>
                ${priorityBadge}
            </div>
            <div class="task-card-deadline">${task.deadline ? 'Hạn chót: ' + esc(task.deadline) : ''}</div>
            ${task.quantity ? `
                <div class="task-card-quantity">
                    <span>Khối lượng</span>
                    <span>${esc(task.quantity)}</span>
                </div>
                <div class="task-card-progress">
                    <div class="task-card-progress-fill" style="width:${progressPct}%"></div>
                </div>
            ` : ''}
            <div class="task-card-footer">
                <div class="task-card-avatars">${avatarHtml}${extra}</div>
            </div>
        </div>
    `;
}

// ====== SCREEN 5: MY TASKS (MEMBER) ======
async function loadMyTasks() {
    if (!state.group || !state.member) return;

    try {
        const tasks = await api(`/api/groups/${state.group.id}/members/${state.member.id}/tasks`);

        const overdue = tasks.filter(t => t.assignment_status === 'pending' && t.priority === 'high');
        const inProgress = tasks.filter(t => t.assignment_status === 'progress' || (t.assignment_status === 'pending' && t.priority !== 'high'));
        const done = tasks.filter(t => t.assignment_status === 'done');

        const html = [
            renderMyTaskSection('⚠ Việc ưu tiên cao', overdue, 'overdue'),
            renderMyTaskSection('📋 Việc hôm nay', inProgress, 'inprogress'),
            renderMyTaskSection('✅ Đã hoàn thành', done, 'done'),
        ].join('');

        document.getElementById('myTasksList').innerHTML = html || `
            <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
                <div style="font-size:3rem;margin-bottom:12px">✨</div>
                <h3 style="color:var(--text-secondary)">Chưa có công việc nào</h3>
                <p>Bạn sẽ nhận được thông báo khi có việc mới.</p>
            </div>
        `;
    } catch (e) {
        showToast('❌ ' + e.message);
    }
}

function renderMyTaskSection(title, tasks, type) {
    if (tasks.length === 0) return '';

    const titleClass = type === 'overdue' ? 'overdue' : '';
    const cards = tasks.map(t => {
        const cardClass = type === 'overdue' ? 'overdue' : type === 'inprogress' ? 'inprogress' : 'upcoming';
        const statusLabel = t.assignment_status === 'progress' ? 'ĐANG THỰC HIỆN'
            : t.assignment_status === 'done' ? 'HOÀN THÀNH'
                : t.priority === 'high' ? 'ƯU TIÊN CAO' : 'CHƯA BẮT ĐẦU';
        const statusClass = t.assignment_status === 'progress' ? 'status-progress'
            : t.assignment_status === 'done' ? 'status-progress'
                : t.priority === 'high' ? 'status-overdue' : 'status-pending';

        let actionBtn = '';
        if (t.assignment_status === 'pending') {
            actionBtn = `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();updateAssignment(${t.assignment_id}, 'progress')">Bắt đầu ▶</button>`;
        } else if (t.assignment_status === 'progress') {
            actionBtn = `<button class="btn btn-sm btn-success" onclick="event.stopPropagation();updateAssignment(${t.assignment_id}, 'done')">Hoàn thành ✓</button>`;
        }

        return `
            <div class="mytask-card ${cardClass}" onclick="openTaskDetail(${t.task_id})">
                <div class="mytask-card-status ${statusClass}">${statusLabel}</div>
                <div class="mytask-card-title">${esc(t.task_title)}</div>
                <div class="mytask-card-amount">Phần của bạn: <strong>${esc(t.assigned_amount)}</strong></div>
                ${t.deadline ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px">Hạn chót: ${esc(t.deadline)}</div>` : ''}
                <div class="mytask-card-actions">${actionBtn}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="mytask-section">
            <div class="mytask-section-header">
                <div class="mytask-section-title ${titleClass}">${title}</div>
                <div class="mytask-section-badge">${tasks.length} Nhiệm vụ</div>
            </div>
            ${cards}
        </div>
    `;
}

async function updateAssignment(assignmentId, status) {
    try {
        await api(`/api/assignments/${assignmentId}/status`, {
            method: 'PATCH',
            body: { status },
        });
        showToast('✅ Đã cập nhật trạng thái!');
        // Reload current view
        if (state.member && state.member.role === 'member') {
            loadMyTasks();
        } else {
            loadDashboard();
        }
    } catch (e) {
        showToast('❌ ' + e.message);
    }
}

// ====== SCREEN 6: TASK DETAILS ======
async function openTaskDetail(taskId) {
    try {
        const task = await api(`/api/tasks/${taskId}`);
        switchScreen('taskdetail');

        // Main content
        const main = document.getElementById('taskDetailMain');
        const statusTabs = ['pending', 'progress', 'done'].map(s => {
            const label = s === 'pending' ? 'Chưa bắt đầu' : s === 'progress' ? 'Đang làm' : 'Hoàn thành';
            return `<button class="td-status-tab ${task.status === s ? 'active' : ''}" onclick="updateTaskStatus(${task.id}, '${s}')">${label}</button>`;
        }).join('');

        const priorityFlag = task.priority === 'high' ? '🚩 Cao' : task.priority === 'low' ? '🏷 Thấp' : '🏷 Trung bình';
        const priorityColor = task.priority === 'high' ? 'var(--danger)' : task.priority === 'low' ? 'var(--primary)' : 'var(--warning)';

        main.innerHTML = `
            <div class="td-breadcrumb">Công việc của tôi › ${esc(task.title)}</div>
            <h2 class="td-title">${esc(task.title)}</h2>
            <div class="td-status-tabs">${statusTabs}</div>
            <div class="td-meta-grid">
                <div class="td-meta-item">
                    <div class="td-meta-label">Người thực hiện</div>
                    <div class="td-meta-value">${task.assignments.map(a => esc(a.member_name)).join(', ') || 'Không có'}</div>
                </div>
                <div class="td-meta-item">
                    <div class="td-meta-label">Hạn chót</div>
                    <div class="td-meta-value">📅 ${esc(task.deadline || 'Chưa định')}</div>
                </div>
                <div class="td-meta-item">
                    <div class="td-meta-label">Độ ưu tiên</div>
                    <div class="td-meta-value" style="color:${priorityColor}">${priorityFlag}</div>
                </div>
            </div>
            <div class="td-section-title">Mô tả công việc</div>
            <div class="td-description">${esc(task.description || 'Không có mô tả.')}</div>

            <div style="margin-top:24px">
                <div class="td-section-title">Phân bổ công việc</div>
                ${task.assignments.map((a, i) => `
                    <div class="member-item">
                        <div class="member-avatar" style="background:${COLORS[i % COLORS.length]}">${a.member_name.charAt(0)}</div>
                        <div class="member-info">
                            <div class="member-name">${esc(a.member_name)}</div>
                            <div style="font-size:0.82rem;color:var(--text-muted)">${esc(a.assigned_amount)}</div>
                        </div>
                        <span class="badge ${a.status === 'done' ? 'badge-active' : a.status === 'progress' ? 'badge-medium' : ''}">${a.status === 'done' ? 'Hoàn thành' : a.status === 'progress' ? 'Đang làm' : 'Chưa bắt đầu'}</span>
                    </div>
                `).join('')}
            </div>

            </div>

            <div style="margin-top:16px;display:flex;gap:10px">
                <button class="btn btn-outline" onclick="navigateTo('dashboard')">← Quay lại</button>
                ${state.member && state.member.role === 'leader' ? `
                <button class="btn btn-primary" onclick="openEditTask(${task.id}, '${esc(task.title).replace(/'/g, "\\'")}', '${esc(task.description || '').replace(/'/g, "\\'")}', '${esc(task.deadline || '').replace(/'/g, "\\'")}', '${task.priority}', '${task.assignments.map(a => a.member_id).join(',')}')">✏️ Chỉnh sửa</button>
                <button class="btn btn-danger btn-sm" onclick="deleteTask(${task.id})">🗑 Xóa</button>
                ` : ''}
            </div>
        `;

        // Discussion sidebar
        const sidebar = document.getElementById('taskDetailSidebar');
        sidebar.innerHTML = `
            <div class="td-discussion-header">💬 Thảo luận</div>
            <div class="td-msgs">
                <div class="td-ai-suggestion">
                    <div class="td-ai-suggestion-header">✨ AI Suggestion</div>
                    <div class="td-ai-suggestion-text">
                        ${task.assignments.length > 0
                ? `Công việc này đã được phân bổ cho ${task.assignments.length} người. Mỗi người được giao: ${esc(task.assignments[0].assigned_amount)}.`
                : 'Chưa có phân bổ nào cho task này.'
            }
                    </div>
                </div>
            </div>
        `;

    } catch (e) {
        showToast('❌ ' + e.message);
    }
}

async function updateTaskStatus(taskId, status) {
    try {
        await api(`/api/tasks/${taskId}/status`, {
            method: 'PATCH',
            body: { status },
        });
        openTaskDetail(taskId);
        showToast('✅ Đã cập nhật trạng thái!');
    } catch (e) {
        showToast('❌ ' + e.message);
    }
}

// ====== EDIT TASK (Leader) ======
async function openEditTask(taskId, title, description, deadline, priority, assignedMemberIdsStr) {
    document.getElementById('editTaskId').value = taskId;
    document.getElementById('editTaskTitle').value = title;
    document.getElementById('editTaskDesc').value = description;
    document.getElementById('editTaskDeadline').value = deadline;
    document.getElementById('editTaskPriority').value = priority;

    const assignedIds = assignedMemberIdsStr ? assignedMemberIdsStr.split(',').map(Number) : [];

    // Fetch group members if missing
    if (state.group && state.members.length === 0) {
        state.members = await api(`/api/groups/${state.group.id}/members`);
    }

    // Render member checkboxes
    const membersContainer = document.getElementById('editTaskMembers');
    membersContainer.innerHTML = state.members.map(m => `
        <label style="display:flex;align-items:center;gap:6px;background:var(--bg);padding:6px 12px;border-radius:20px;border:1px solid var(--border);cursor:pointer;font-weight:500;font-size:0.85rem;">
            <input type="checkbox" class="edit-member-cb" value="${m.id}" ${assignedIds.includes(m.id) ? 'checked' : ''}>
            ${esc(m.name)}
        </label>
    `).join('');

    document.getElementById('editTaskModal').classList.add('active');
    document.getElementById('editTaskTitle').focus();
}

async function saveEditTask() {
    const taskId = document.getElementById('editTaskId').value;
    const title = document.getElementById('editTaskTitle').value.trim();
    const description = document.getElementById('editTaskDesc').value.trim();
    const deadline = document.getElementById('editTaskDeadline').value.trim();
    const priority = document.getElementById('editTaskPriority').value;

    const memberCheckboxes = document.querySelectorAll('.edit-member-cb:checked');
    const member_ids = Array.from(memberCheckboxes).map(cb => parseInt(cb.value));

    if (!title) return showToast('⚠ Tiêu đề không được để trống');

    try {
        await api(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            body: { title, description: description || null, deadline: deadline || null, priority, member_ids },
        });
        closeModal('editTaskModal');
        showToast('✅ Đã cập nhật công việc!');
        openTaskDetail(parseInt(taskId));
    } catch (e) {
        showToast('❌ ' + e.message);
    }
}

async function deleteTask(taskId) {
    if (!confirm('Bạn có chắc muốn xóa công việc này? Thao tác này không thể hoàn tác.')) return;

    try {
        await api(`/api/tasks/${taskId}`, { method: 'DELETE' });
        showToast('✅ Đã xóa công việc!');
        navigateTo('dashboard');
    } catch (e) {
        showToast('❌ ' + e.message);
    }
}

// ====== SETTINGS ======
function openSettings() {
    document.getElementById('settingsModal').classList.add('active');
    const key = getApiKey();
    document.getElementById('apiKeyInput').value = key || '';
    document.getElementById('apiKeyStatus').textContent = key ? '🟢 Đã cấu hình' : '🔴 Chưa có key';
}

function saveApiKey() {
    const key = document.getElementById('apiKeyInput').value.trim();
    localStorage.setItem('aitm_api_key', key);
    document.getElementById('apiKeyStatus').textContent = key ? '🟢 Đã lưu!' : '🔴 Đã xóa key';
    showToast('✅ Đã lưu API Key');
}

function getApiKey() {
    return localStorage.getItem('aitm_api_key') || '';
}

// ====== LOGOUT ======
function logout() {
    localStorage.removeItem('aitm_state');
    localStorage.removeItem('aitm_api_key');
    state = { currentUser: null, group: null, member: null, members: [], tasks: [], currentParsed: null, currentDistribution: null };
    document.getElementById('mainNav').style.display = 'none';
    document.getElementById('headerRight').style.display = 'none';
    switchScreen('login');
    showToast('👋 Đã đăng xuất!');
}

// ====== UTILS ======
function esc(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
    loadLocal();
    if (state.group && state.member) {
        showMainApp();
    } else if (state.currentUser) {
        switchScreen('role');
    } else {
        switchScreen('login');
    }

    // Enter key for chat
    document.getElementById('chatInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') sendMessage();
    });

    // Enter key for modals & login
    document.getElementById('loginNameInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    document.getElementById('groupNameInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') createGroup(); });
    document.getElementById('joinCodeInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') joinGroup(); });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); });
    });
});
