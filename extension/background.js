import { KINDS, SEED, load, save, search, open, targetUrl } from './store.js';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const data = await load();
  if (reason === 'install' && !data.students.length && !data.profiles.length) await save(SEED);
});

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
      description: `<match>${escapeXml(student.name)}</match> · ${escapeXml(profile?.name || '')} · <dim>${KINDS[k].name}</dim>`
    }))).slice(0, 8));
});
chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const { query, kind } = parse(text);
  const hit = search(await load(), query)[0];
  if (!hit) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await open(hit.student.id, kind, { tab: disposition === 'currentTab' ? { id: tab?.id, replace: true } : { active: disposition !== 'newBackgroundTab', index: tab?.index } });
});
