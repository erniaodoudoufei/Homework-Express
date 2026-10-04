import { KINDS, buttonLabel, targetUrl } from './store.js';

export const SCHEDULE_ORIGINS = ['https://ke.mathgao.com', 'https://ke.7711111.xyz'];
export const BRIDGE_VERSION = 1;
export const BINDINGS_KEY = 'scheduleBindings';
export const SCHEDULE_ACTIONS = ['HELLO', 'RESOLVE', 'LIST', 'BIND', 'OPEN', 'MANAGE'];

export function allowedScheduleSender(sender) {
  try { return sender.frameId === 0 && SCHEDULE_ORIGINS.includes(new URL(sender.url).origin); }
  catch { return false; }
}

export function bindingKey(context) {
  if (!Number.isSafeInteger(context?.ownerId) || context.ownerId < 1
    || !Number.isSafeInteger(context?.studentId) || context.studentId < 1) throw new Error('学生关联信息无效。');
  return `${context.ownerId}:${context.studentId}`;
}

export function describeStudent(data, student) {
  const profile = data.profiles.find(p => p.id === student.profileId);
  return {
    extensionStudentId: student.id, studentName: student.name,
    profileName: profile?.name || '未设置教材',
    links: Object.keys(KINDS).flatMap(kind => {
      const url = targetUrl(profile, kind);
      try {
        if (!['http:', 'https:'].includes(new URL(url).protocol)) return [];
      } catch { return []; }
      return [{ kind, label: buttonLabel(profile, kind) }];
    })
  };
}

export function resolveStudent(data, bindings, context) {
  const saved = bindings[bindingKey(context)];
  if (saved) {
    const student = data.students.find(s => s.id === saved);
    return student ? { status: 'found', ...describeStudent(data, student) } : { status: 'stale', candidates: [] };
  }
  const name = typeof context.name === 'string' ? context.name.trim() : '';
  if (!name) return { status: 'missing', candidates: [] };
  const exact = data.students.filter(s => s.name.trim() === name);
  const matches = exact.length ? exact : data.students.filter(s =>
    (s.alias || '').split(/[,，、\s]+/).some(alias => alias === name));
  if (matches.length === 1) return { status: 'found', ...describeStudent(data, matches[0]) };
  return { status: matches.length ? 'ambiguous' : 'missing', candidates: matches.map(s => describeStudent(data, s)) };
}

export function validateBindings(value, data) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const studentIds = new Set(data.students.map(s => s.id));
  return Object.fromEntries(Object.entries(value).filter(([key, id]) =>
    /^[1-9]\d*:[1-9]\d*$/.test(key) && typeof id === 'string' && studentIds.has(id)));
}
