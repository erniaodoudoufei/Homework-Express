import { KINDS, SEED, load, save, mutate, search, open, targetUrl, buttonLabel, isZujuanChapter, isZujuanZhineng, zhinengFromChapter, parseChapterPage } from './store.js';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const data = await load();
  if (reason === 'install' && !data.students.length && !data.profiles.length) await save(SEED);
  healProfiles();
});
chrome.runtime.onStartup.addListener(() => healProfiles());

// 自动补全教材档案：只要章节选题网址是组卷网的，就读取那个页面，补上教材编号、年级和学科网网址，
// 并改正填错栏的智能组卷网址。只补空缺，不覆盖已填内容；每个网址本次运行只请求一次。
const pages = new Map(); // 章节网址 → 解析结果（失败为 null），本次运行内不重复请求
async function chapterInfo(url) {
  if (!pages.has(url)) {
    let info = null;
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (response.ok) info = parseChapterPage(await response.text(), url);
    } catch { /* 网络不通就下次启动再说 */ }
    pages.set(url, info);
  }
  return pages.get(url);
}
let healing = null;
let again = false;
async function healOnce() {
  const data = await load();
  const fixes = {};
  for (const profile of data.profiles) {
    if (!isZujuanChapter(profile.chapterUrl)) continue;
    const fix = {};
    if (!isZujuanZhineng(profile.zhinengUrl)) fix.zhinengUrl = zhinengFromChapter(profile.chapterUrl);
    if (!profile.versionId || !profile.grade || !profile.xkwUrl) {
      const info = await chapterInfo(profile.chapterUrl);
      for (const key of ['versionId', 'versionName', 'grade', 'xkwUrl']) if (!profile[key] && info?.[key]) fix[key] = info[key];
    }
    if (Object.keys(fix).length) fixes[profile.id] = fix;
  }
  if (!Object.keys(fixes).length) return;
  await mutate(d => { for (const p of d.profiles) if (fixes[p.id]) Object.assign(p, fixes[p.id]); });
}
function healProfiles() {
  if (healing) { again = true; return healing; }
  healing = (async () => {
    do { again = false; await healOnce(); } while (again);
  })().finally(() => { healing = null; });
  return healing;
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.data) healProfiles(); });

// 地址栏：输入 zy + 空格 + 姓名；末尾可加「智能」或「学科」
const escapeXml = text => text.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
function parse(text) {
  const parts = text.trim().split(/\s+/);
  const last = parts.at(-1);
  const kind = Object.keys(KINDS).find(k => KINDS[k].short === last || KINDS[k].name === last || k === last);
  if (kind && parts.length > 1) parts.pop();
  return { query: parts.join(' '), kind: kind || 'chapter' };
}

chrome.omnibox.setDefaultSuggestion({ description: '输入学生姓名或拼音首字母，回车打开章节选题；末尾加「智能」「学科」切换页面' });
chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const { query, kind } = parse(text);
  const results = search(await load(), query).slice(0, 3);
  suggest(results.flatMap(({ student, profile }) =>
    Object.keys(KINDS).filter(k => targetUrl(profile, k)).sort((a, b) => (b === kind) - (a === kind)).map(k => ({
      content: `${student.name} ${KINDS[k].short}`,
      description: `<match>${escapeXml(student.name)}</match> · ${escapeXml(profile?.name || '')} · <dim>${escapeXml(buttonLabel(profile, k))}</dim>`
    }))).slice(0, 8));
});
chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const { query, kind } = parse(text);
  const hit = search(await load(), query)[0];
  if (!hit) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await open(hit.student.id, kind, { tab: disposition === 'currentTab' ? { id: tab?.id, replace: true } : { active: disposition !== 'newBackgroundTab', index: tab?.index } });
});
