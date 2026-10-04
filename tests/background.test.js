import assert from 'node:assert/strict';
import test from 'node:test';

const storage = {};
const callbacks = [];
const opened = [];
const noopEvent = { addListener() {} };
globalThis.chrome = {
  storage: { local: { async get(key) { return { [key]: structuredClone(storage[key]) }; }, async set(value) { Object.assign(storage, structuredClone(value)); } }, onChanged: noopEvent },
  runtime: { onMessage: { addListener: callback => callbacks.push(callback) }, onInstalled: noopEvent, onStartup: noopEvent,
    getManifest: () => ({ version: '1.5.0' }), getURL: path => 'chrome-extension://test/' + path },
  tabs: { async create(value) { opened.push(value); } },
  omnibox: { onInputChanged: noopEvent, onInputEntered: noopEvent, setDefaultSuggestion() {} }
};
await import('../extension/background.js');
const sender = { url: 'https://ke.mathgao.com/', frameId: 0, tab: { id: 8, index: 2 } };
const context = { ownerId: 1, studentId: 2, name: '张三' };
const message = (action, fields = {}, source = sender) => new Promise(resolve => callbacks[0]({ type: 'ZYZD_SCHEDULE', action, context, ...fields }, source, resolve));
function reset() {
  storage.data = { version: 1, profiles: [{ id: 'p', name: '教材', chapterUrl: 'https://zujuan.xkw.com/czsx/zj1/', xkwUrl: 'https://sx.zxxk.com/m/books-b1/' }],
    settings: { checkBasket: true }, students: [{ id: 'a', name: '张三', profileId: 'p' }, { id: 'b', name: '李四', profileId: 'p' }] };
  storage.scheduleBindings = {};
  opened.length = 0;
}

test('worker rejects unapproved sources and malformed commands without opening tabs', async () => {
  reset();
  assert.equal((await message('OPEN', { kind: 'chapter' }, { ...sender, url: 'https://evil.test' })).ok, false);
  assert.equal((await message('OPEN', { kind: 'chapter' }, { ...sender, frameId: 1 })).ok, false);
  assert.equal((await message('RUN_SCRIPT')).ok, false);
  assert.equal((await message('RESOLVE', { context: { ownerId: -1, studentId: 2, name: '张三' } })).ok, false);
  assert.equal(opened.length, 0);
});
test('unique resolution persists, open validates the binding rather than trusting a supplied target ID', async () => {
  reset();
  assert.equal((await message('HELLO')).data.bridgeVersion, 1);
  assert.equal((await message('RESOLVE')).data.extensionStudentId, 'a');
  assert.equal(storage.scheduleBindings['1:2'], 'a');
  assert.equal((await message('OPEN', { kind: 'chapter', background: true, extensionStudentId: 'b' })).ok, true);
  assert.equal(opened[0].active, false);
  assert.equal(opened[0].index, 3);
  assert(opened[0].url.includes('zyzd-bag=1'));
  assert.equal((await message('OPEN', { kind: 'arbitrary', url: 'https://evil.test' })).ok, false);
  assert.equal(opened.length, 1);
});
test('association rebinding and editing do not modify students or accept arbitrary extension pages', async () => {
  reset();
  const before = structuredClone(storage.data);
  assert.equal((await message('BIND', { extensionStudentId: 'b' })).ok, true);
  assert.equal((await message('RESOLVE')).data.extensionStudentId, 'b');
  assert.deepEqual(storage.data, before);
  assert.equal((await message('MANAGE', { mode: 'edit' })).ok, true);
  assert(opened[0].url.endsWith('popup.html?full=&edit=b'));
  assert.equal((await message('MANAGE', { mode: 'arbitrary' })).ok, false);
  assert.equal((await message('BIND', { extensionStudentId: 'gone' })).ok, false);
});
test('two domain aliases share associations and current settings control basket checks', async () => {
  reset();
  await message('BIND', { extensionStudentId: 'b' });
  const alias = { ...sender, url: 'https://ke.7711111.xyz/' };
  assert.equal((await message('RESOLVE', {}, alias)).data.extensionStudentId, 'b');
  storage.data.settings.checkBasket = false;
  assert.equal((await message('OPEN', { kind: 'chapter' }, alias)).ok, true);
  assert(!opened[0].url.includes('zyzd-bag'));
});
