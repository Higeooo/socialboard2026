/* ============================================================
   SOCIAL BOARD (frontend) v2
   ============================================================ */

// ⚠ 배포 후 본인의 GAS Web App URL로 교체하세요.
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyaCEAIxjAwBZPhp3dYlU-264WskzaNQo5OU9JgqwRBDT-PPKdnwjuNkF8sJm8w7ws/exec';

// ----------- 전역 상태 -----------
const state = {
  user: null,         // { sid, name, klass } 또는 { admin: true, sid, name }
  adminToken: null,
  semester: '2026-1',
  cur: {
    classId: null, className: '',
    activityId: null, activityTitle: '', activityType: 'mixed',
    columnsCreated: false,
    groups: []
  }
};

// ----------- 유틸 -----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.hidden = true, 2400);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function show(screenId) {
  ['screen-login', 'screen-classes', 'screen-activities', 'screen-board'].forEach(id => {
    $('#' + id).hidden = (id !== screenId);
  });
  $('#topbar').hidden = (screenId === 'screen-login');
}

function isAdmin() { return !!(state.user && state.user.admin); }

// ----------- API -----------
async function api(action, payload = {}) {
  if (!GAS_URL || GAS_URL.startsWith('PASTE_')) {
    throw new Error('GAS_URL이 설정되지 않았습니다. app.js 상단을 확인하세요.');
  }
  const body = JSON.stringify({ action, payload });
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '요청 실패');
  return data.data;
}

// ----------- 세션 -----------
function saveSession() {
  sessionStorage.setItem('sb.session', JSON.stringify({
    user: state.user, adminToken: state.adminToken, semester: state.semester
  }));
}
function loadSession() {
  try {
    const raw = sessionStorage.getItem('sb.session');
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (s.user) {
      state.user = s.user;
      state.adminToken = s.adminToken;
      state.semester = s.semester || '2026-1';
      return true;
    }
  } catch {}
  return false;
}
function clearSession() {
  sessionStorage.removeItem('sb.session');
  state.user = null; state.adminToken = null;
}

