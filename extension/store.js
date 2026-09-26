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

// 学生列表的颜色分组：小学、初中按年级，高中按册别；非组卷网档案或识别不出的归「其他」。
// 先看档案的年级字段（会被自动补全），没有再看档案名称（如「北师大·八上」「人教A版·必修一」）
export const GROUPS = [
  { key: 'g7', name: '七年级', color: '#0f95a3', test: /七年级|七[上下]/ },
  { key: 'g8', name: '八年级', color: '#2f6fd6', test: /八年级|八[上下]/ },
  { key: 'g9', name: '九年级', color: '#7b4bd1', test: /九年级|九[上下]/ },
  { key: 'x1', name: '选必一', color: '#d6456f', test: /选择性必修第?一|选必一/ },
  { key: 'x2', name: '选必二', color: '#b04aa0', test: /选择性必修第?二|选必二/ },
  { key: 'x3', name: '选必三', color: '#9c3d54', test: /选择性必修第?三|选必三/ },
  { key: 'b1', name: '必修一', color: '#e07b16', test: /必修第?一/ },
  { key: 'b2', name: '必修二', color: '#b8860b', test: /必修第?二/ },
  { key: 'b3', name: '必修三', color: '#c0532f', test: /必修第?三/ },
  { key: 'pri', name: '小学', color: '#2e9d5b', test: /[一二三四五六]年级|[一二三四五六][上下]/ }
];
export const OTHER_GROUP = { key: 'other', name: '其他', color: '#8a94a0' };
export function gradeGroup(profile) {
  if (!profile || !isZujuanChapter(profile.chapterUrl)) return OTHER_GROUP;
  for (const text of [profile.grade, profile.name]) {
    const plain = (text || '').replace(/\s+/g, '');
    const group = plain && GROUPS.find(g => g.test.test(plain));
    if (group) return group;
  }
  return OTHER_GROUP;
}

// 按钮文字：档案可自定义（非学科网学生用，如「Claude 作业」），没填用默认名
export const buttonLabel = (profile, kind) => profile?.labels?.[kind]?.trim() || KINDS[kind].name;

export const isZujuanChapter = url => /^https:\/\/zujuan\.xkw\.com\/[a-z]+\/zj\d+\/?(?:[?#]|$)/.test(url || '');
export const isZujuanZhineng = url => /^https:\/\/zujuan\.xkw\.com\/[a-z]+\/zhineng\//.test(url || '');

// 组卷网章节选题页的原始 HTML 里：选中的版本按钮带 versionid，选中的年级按钮带 data-qbmid，
// 而 data-qbmid 就是学科网的书本编号（sx.zxxk.com/{学段}/books-b{编号}/）
export const XKW_STAGE = { czsx: 'm', gzsx: 'h', xxsx: 'p' };
const decodeEntities = text => text
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .trim();
const attr = (attrs, name) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1] || '';
function selectedLink(html, id) {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) return null;
  const block = html.slice(start, html.indexOf('</div>', start));
  for (const [, attrs, text] of block.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)) {
    if (/\bselected\b/.test(attr(attrs, 'class'))) return { attrs, text: decodeEntities(text) };
  }
  return null;
}
export function parseChapterPage(html, chapterUrl) {
  const version = selectedLink(html, 'chapter_textbook_version');
  const book = selectedLink(html, 'chapter_textbooks');
  const stage = XKW_STAGE[/^https:\/\/zujuan\.xkw\.com\/([a-z]+)\//.exec(chapterUrl || '')?.[1]];
  const qbmid = book && attr(book.attrs, 'data-qbmid');
  return {
    versionId: version ? attr(version.attrs, 'versionid') : '',
    versionName: version?.text || '',
    grade: book?.text || '',
    xkwUrl: stage && qbmid ? `https://sx.zxxk.com/${stage}/books-b${qbmid}/` : ''
  };
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

// 年级缩写：九年级上册 → 九上；必修 第一册 → 必修一
export function shortGrade(grade) {
  const text = (grade || '').replace(/\s+/g, '');
  const m = /^(.)年级([上下])册$/.exec(text);
  if (m) return m[1] + m[2];
  return text.replace(/第(.)册/, '$1').replace(/册$/, '');
}

// 从页面标题兜底识别版本和年级（组卷网以页面里选中的按钮为准）
const VERSION_RE = /(人教[AB]版|人教版|北师大版|华东师大版|华师大版|苏科版|苏教版|北京版|沪教版|沪科版|冀教版|鲁教版|青岛版|湘教版|浙教版|浙科版|粤教版)(（[^）]*）)*/;
const GRADE_RE = /([一二三四五六七八九]年级[上下]册|选择性必修\s?第[一二三四]册|必修\s?第[一二三四]册)/;
export function parseTitle(title) {
  return { versionName: VERSION_RE.exec(title || '')?.[0] || '', grade: GRADE_RE.exec(title || '')?.[0] || '' };
}

export function validateImport(obj) {
  if (!obj || !Array.isArray(obj.profiles) || !Array.isArray(obj.students)) throw new Error('不是作业直达的备份文件');
  return { version: 1, profiles: obj.profiles, students: obj.students, ...(obj.settings ? { settings: obj.settings } : {}) };
}
