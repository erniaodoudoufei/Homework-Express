(() => {
  const REQUEST = 'mathgao-homework-request';
  const RESPONSE = 'mathgao-homework-response';
  const EVENT = 'mathgao-homework-event';
  const actions = new Set(['HELLO', 'RESOLVE', 'LIST', 'BIND', 'OPEN', 'MANAGE']);
  const post = payload => window.postMessage(payload, location.origin);
  window.addEventListener('message', async event => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin || message?.channel !== REQUEST
      || typeof message.id !== 'string' || message.id.length > 100 || !actions.has(message.action)) return;
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'ZYZD_SCHEDULE', action: message.action,
        context: message.context, extensionStudentId: message.extensionStudentId,
        kind: message.kind, background: message.background, mode: message.mode
      });
      post({ channel: RESPONSE, id: message.id, result });
    } catch {
      post({ channel: RESPONSE, id: message.id, result: { ok: false, error: '插件连接已失效，请刷新课程表。' } });
    }
  });
  let changeTimer;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.data || changes.scheduleBindings)) {
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => post({ channel: EVENT, type: 'changed' }), 100);
    }
  });
  post({ channel: EVENT, type: 'ready' });
})();
