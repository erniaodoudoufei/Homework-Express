import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedScheduleSender, bindingKey, describeStudent, resolveStudent, validateBindings } from '../extension/schedule-links.js';
import { targetUrl, validateImport } from '../extension/store.js';

const data = {
  version: 1,
  profiles: [{ id: 'p', name: '北师大八上', chapterUrl: 'https://zujuan.xkw.com/czsx/zj1/',
    zhinengUrl: 'https://zujuan.xkw.com/czsx/zhineng/', versionId: '42', grade: '八年级上册', xkwUrl: 'https://sx.zxxk.com/m/books-b1/' }],
  students: [{ id: 'a', name: '张三', alias: '小张, 三班', profileId: 'p' }, { id: 'b', name: '李四', alias: '小李', profileId: 'p' }]
};
const context = { ownerId: 1, studentId: 10, name: ' 张三 ' };

test('unique exact name and alias matching, no fuzzy or first duplicate match', () => {
  assert.equal(resolveStudent(data, {}, context).extensionStudentId, 'a');
  assert.equal(resolveStudent(data, {}, { ...context, name: '小张' }).extensionStudentId, 'a');
  assert.equal(resolveStudent(data, {}, { ...context, name: '张' }).status, 'missing');
  const repeated = { ...data, students: [...data.students, { ...data.students[0], id: 'c' }] };
  assert.equal(resolveStudent(repeated, {}, context).status, 'ambiguous');
  assert.equal(resolveStudent(repeated, {}, { ...context, name: '小张' }).status, 'ambiguous');
});
test('saved association survives rename, separates accounts, and marks deleted IDs stale', () => {
  const bindings = { '1:10': 'b', '2:10': 'a' };
  assert.equal(resolveStudent(data, bindings, { ...context, name: '改名' }).extensionStudentId, 'b');
  assert.equal(resolveStudent(data, bindings, { ...context, ownerId: 2 }).extensionStudentId, 'a');
  assert.equal(resolveStudent(data, { '1:10': 'gone' }, context).status, 'stale');
  assert.throws(() => bindingKey({ ownerId: 0, studentId: 1 }));
});
test('both public domains allowed, subframes and lookalike origins rejected', () => {
  for (const origin of ['https://ke.mathgao.com', 'https://ke.7711111.xyz']) assert(allowedScheduleSender({ url: origin + '/', frameId: 0 }));
  assert(!allowedScheduleSender({ url: 'https://ke.mathgao.com.evil.test', frameId: 0 }));
  assert(!allowedScheduleSender({ url: 'https://ke.mathgao.com', frameId: 1 }));
  assert(!allowedScheduleSender({ url: 'http://ke.mathgao.com', frameId: 0 }));
});
test('resource metadata preserves custom labels and accepts only http(s) destinations', () => {
  const custom = { ...data, profiles: [{ id: 'p', name: '自定义', chapterUrl: 'https://example.com/prepare',
    labels: { chapter: '自定义备课' }, xkwUrl: 'javascript:alert(1)' }] };
  assert.deepEqual(describeStudent(custom, data.students[0]).links, [{ kind: 'chapter', label: '自定义备课' }]);
});
test('version, grade and basket setting are preserved; ordinary xkw URL unchanged', () => {
  const profile = data.profiles[0];
  const url = new URL(targetUrl(profile, 'zhineng', { bag: true }));
  const hash = new URLSearchParams(url.hash.slice(1));
  assert.equal(hash.get('zyzd-v'), '42'); assert.equal(hash.get('zyzd-g'), '八年级上册'); assert.equal(hash.get('zyzd-bag'), '1');
  assert(!targetUrl(profile, 'chapter', { bag: false }).includes('zyzd-bag'));
  assert.equal(targetUrl(profile, 'xkw', { bag: true }), profile.xkwUrl);
});
test('new backup bindings round trip; old version 1 backups and stale binding IDs are safe', () => {
  const backup = JSON.parse(JSON.stringify({ ...data, scheduleBindings: { '1:10': 'a', '2:10': 'missing', '__proto__': 'b', 'invalid': 'b' } }));
  const incoming = validateImport(backup);
  assert.deepEqual(validateBindings(backup.scheduleBindings, incoming), { '1:10': 'a' });
  assert.deepEqual(validateBindings(undefined, validateImport(data)), {});
  assert.deepEqual(validateBindings([], data), {});
});
