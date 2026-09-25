import { KINDS, load, save, mutate, upsert, search, targetUrl, open, zhinengFromChapter, shortGrade, parseTitle, validateImport } from './store.js';

const $ = selector => document.querySelector(selector);
const full = location.search.includes('full');
document.body.classList.toggle('full', full);

let data = { profiles: [], students: [] };
let results = [];
let active = 0;
let stack = ['list'];
let editing = { student: null, profile: null, returnToStudent: false };

function h(tag, props = {}, ...children) {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children.flat().filter(c => c != null && c !== false));
  return el;
}

// ---------- 视图切换 & 草稿（弹窗切到别的网页会关闭，表单内容先存起来） ----------
function show(view) {
  for (const section of document.querySelectorAll('.view')) section.hidden = section.id !== `view-${view}`;
  if (view === 'list') { $('#q').focus(); renderList(); }
  if (view === 'manage') renderManage();
}
function push(view) { stack.push(view); show(view); saveDraft(); }
function back() {
  stack.pop();
  if (!stack.length) stack = ['list'];
  const view = stack.at(-1);
  editing.returnToStudent = false;
  show(view);
  saveDraft();
}
const readForm = form => Object.fromEntries(new FormData(form).entries());
function saveDraft() {
  const draft = stack.length > 1 ? { at: Date.now(), stack, editing, student: readForm($('#student-form')), profile: readForm($('#profile-form')) } : null;
  chrome.storage.session.set({ draft }).catch(() => {});
}
async function restoreDraft() {
  const { draft } = await chrome.storage.session.get('draft').catch(() => ({}));
  if (!draft || Date.now() - draft.at > 30 * 60 * 1000) return false;
  stack = draft.stack; editing = draft.editing;
  fillStudentForm(draft.student);
  fillProfileForm(draft.profile);
  show(stack.at(-1));
  return true;
}

// ---------- 学生列表 ----------
function renderList() {
  results = search(data, $('#q').value);
  active = Math.min(active, Math.max(results.length - 1, 0));
  $('#list').replaceChildren(...results.map((r, i) => row(r, i)));
  const empty = $('#empty');
  empty.hidden = results.length > 0;
  if (!data.students.length) empty.replaceChildren('还没有学生。', h('br'), '点右上角「＋ 学生」，添加第一个学生。');
  else if (!results.length) {
    const name = $('#q').value.trim();
    empty.replaceChildren(`没有找到「${name}」`, h('br'), h('button', { className: 'ghost', textContent: `新增学生「${name}」`, onclick: () => newStudent(name) }));
  }
}
function row({ student, profile }, i) {
  const acts = Object.keys(KINDS).map((kind, k) => {
    const url = targetUrl(profile, kind);
    const button = h('button', { textContent: KINDS[kind].name, disabled: !url, title: url ? `${['Enter', 'Ctrl+Enter', 'Shift+Enter'][k]} · ${url.split('#')[0]}` : '这个教材档案还没设置此网址' });
    button.addEventListener('click', e => go(student.id, kind, e.ctrlKey || e.metaKey));
    button.addEventListener('auxclick', e => { if (e.button === 1) go(student.id, kind, true); });
    return button;
  });
  return h('li', { className: `row${i === active ? ' active' : ''}` },
    h('div', { className: 'who' },
      h('b', { textContent: student.name }),
      h('span', { className: `tag${profile ? '' : ' missing'}`, textContent: profile?.name || '未设置教材' }),
      h('small', { textContent: student.note || '' }),
      h('button', { className: 'edit', textContent: '✎ 编辑', title: '编辑学生', onclick: () => editStudent(student.id) })),
    h('div', { className: 'acts' }, acts));
}
async function go(studentId, kind, background) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const ok = await open(studentId, kind, { tab: { active: !background, index: tab?.index } });
  if (ok && !background && !full) window.close();
  data = await load();
}
function moveActive(delta) {
  if (!results.length) return;
  active = (active + delta + results.length) % results.length;
  document.querySelectorAll('#list .row').forEach((li, i) => li.classList.toggle('active', i === active));
  document.querySelectorAll('#list .row')[active]?.scrollIntoView({ block: 'nearest' });
}
$('#q').addEventListener('input', () => { active = 0; renderList(); });
$('#q').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
  else if (e.key === 'Enter' && results[active]) {
    e.preventDefault();
    const kind = e.ctrlKey || e.metaKey ? 'zhineng' : e.shiftKey ? 'xkw' : 'chapter';
    if (targetUrl(results[active].profile, kind)) go(results[active].student.id, kind, false);
    else editStudent(results[active].student.id);
  } else if (e.key === 'Escape' && e.target.value) { e.preventDefault(); e.target.value = ''; active = 0; renderList(); }
});