// ============================================================
//  로그인
// ============================================================
async function studentLogin() {
  const sid  = $('#login-sid').value.trim();
  const name = $('#login-name').value.trim();
  if (!sid || !name) return toast('학번과 이름을 모두 입력해 주세요.', 'error');
  try {
    const u = await api('auth.studentLogin', { sid, name, semester: state.semester });
    state.user = u;
    saveSession();
    enterApp();
    toast(`환영합니다, ${u.name} 님`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function adminLogin() {
  const id = $('#admin-id').value.trim();
  const pw = $('#admin-pw').value;
  if (!id || !pw) return toast('관리자 정보를 입력해 주세요.', 'error');
  try {
    const r = await api('auth.adminLogin', { id, password: pw });
    state.user = { admin: true, name: '관리자', sid: id };
    state.adminToken = r.token;
    saveSession();
    enterApp();
    toast('관리자로 로그인했습니다.', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function logout() {
  clearSession();
  show('screen-login');
}

// ============================================================
//  진입 후 공통 처리
// ============================================================
async function enterApp() {
  try {
    const m = await api('meta.activeSemester', {});
    state.semester = m.semester;
    saveSession();
  } catch {}

  $('#semester-pill').textContent = state.semester + '학기';

  const u = state.user;
  $('#user-chip').innerHTML = u.admin
    ? `<strong>관리자</strong>`
    : `<span>${escapeHtml(u.sid)}</span>&nbsp;${escapeHtml(u.name)}`;

  // 관리자 전용 버튼
  $('#btn-new-class').hidden = !isAdmin();
  $('#btn-new-activity').hidden = !isAdmin();
  $('#btn-export').hidden = !isAdmin();

  await renderClasses();
  show('screen-classes');
}

// ============================================================
//  반 목록 (요구사항 5: 날짜 제거)
// ============================================================
async function renderClasses() {
  const grid = $('#class-grid');
  grid.innerHTML = '<p class="muted">불러오는 중…</p>';
  try {
    const list = await api('class.list', { semester: state.semester });
    if (!list.length) {
      grid.innerHTML = `<div class="empty"><strong>아직 등록된 반이 없습니다.</strong>${
        isAdmin() ? '오른쪽 위의 "반 만들기"로 시작하세요.' : '담당 교사가 반을 생성하면 표시됩니다.'
      }</div>`;
      return;
    }
    grid.innerHTML = list.map(c => `
      <button class="class-card" data-class-id="${c.classId}">
        <div class="cc-name">${escapeHtml(c.className)}</div>
        ${isAdmin() ? `
          <div class="cc-actions">
            <span class="mini-btn danger" data-action="del-class" data-id="${c.classId}">삭제</span>
          </div>` : ''}
      </button>
    `).join('');

    grid.querySelectorAll('.class-card').forEach(btn => {
      btn.addEventListener('click', e => {
        if (e.target.dataset.action === 'del-class') return;
        openClass(btn.dataset.classId, btn.querySelector('.cc-name').textContent);
      });
    });
    grid.querySelectorAll('[data-action="del-class"]').forEach(b => {
      b.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('반과 그 안의 모든 활동·게시물이 삭제됩니다. 계속할까요?')) return;
        try {
          await api('class.delete', { semester: state.semester, classId: b.dataset.id, token: state.adminToken });
          toast('반을 삭제했습니다.', 'success');
          renderClasses();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  } catch (e) { grid.innerHTML = `<p class="muted">오류: ${escapeHtml(e.message)}</p>`; }
}

async function newClass() {
  const name = await prompt2('반 만들기', '반 이름을 입력하세요. 예) 1학년 3반');
  if (!name) return;
  try {
    await api('class.create', { semester: state.semester, name, token: state.adminToken });
    toast('반을 생성했습니다.', 'success');
    renderClasses();
  } catch (e) { toast(e.message, 'error'); }
}

// ============================================================
//  활동 목록
// ============================================================
async function openClass(classId, className) {
  state.cur.classId = classId;
  state.cur.className = className;
  $('#cur-class-title').textContent = className + ' / 활동 목록';
  $('#cur-class-sub').textContent = state.semester + '학기 · 활동을 선택하세요';
  show('screen-activities');
  await renderActivities();
}

async function renderActivities() {
  const root = $('#activity-list');
  root.innerHTML = '<p class="muted">불러오는 중…</p>';
  try {
    const list = await api('activity.list', { semester: state.semester, classId: state.cur.classId });
    if (!list.length) {
      root.innerHTML = `<div class="empty"><strong>등록된 활동이 없습니다.</strong>${
        isAdmin() ? '오른쪽 위 "활동 만들기"로 시작하세요.' : '담당 교사가 활동을 생성하면 표시됩니다.'
      }</div>`;
      return;
    }
    root.innerHTML = list.map(a => {
      const isInq = a.type === 'inquiry';
      return `
        <div class="activity-card" data-id="${a.activityId}" data-title="${escapeHtml(a.title)}" data-type="${escapeHtml(a.type || 'mixed')}" data-cols="${a.columnsCreated === true || a.columnsCreated === 'TRUE' || a.columnsCreated === 'true' ? '1' : '0'}">
          <div class="activity-icon ${isInq ? 'inquiry' : ''}">${isInq ? '🔎' : '📋'}</div>
          <div>
            <div class="a-title">${escapeHtml(a.title)}</div>
            <div class="a-desc">${escapeHtml(a.description || (isInq ? '탐구 질문 5단계 활동' : '일반 모둠 활동'))}</div>
          </div>
          <div class="a-actions">
            ${isAdmin() ? `<button class="btn-ghost" data-action="del-activity" data-id="${a.activityId}">삭제</button>` : ''}
            <button class="btn-primary" data-action="open">입장 →</button>
          </div>
        </div>`;
    }).join('');

    root.querySelectorAll('.activity-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-action="del-activity"]')) return;
        openActivity({
          activityId: card.dataset.id,
          title: card.dataset.title,
          type: card.dataset.type,
          columnsCreated: card.dataset.cols === '1'
        });
      });
    });
    root.querySelectorAll('[data-action="del-activity"]').forEach(b => {
      b.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('이 활동과 그 안의 모든 조·게시물이 삭제됩니다.')) return;
        try {
          await api('activity.delete', { semester: state.semester, activityId: b.dataset.id, token: state.adminToken });
          toast('활동을 삭제했습니다.', 'success');
          renderActivities();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  } catch (e) { root.innerHTML = `<p class="muted">오류: ${escapeHtml(e.message)}</p>`; }
}

async function newActivity() {
  const name = await prompt2('활동 만들기', '활동명을 입력하세요. 예) 기후위기 탐구');
  if (!name) return;
  const isInq = confirm('탐구 질문 5단계 활동인가요?\n[확인] 탐구 / [취소] 일반');
  try {
    await api('activity.create', {
      semester: state.semester, classId: state.cur.classId,
      title: name, type: isInq ? 'inquiry' : 'basic',
      description: '', token: state.adminToken
    });
    toast('활동을 생성했습니다.', 'success');
    renderActivities();
  } catch (e) { toast(e.message, 'error'); }
}

// ============================================================
//  보드 (자유 게시 OR 8 컬럼)
// ============================================================
async function openActivity(act) {
  state.cur.activityId = act.activityId;
  state.cur.activityTitle = act.title;
  state.cur.activityType = act.type || 'mixed';
  state.cur.columnsCreated = !!act.columnsCreated;
  $('#cur-activity-title').textContent = state.cur.className + ' / ' + act.title;
  $('#cur-activity-sub').textContent = state.semester + '학기' + (act.type === 'inquiry' ? ' · 탐구 5단계' : '');
  show('screen-board');
  await refreshBoard();
}

async function refreshBoard() {
  // 활동 메타 다시 조회 (columnsCreated 동기화)
  try {
    const a = await api('activity.get', { semester: state.semester, activityId: state.cur.activityId });
    state.cur.columnsCreated = (a.columnsCreated === true || a.columnsCreated === 'TRUE' || a.columnsCreated === 'true');
  } catch {}

  // 버튼 상태
  $('#btn-make-columns').hidden = !(isAdmin() && !state.cur.columnsCreated);

  // 데이터 로드
  const [groups, posts] = await Promise.all([
    api('group.list', { semester: state.semester, activityId: state.cur.activityId }),
    api('post.list',  { semester: state.semester, activityId: state.cur.activityId, includeHidden: isAdmin() })
  ]);
  state.cur.groups = groups;

  if (state.cur.columnsCreated && groups.length > 0) {
    renderColumns(groups, posts);
    $('#columns-area').hidden = false;
    $('#free-area').hidden = true;
  } else {
    renderFreePosts(posts);
    $('#columns-area').hidden = true;
    $('#free-area').hidden = false;
  }
}

// ----------- 자유 게시 모드 -----------
function renderFreePosts(posts) {
  const root = $('#free-area');
  if (!posts.length) {
    root.innerHTML = `<div class="free-empty"><strong>아직 게시물이 없습니다.</strong>"+ 게시물 작성"으로 시작하세요.${
      isAdmin() ? '<br/><br/>조별 컬럼으로 진행하시려면 "+ 8개 조 컬럼 만들기"를 누르세요.' : ''
    }</div>`;
    return;
  }
  root.innerHTML = posts.map(renderPost).join('');
  bindPostActions(root);
}

// ----------- 컬럼 모드 -----------
function renderColumns(groups, posts) {
  const root = $('#columns-area');
  root.innerHTML = groups.map(g => {
    const groupPosts = posts.filter(p => p.groupId === g.groupId);
    const titleClass = isAdmin() ? 'c-title editable' : 'c-title';
    const titleAttr  = isAdmin() ? `data-action="rename" data-id="${g.groupId}" title="클릭하여 이름 수정"` : '';
    return `
      <article class="col" data-group-id="${g.groupId}">
        <header class="col-head">
          <span class="${titleClass}" ${titleAttr}>${escapeHtml(g.title)}</span>
          <span class="c-count">${groupPosts.length}</span>
        </header>
        <div class="col-body">
          ${groupPosts.length === 0
            ? '<div class="col-empty">게시물 없음</div>'
            : groupPosts.map(renderPost).join('')}
        </div>
        <footer class="col-foot">
          <button class="col-post-btn" data-action="post-to-group" data-group="${g.groupId}" data-group-title="${escapeHtml(g.title)}">+ ${escapeHtml(g.title)}에 게시</button>
        </footer>
      </article>`;
  }).join('');
  bindPostActions(root);

  // 컬럼 제목 수정 (관리자만)
  root.querySelectorAll('[data-action="rename"]').forEach(el => {
    el.addEventListener('click', async () => {
      const newName = await prompt2('조 이름 수정', '새 조 이름을 입력하세요.', el.textContent.trim());
      if (!newName || newName === el.textContent.trim()) return;
      try {
        await api('group.rename', {
          semester: state.semester, groupId: el.dataset.id, title: newName,
          token: state.adminToken
        });
        toast('조 이름을 변경했습니다.', 'success');
        refreshBoard();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  // 컬럼별 게시 버튼
  root.querySelectorAll('[data-action="post-to-group"]').forEach(b => {
    b.addEventListener('click', () => openPostModal(b.dataset.group, b.dataset.groupTitle));
  });
}

// ----------- 게시물 카드 -----------
function renderPost(p) {
  const isInq = p.type === 'inquiry';
  const hidden = p.status === 'hidden' ? ' hidden-post' : '';
  const adminCls = (p.name === '관리자') ? ' admin-post' : '';
  const stepsHtml = isInq ? `
    <div class="n-steps">
      ${p.step1 ? `<div class="n-step"><b>① 관찰 중 궁금했던 점</b>${escapeHtml(p.step1)}</div>` : ''}
      ${p.step2 ? `<div class="n-step"><b>② 탐구 질문</b>${escapeHtml(p.step2)}</div>` : ''}
      ${p.step3 ? `<div class="n-step"><b>③ 예상 답변</b>${escapeHtml(p.step3)}</div>` : ''}
      ${p.step4 ? `<div class="n-step"><b>④ AI 답변</b>${escapeHtml(p.step4)}</div>` : ''}
      ${p.step5 ? `<div class="n-step"><b>⑤ 비판적 검토</b>${escapeHtml(p.step5)}</div>` : ''}
    </div>` : '';

  const authorPill = (p.name === '관리자')
    ? `<span class="pill pill-admin">관리자</span>`
    : `<span>${escapeHtml(p.sid)} ${escapeHtml(p.name)}</span>`;

  return `
    <article class="note${hidden}${adminCls}" data-post-id="${p.postId}">
      <div class="n-head">
        <span class="pill ${isInq ? 'pill-lime' : 'pill-mint'}">${isInq ? '탐구' : '일반'}</span>
        ${authorPill}
        ${p.status === 'hidden' ? '<span class="pill pill-soft">숨김</span>' : ''}
      </div>
      ${!isInq && p.title ? `<div class="n-title">${escapeHtml(p.title)}</div>` : ''}
      ${!isInq && p.content ? `<div class="n-content">${escapeHtml(p.content)}</div>` : ''}
      ${stepsHtml}
      ${p.fileUrl ? `<a class="n-file" href="${escapeHtml(p.fileUrl)}" target="_blank" rel="noopener">📎 ${escapeHtml(p.fileName || '첨부파일')}</a>` : ''}
      <div class="n-foot">
        <span>${fmtDate(p.createdAt)}</span>
        ${isAdmin() ? `
          <span class="n-actions">
            <button class="mini-btn" data-mod="${p.status === 'hidden' ? 'visible' : 'hidden'}" data-id="${p.postId}">${p.status === 'hidden' ? '공개' : '숨김'}</button>
            <button class="mini-btn danger" data-mod="deleted" data-id="${p.postId}">삭제</button>
          </span>` : ''}
      </div>
    </article>`;
}

function bindPostActions(root) {
  root.querySelectorAll('[data-mod]').forEach(b => {
    b.addEventListener('click', async () => {
      const status = b.dataset.mod;
      if (status === 'deleted' && !confirm('이 게시물을 삭제할까요?')) return;
      try {
        await api('post.moderate', {
          semester: state.semester, postId: b.dataset.id, status,
          token: state.adminToken
        });
        toast('처리되었습니다.', 'success');
        refreshBoard();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

// ============================================================
//  8개 조 컬럼 만들기
// ============================================================
async function makeColumns() {
  if (!confirm('1조부터 8조까지 컬럼을 한 번에 만듭니다. 계속할까요?\n(만든 후에는 컬럼 제목을 클릭해 이름을 수정할 수 있습니다.)')) return;
  try {
    await api('group.makeColumns', {
      semester: state.semester, activityId: state.cur.activityId,
      token: state.adminToken
    });
    toast('1조~8조 컬럼이 생성되었습니다.', 'success');
    refreshBoard();
  } catch (e) { toast(e.message, 'error'); }
}

// ============================================================
//  게시물 작성 모달
// ============================================================
let curGroupId = null, curGroupTitle = '';
let curPostType = 'basic';

function openPostModal(groupId, groupTitle) {
  // 컬럼 모드인데 그룹이 지정되지 않은 경우 → 셀렉트로 선택받기
  curGroupId = groupId || null;
  curGroupTitle = groupTitle || '';

  // 작성자 표시
  if (isAdmin()) {
    $('#post-author').innerHTML = `<span style="color:var(--c-primary-accent)">관리자</span>`;
  } else {
    $('#post-author').textContent = `${state.user.sid} ${state.user.name}`;
  }

  // 활동 type에 따라 기본 탭 결정
  if (state.cur.activityType === 'inquiry') {
    setPostType('inquiry');
  } else {
    setPostType('basic');
  }

  // 컬럼 모드면 셀렉트 표시
  const wrap = $('#post-group-select-wrap');
  if (state.cur.columnsCreated && state.cur.groups.length > 0) {
    wrap.hidden = false;
    const sel = $('#post-group-select');
    sel.innerHTML = state.cur.groups.map(g =>
      `<option value="${g.groupId}" ${g.groupId === curGroupId ? 'selected' : ''}>${escapeHtml(g.title)}</option>`
    ).join('');
    if (!curGroupId) curGroupId = state.cur.groups[0].groupId;
    sel.value = curGroupId;
    $('#post-target').textContent = curGroupTitle || (state.cur.groups.find(g => g.groupId === curGroupId)?.title || '조 선택');
  } else {
    wrap.hidden = true;
    $('#post-target').textContent = '자유 게시';
  }

  // 입력 초기화
  $('#post-title').value = '';
  $('#post-content').value = '';
  ['step1','step2','step3','step4','step5'].forEach(id => $('#'+id).value = '');
  $('#post-file').value = '';

  $('#modal-post').hidden = false;
}

function setPostType(t) {
  curPostType = t;
  $$('.seg').forEach(s => s.classList.toggle('active', s.dataset.type === t));
  $$('[data-show]').forEach(el => el.hidden = (el.dataset.show !== t));
}

async function submitPost() {
  // 컬럼 모드이면 셀렉트에서 선택된 그룹 사용
  let groupId = '';
  if (state.cur.columnsCreated && state.cur.groups.length > 0) {
    groupId = $('#post-group-select').value;
  }

  const payload = {
    semester: state.semester,
    activityId: state.cur.activityId,
    groupId: groupId,
    sid: state.user.sid, name: state.user.name,
    type: curPostType,
  };

  // 일반 게시물 vs 탐구 5단계
  if (curPostType === 'basic') {
    const title = $('#post-title').value.trim();
    if (!title) return toast('제목을 입력하세요.', 'error');
    payload.title = title;
    payload.content = $('#post-content').value.trim();
  } else {
    payload.title = '';
    payload.content = '';
    payload.step1 = $('#step1').value.trim();
    payload.step2 = $('#step2').value.trim();
    payload.step3 = $('#step3').value.trim();
    payload.step4 = $('#step4').value.trim();
    payload.step5 = $('#step5').value.trim();
    if (![payload.step1, payload.step2, payload.step3, payload.step4, payload.step5].some(s => s)) {
      return toast('탐구 5단계 중 적어도 1개 항목을 입력하세요.', 'error');
    }
  }

  // 관리자 분기
  if (isAdmin()) {
    payload.isAdmin = true;
    payload.adminToken = state.adminToken;
  }

  // 파일 첨부 (선택)
  const fileEl = $('#post-file');
  if (fileEl.files && fileEl.files[0]) {
    const f = fileEl.files[0];
    if (f.size > 10 * 1024 * 1024) return toast('파일은 10MB 이하만 가능합니다.', 'error');
    if (/^video\//.test(f.type)) return toast('동영상은 첨부할 수 없습니다.', 'error');
    const b64 = await fileToBase64(f);
    payload.fileBase64 = b64;
    payload.fileName = f.name;
    payload.fileMime = f.type;
  }

  try {
    await api('post.create', payload);
    $('#modal-post').hidden = true;
    toast('게시 완료!', 'success');
    refreshBoard();
  } catch (e) { toast(e.message, 'error'); }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ============================================================
//  CSV 내보내기
// ============================================================
async function exportCsv() {
  if (!isAdmin()) return;
  const scope = state.cur.activityId ? 'activity'
              : state.cur.classId ? 'class' : 'semester';
  const id    = state.cur.activityId || state.cur.classId || '';
  try {
    const r = await api('export.csv', { semester: state.semester, scope, id, token: state.adminToken });
    const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SOCIAL_BOARD_${state.semester}_${scope}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${r.count}건 내보냈습니다.`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ============================================================
//  공용 입력 모달
// ============================================================
function prompt2(title, desc, defaultValue) {
  return new Promise(resolve => {
    $('#prompt-title').textContent = title;
    $('#prompt-desc').textContent = desc;
    const inp = $('#prompt-input');
    inp.value = defaultValue || '';
    $('#modal-prompt').hidden = false;
    setTimeout(() => { inp.focus(); inp.select(); }, 50);

    const ok = () => { close(inp.value.trim() || null); };
    const cancel = () => close(null);

    function close(val) {
      $('#modal-prompt').hidden = true;
      $('#prompt-ok').removeEventListener('click', ok);
      inp.removeEventListener('keydown', enter);
      resolve(val);
    }
    function enter(e) { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') cancel(); }
    $('#prompt-ok').addEventListener('click', ok);
    inp.addEventListener('keydown', enter);
    $$('[data-close="modal-prompt"]').forEach(b => b.addEventListener('click', cancel, { once: true }));
  });
}

// ============================================================
//  바인딩
// ============================================================
function bindOnce() {
  $('#btn-student-login').addEventListener('click', studentLogin);
  $('#btn-admin-login').addEventListener('click', adminLogin);
  $('#btn-logout').addEventListener('click', logout);

  $('#btn-new-class').addEventListener('click', newClass);
  $('#btn-new-activity').addEventListener('click', newActivity);
  $('#btn-make-columns').addEventListener('click', makeColumns);
  $('#btn-export').addEventListener('click', exportCsv);

  // 보드의 "+ 게시물 작성" 버튼 — 자유게시 또는 컬럼 모드 셀렉트로
  $('#btn-new-post').addEventListener('click', () => {
    if (state.cur.columnsCreated && state.cur.groups.length > 0) {
      openPostModal(state.cur.groups[0].groupId, state.cur.groups[0].title);
    } else {
      openPostModal(null, '');
    }
  });

  // 컬럼 셀렉트 변경
  $('#post-group-select').addEventListener('change', e => {
    curGroupId = e.target.value;
    const g = state.cur.groups.find(x => x.groupId === curGroupId);
    $('#post-target').textContent = g ? g.title : '조 선택';
  });

  // 뒤로 가기
  $$('[data-back]').forEach(b => {
    b.addEventListener('click', () => {
      const target = b.dataset.back;
      if (target === 'classes')    show('screen-classes');
      if (target === 'activities') show('screen-activities');
    });
  });

  // 모달 닫기
  $$('[data-close]').forEach(b => {
    b.addEventListener('click', () => { $('#' + b.dataset.close).hidden = true; });
  });

  // 게시물 모달 - 일반/탐구 토글
  $$('.seg').forEach(s => s.addEventListener('click', () => setPostType(s.dataset.type)));

  // 게시물 제출
  $('#btn-submit-post').addEventListener('click', submitPost);

  // 엔터로 로그인
  ['login-sid', 'login-name'].forEach(id => {
    $('#' + id).addEventListener('keydown', e => { if (e.key === 'Enter') studentLogin(); });
  });
  ['admin-id', 'admin-pw'].forEach(id => {
    $('#' + id).addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
  });
}

// ============================================================
//  부트
// ============================================================
(async function init() {
  bindOnce();
  if (loadSession()) {
    try { await enterApp(); return; } catch {}
  }
  show('screen-login');
})();
