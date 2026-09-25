// 数据层：教材档案 + 学生，存在 chrome.storage.local 的 data 键里
export const KINDS = {
  chapter: { name: '章节选题', short: '章节' },
  zhineng: { name: '智能组卷', short: '智能' },
  xkw: { name: '学科网', short: '学科' }
};
const KEY = 'data';
const empty = () => ({ version: 1, profiles: [], students: [] });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const SEED = {
  version: 1,
  profiles: [{
    id: 'p-zj-9a', name: '浙教版·九上', versionName: '浙教版', grade: '九年级上册', versionId: '199373',
    chapterUrl: 'https://zujuan.xkw.com/czsx/zj260620/',
    zhinengUrl: 'https://zujuan.xkw.com/czsx/zhineng/',
    xkwUrl: 'https://sx.zxxk.com/m/books-b8116/'
  }],
  students: [{ id: 's-demo', name: '示例学生', alias: '', note: '可编辑或删除', profileId: 'p-zj-9a', lastUsed: 0 }]
};

export async function load() {
  const { [KEY]: data } = await chrome.storage.local.get(KEY);
  return data?.version === 1 ? data : empty();
}
export const save = data => chrome.storage.local.set({ [KEY]: data });

export async function mutate(fn) {
  const data = await load();
  const result = fn(data);
  await save(data);
  return result;
}

export function upsert(list, item) {
  if (!item.id) item.id = uid();
  const index = list.findIndex(x => x.id === item.id);
  if (index < 0) list.push(item); else list[index] = { ...list[index], ...item };
  return item;
}

// 拼音首字母：借用 Chrome 自带的中文拼音排序，找出每个字落在哪个字母区间
// 边界字经过 ICU 实测（多音字按默认读音，个别不准的可在「搜索别名」里补）
const BOUNDS = '阿八嚓哒妸发旮哈讥咔垃妈拏噢妑七呥仨他穵夕丫帀';
const LETTERS = 'ABCDEFGHJKLMNOPQRSTWXYZ';
const collator = new Intl.Collator('zh-CN-u-co-pinyin');
function initialOf(ch) {
  if (/[a-z0-9]/i.test(ch)) return ch.toLowerCase();
  if (!/[一-鿿]/.test(ch)) return '';
  let letter = '';
  for (let i = 0; i < BOUNDS.length; i++) {
    if (collator.compare(BOUNDS[i], ch) <= 0) letter = LETTERS[i]; else break;
  }
  return letter.toLowerCase();
}
export const initials = text => [...(text || '')].map(initialOf).join('');

export function search(data, query) {
  const q = query.trim().toLowerCase();
  const profiles = Object.fromEntries(data.profiles.map(p => [p.id, p]));
  const scored = data.students.map(student => {
    const profile = profiles[student.profileId];
    if (!q) return { student, profile, score: 0 };
    const name = student.name.toLowerCase();
    const abbr = initials(student.name);
    const alias = (student.alias || '').toLowerCase();
    const extra = `${student.note || ''} ${profile?.name || ''}`.toLowerCase();
    const score = name === q || alias === q ? 5 : name.startsWith(q) || abbr.startsWith(q) ? 4 : name.includes(q) || abbr.includes(q) ? 3 : alias.includes(q) ? 2 : extra.includes(q) ? 1 : 0;
    return { student, profile, score };
  }).filter(r => !q || r.score > 0);
  return scored.sort((a, b) => b.score - a.score || (b.student.lastUsed || 0) - (a.student.lastUsed || 0) || a.student.name.localeCompare(b.student.name, 'zh-CN'));
}

// 某个学生某种方式的最终网址。# 后的 zyzd-* 参数由 content/zujuan.js 读取后去掉：
// 智能组卷附带要自动选择的教材；bag 为真时组卷网页面会检查试题篮里有没有旧题
export function targetUrl(profile, kind, { bag = false } = {}) {
  if (!profile) return '';
  if (kind === 'xkw') return profile.xkwUrl || '';
  const base = (kind === 'chapter' ? profile.chapterUrl : profile.zhinengUrl || zhinengFromChapter(profile.chapterUrl)) || '';
  if (!base) return '';
  const hash = new URLSearchParams();
  if (kind === 'zhineng' && profile.versionId) {
    hash.set('zyzd-v', profile.versionId);
    if (profile.grade) hash.set('zyzd-g', profile.grade);
  }
  if (bag && base.startsWith('https://zujuan.xkw.com/')) hash.set('zyzd-bag', '1');
  return hash.size ? `${base.split('#')[0]}#${hash}` : base;
}

export function zhinengFromChapter(url) {
  const match = /^https:\/\/zujuan\.xkw\.com\/([a-z]+)\//.exec(url || '');
  return match ? `https://zujuan.xkw.com/${match[1]}/zhineng/` : '';
}

export async function markUsed(studentId) {
  await mutate(data => { const s = data.students.find(x => x.id === studentId); if (s) s.lastUsed = Date.now(); });
}

export async function open(studentId, kind, { tab } = {}) {
  const data = await load();
  const student = data.students.find(s => s.id === studentId);
  const url = targetUrl(data.profiles.find(p => p.id === student?.profileId), kind, { bag: data.settings?.checkBasket !== false });
  if (!url) return false;
  if (tab?.replace) await chrome.tabs.update(tab.id, { url });
  else await chrome.tabs.create({ url, active: tab?.active !== false, ...(tab?.index != null ? { index: tab.index + 1 } : {}) });
  await markUsed(studentId);
  return true;
}

// 年级缩写：九年级上册 → 九上；必修第一册 → 必修一
export function shortGrade(grade) {
  const m = /^(.)年级([上下])册$/.exec(grade || '');
  if (m) return m[1] + m[2];
  return (grade || '').replace(/第(.)册/, '$1').replace(/册$/, '');
}

// 从页面标题兜底识别版本和年级（组卷网以页面里选中的按钮为准）
const VERSION_RE = /(人教[AB]版|人教版|北师大版|华东师大版|华师大版|苏科版|苏教版|北京版|沪教版|沪科版|冀教版|鲁教版|青岛版|湘教版|浙教版|浙科版|粤教版)(（[^）]*）)*/;
const GRADE_RE = /([一二三四五六七八九]年级[上下]册|选择性必修第[一二三四]册|必修第[一二三四]册)/;
export function parseTitle(title) {
  return { versionName: VERSION_RE.exec(title || '')?.[0] || '', grade: GRADE_RE.exec(title || '')?.[0] || '' };
}

export function validateImport(obj) {
  if (!obj || !Array.isArray(obj.profiles) || !Array.isArray(obj.students)) throw new Error('不是作业直达的备份文件');
  return { version: 1, profiles: obj.profiles, students: obj.students, ...(obj.settings ? { settings: obj.settings } : {}) };
}