// ---------- 学生表单 ----------
function fillProfileOptions(selected) {
  const select = $('#student-form [name=profileId]');
  const sorted = [...data.profiles].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  select.replaceChildren(h('option', { value: '', textContent: sorted.length ? '— 请选择 —' : '— 还没有档案，请先新建 —' }), ...sorted.map(p => h('option', { value: p.id, textContent: p.name })));
  select.value = selected || '';
}
function fillStudentForm(values = {}) {
  const form = $('#student-form');
  for (const key of ['name', 'alias', 'note']) form.elements[key].value = values[key] || '';
  fillProfileOptions(values.profileId);
  $('#student-title').textContent = editing.student ? '编辑学生' : '新增学生';
  $('#delete-student').hidden = !editing.student;
  resetConfirm($('#delete-student'), '删除学生');
}
function newStudent(name = '') {
  editing.student = null;
  fillStudentForm({ name, profileId: data.profiles.length === 1 ? data.profiles[0].id : '' });
  push('student');
  $('#student-form [name=name]').focus();
}
function editStudent(id) {
  editing.student = id;
  fillStudentForm(data.students.find(s => s.id === id));
  push('student');
}
$('#add').addEventListener('click', () => newStudent($('#q').value.trim()));
$('#student-form').addEventListener('input', saveDraft);
$('#student-form').addEventListener('submit', async e => {
  e.preventDefault();
  const values = readForm(e.target);
  const name = values.name.trim();
  if (!name) return;
  await mutate(d => upsert(d.students, { ...(editing.student ? { id: editing.student } : { lastUsed: Date.now() }), name, alias: values.alias.trim(), note: values.note.trim(), profileId: values.profileId }));
  data = await load();
  editing.student = null;
  $('#q').value = name;
  active = 0;
  stack = ['list']; show('list'); saveDraft();
});
$('#new-profile').addEventListener('click', () => {
  editing.returnToStudent = true;
  editProfile(null);
});
$('#delete-student').addEventListener('click', async e => {
  if (!armConfirm(e.target, '再点一次确认删除')) return;
  await mutate(d => { d.students = d.students.filter(s => s.id !== editing.student); });
  data = await load();
  editing.student = null;
  stack = ['list']; show('list'); saveDraft();
});

// 删除类按钮：第一次点击变成「确认」，3 秒内再点才生效
function armConfirm(button, text) {
  if (button.dataset.armed) return true;
  button.dataset.armed = '1';
  button.dataset.label = button.textContent;
  button.textContent = text;
  setTimeout(() => resetConfirm(button), 3000);
  return false;
}
function resetConfirm(button, label) {
  delete button.dataset.armed;
  button.textContent = label || button.dataset.label || button.textContent;
}

// ---------- 教材档案表单 ----------
function fillProfileForm(values = {}) {
  const form = $('#profile-form');
  for (const key of ['name', 'chapterUrl', 'zhinengUrl', 'versionId', 'versionName', 'grade', 'xkwUrl']) form.elements[key].value = values[key] || '';
  $('#profile-title').textContent = editing.profile ? '编辑教材档案' : '新建教材档案';
  $('#delete-profile').hidden = !editing.profile;
  resetConfirm($('#delete-profile'), '删除档案');
  $('#capture-status').textContent = '';
}
function editProfile(id) {
  editing.profile = id;
  fillProfileForm(data.profiles.find(p => p.id === id));
  push('profile');
  describeCurrentPage();
}
$('#profile-form').addEventListener('input', saveDraft);
$('#profile-form').addEventListener('submit', async e => {
  e.preventDefault();
  const values = Object.fromEntries(Object.entries(readForm(e.target)).map(([k, v]) => [k, v.trim()]));
  // 档案名称统一用间隔号：「浙教版.九上」「浙教版 九上」都存成「浙教版·九上」
  values.name = values.name.replace(/\s*[.。•・‧∙·]\s*|\s+/g, '·');
  if (!values.name) return;
  if (!values.zhinengUrl) values.zhinengUrl = zhinengFromChapter(values.chapterUrl);
  const saved = await mutate(d => upsert(d.profiles, { ...(editing.profile ? { id: editing.profile } : {}), ...values }));
  data = await load();
  editing.profile = null;
  const toStudent = editing.returnToStudent;
  stack.pop();
  if (toStudent) {
    const draft = readForm($('#student-form'));
    editing.returnToStudent = false;
    fillStudentForm({ ...draft, profileId: saved.id });
  }
  show(stack.at(-1));
  saveDraft();
});
$('#delete-profile').addEventListener('click', async e => {
  const users = data.students.filter(s => s.profileId === editing.profile);
  if (users.length) {
    setStatus('#capture-status', `还有 ${users.length} 个学生在用这个档案（${users.slice(0, 5).map(s => s.name).join('、')}${users.length > 5 ? '…' : ''}），请先给他们换档案。`, true);
    return;
  }
  if (!armConfirm(e.target, '再点一次确认删除')) return;
  await mutate(d => { d.profiles = d.profiles.filter(p => p.id !== editing.profile); });
  data = await load();
  editing.profile = null;
  back();
});

// ---------- 用当前页面填入 ----------
async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.startsWith('http') ? tab : null;
}
async function describeCurrentPage() {
  const tab = full ? null : await currentTab();
  $('#capture-btn').hidden = !tab;
  $('#capture-page').textContent = tab ? `当前页面：${tab.title || tab.url}` : full ? '在网站页面上按 Alt+Shift+Z 打开面板，才能用当前页面填入。' : '当前标签页不是网页，请先切到组卷网或学科网的页面。';
}
function readSelectedTextbook() {
  const version = document.querySelector('#chapter_textbook_version a.selected');
  const grade = document.querySelector('#chapter_textbooks a.selected');
  return { versionId: version?.getAttribute('versionid') || '', versionName: version?.textContent.trim() || '', grade: grade?.textContent.trim() || '' };
}
function setStatus(selector, text, warn = false) {
  const el = $(selector);
  el.textContent = text;
  el.classList.toggle('warn', warn);
}
$('#capture-btn').addEventListener('click', async () => {
  const tab = await currentTab();
  if (!tab) return describeCurrentPage();
  const form = $('#profile-form').elements;
  const url = new URL(tab.url);
  url.hash = '';
  const filled = [];
  const fromTitle = parseTitle(tab.title);
  let page = {};
  if (url.hostname === 'zujuan.xkw.com') {
    try {
      const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readSelectedTextbook });
      page = injection?.result || {};
    } catch { page = {}; }
    const zhineng = /^\/([a-z]+)\/zhineng\//.exec(url.pathname);
    if (zhineng) {
      form.zhinengUrl.value = `${url.origin}/${zhineng[1]}/zhineng/`;
      filled.push('智能组卷网址');
      page.grade = fromTitle.grade = ''; // 智能组卷页不代表某个年级
    } else if (/^\/[a-z]+\/zj\d+\/?$/.test(url.pathname)) {
      form.chapterUrl.value = url.href;
      filled.push('章节选题网址');
      if (!form.zhinengUrl.value) { form.zhinengUrl.value = zhinengFromChapter(url.href); filled.push('智能组卷网址'); }
    } else {
      return setStatus('#capture-status', '这是组卷网，但不是章节选题页。请先在组卷网点「章节选题」，选好版本和年级再试。', true);
    }
  } else if (/(^|\.)zxxk\.com$/.test(url.hostname)) {
    form.xkwUrl.value = url.href;
    filled.push('学科网网址');
  } else {
    return setStatus('#capture-status', '当前页面不是组卷网或学科网。', true);
  }
  const versionId = page.versionId;
  const versionName = page.versionName || fromTitle.versionName;
  const grade = page.grade || fromTitle.grade;
  if (versionId && form.versionId.value !== versionId) { form.versionId.value = versionId; filled.push(`教材 ${versionName || versionId}`); }
  if (versionName) form.versionName.value = versionName;
  if (grade && !form.grade.value) { form.grade.value = grade; filled.push(`年级 ${grade}`); }
  if (!form.name.value && (form.versionName.value || form.grade.value)) {
    form.name.value = [form.versionName.value, shortGrade(form.grade.value)].filter(Boolean).join('·');
    filled.push('档案名称');
  }
  const missing = [['chapterUrl', '章节选题'], ['xkwUrl', '学科网']].filter(([k]) => !form[k].value).map(([, n]) => n);
  // 带（2012）的是改版前的老教材，现在基本没人用，多半是点错了
  const oldBook = /2012/.test(form.versionName.value) ? `注意：选中的是「${form.versionName.value}」老教材，请确认学生没有换成新教材。` : '';
  setStatus('#capture-status', `已填入：${filled.join('、')}。${missing.length ? `还差${missing.join('、')}网址，可以先到那个页面再打开面板继续填（已填内容会保留）。` : '检查无误后点「保存档案」。'}${oldBook}`, !!oldBook);
  saveDraft();
});

// ---------- 管理 & 备份 ----------
function renderManage() {
  const counts = Object.groupBy(data.students, s => s.profileId);
  const sorted = [...data.profiles].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  $('#profiles').replaceChildren(...sorted.map(p => h('li', { className: 'row' },
    h('div', {}, h('b', { textContent: p.name }), h('small', { textContent: `${counts[p.id]?.length || 0} 个学生${p.versionId ? ` · 智能组卷自动选教材（${p.grade || '不定位年级'}）` : ' · 未设置 versionid'}` })),
    h('button', { className: 'ghost', textContent: '编辑', onclick: () => editProfile(p.id) }))));
  if (!sorted.length) $('#profiles').replaceChildren(h('p', { className: 'empty', textContent: '还没有教材档案。' }));
  $('#check-basket').checked = data.settings?.checkBasket !== false;
}
$('#check-basket').addEventListener('change', e => mutate(d => { d.settings = { ...d.settings, checkBasket: e.target.checked }; }));
$('#manage').addEventListener('click', () => { if (stack.at(-1) !== 'manage') push('manage'); });
$('#manage-new-profile').addEventListener('click', () => editProfile(null));
$('#open-full').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#export').addEventListener('click', async () => {
  const blob = new Blob([JSON.stringify(await load(), null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `作业直达备份-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  setStatus('#backup-status', `已导出 ${data.students.length} 个学生、${data.profiles.length} 个教材档案。`);
});
$('#import').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let incoming;
  try { incoming = validateImport(JSON.parse(await file.text())); }
  catch (error) { return setStatus('#backup-status', `导入失败：${error.message}`, true); }
  setStatus('#backup-status', `备份里有 ${incoming.students.length} 个学生、${incoming.profiles.length} 个档案，会替换当前数据。`);
  $('#backup-status').append(' ', h('button', { className: 'ghost', textContent: '确认导入', onclick: async () => {
    await save(incoming);
    data = await load();
    renderManage();
    setStatus('#backup-status', '导入完成。');
  } }));
});

for (const button of document.querySelectorAll('[data-back]')) button.addEventListener('click', back);
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.data) return;
  data = changes.data.newValue || { profiles: [], students: [] };
  if (stack.at(-1) === 'list') renderList();
  if (stack.at(-1) === 'manage') renderManage();
});

data = await load();
if (!await restoreDraft()) show('list');
if (stack.at(-1) === 'profile') describeCurrentPage();
