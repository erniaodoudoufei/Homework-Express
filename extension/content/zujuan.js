// 组卷网页面：读取插件打开时写在网址 # 后的 zyzd-* 参数（读完立即去掉）
//   zyzd-v / zyzd-g：智能组卷页网址不记教材，这里代为点选教材版本并定位年级
//   zyzd-bag：检查试题篮里有没有旧题，有就提醒一键清空
(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const versionId = params.get('zyzd-v');
  const grade = params.get('zyzd-g');
  const checkBag = params.get('zyzd-bag') === '1';
  if ([...params.keys()].some(k => k.startsWith('zyzd-'))) history.replaceState(history.state, '', location.pathname + location.search);
  const CLEARED = 'zyzd-cleared';
  const justCleared = sessionStorage.getItem(CLEARED);
  sessionStorage.removeItem(CLEARED);
  if (!versionId && !checkBag && !justCleared) return;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, ms = 15000) {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
      const result = await fn();
      if (result) return result;
    }
    return null;
  }

  // ---------- 智能组卷：自动选教材 ----------
  const versionLink = () => document.querySelector(`#chapter_textbook_version a[versionid="${CSS.escape(versionId)}"]`);
  const gradeAnchor = () => grade && document.querySelector(`a.tree-anchor[title="${CSS.escape(grade)}"]`);

  async function select() {
    // 等目录树初次渲染完（说明页面脚本已就绪），再点教材按钮
    const link = await until(() => document.querySelector('a.tree-anchor') && versionLink());
    if (!link) return false;
    if (link.classList.contains('selected')) return true;
    const oldTree = document.querySelector('a.tree-anchor');
    link.click();
    // 目录树重新渲染后旧节点会被替换
    return !!await until(() => versionLink()?.classList.contains('selected') && document.querySelector('a.tree-anchor') !== oldTree, 10000);
  }

  async function selectTextbook() {
    if (!await select()) return;
    // 已登录时网站可能稍后再恢复账号上次用过的教材，确认一次
    await sleep(1500);
    if (!versionLink()?.classList.contains('selected') && !await select()) return;
    const anchor = await until(gradeAnchor, 5000);
    if (!anchor) return;
    // 页面自己的引导等脚本可能把滚动打断，稍后不在视野里就再滚一次
    anchor.scrollIntoView({ block: 'center' });
    await sleep(800);
    const { top, bottom } = anchor.getBoundingClientRect();
    if (top < 0 || bottom > innerHeight) anchor.scrollIntoView({ block: 'center' });
    const row = anchor.closest('.tree-node-name') || anchor;
    row.style.transition = 'background-color .6s';
    row.style.backgroundColor = '#fff3c4';
    setTimeout(() => { row.style.backgroundColor = ''; }, 2400);
  }

  // ---------- 试题篮：和页面环境里的 content/basket-main.js 通过页面事件通信 ----------
  function ask(type, timeout = 1000) {
    const id = Math.random().toString(36).slice(2);
    return new Promise(resolve => {
      const done = result => { document.removeEventListener('zyzd:bag-reply', onReply); resolve(result); };
      const onReply = e => { try { const r = JSON.parse(e.detail); if (r.id === id) done(r); } catch { /* 不是插件的消息 */ } };
      document.addEventListener('zyzd:bag-reply', onReply);
      document.dispatchEvent(new CustomEvent(`zyzd:${type}`, { detail: JSON.stringify({ id }) }));
      setTimeout(() => done(null), timeout);
    });
  }
  const badgeCount = () => {
    const n = parseInt(document.querySelector('#quescount2')?.textContent, 10);
    return Number.isNaN(n) ? null : n;
  };
  // 读题数（试题篮 basket + 组卷草稿 draft）：优先网站函数，读不到时退回图标上的角标数字
  async function readBag() {
    const ready = await until(async () => {
      const r = await ask('bag-count');
      return r?.ready ? r : null;
    });
    if (ready) {
      // 已登录时试题篮要等页面从服务器同步下来才准
      await until(async () => (await ask('bag-count'))?.synced, 6000);
      await sleep(500);
      const bag = (await ask('bag-count')) || ready;
      return { ...bag, total: bag.basket + bag.draft };
    }
    const basket = badgeCount();
    return basket == null ? null : { basket, draft: 0, total: basket, canClear: false };
  }
  const describe = ({ basket, draft }) => [basket && `试题篮里还有 <b>${basket}</b> 道`, draft && `组卷草稿里还有 <b>${draft}</b> 道`].filter(Boolean).join('、');

  function mount(html) {
    document.getElementById('zyzd-host')?.remove();
    const host = document.createElement('div');
    host.id = 'zyzd-host';
    // 整行居中；外层不挡鼠标，只有提示条本身可点
    host.style.cssText = 'position:fixed;top:14px;left:12px;right:12px;display:flex;justify-content:center;pointer-events:none;z-index:2147483647';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .bar{pointer-events:auto;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;background:#fff;border:1px solid #f0c9a8;border-left:5px solid #e8883a;border-radius:10px;box-shadow:0 8px 30px #0000002a;padding:12px 16px;font:14px/1.6 "Microsoft YaHei UI","Microsoft YaHei",sans-serif;color:#2b3440;max-width:680px}
      .bar.ok{border-color:#b9dcc5;border-left-color:#2f8a57}
      .txt{flex:1 1 260px}.txt b{color:#c2410c;font-size:16px}.txt small{display:block;color:#7b8590;font-size:12px}
      button{font:inherit;border-radius:7px;padding:7px 16px;cursor:pointer;white-space:nowrap}
      .primary{background:#2a5d84;color:#fff;border:1px solid #2a5d84;font-weight:600}.primary:hover{background:#1f4a6b}
      .primary:disabled{opacity:.6;cursor:default}
      .ghost{background:#fff;color:#4b5563;border:1px solid #d1d5db}.ghost:hover{border-color:#2a5d84;color:#2a5d84}
    </style><div class="bar">${html}</div>`;
    (document.body || document.documentElement).append(host);
    return root;
  }
  const close = () => document.getElementById('zyzd-host')?.remove();
  function toast(text) {
    const root = mount(`<div class="txt">${text}</div>`);
    root.querySelector('.bar').classList.add('ok');
    // 后台打开的标签页，等切过来看到了再开始计时
    const later = () => setTimeout(close, 3000);
    if (document.visibilityState === 'visible') later();
    else document.addEventListener('visibilitychange', later, { once: true });
  }
  function manual(text) {
    const root = mount(`<div class="txt">${text}<small>请点页面右侧的「试题篮」，全选后删除；组卷草稿在「继续编辑」里清空。</small></div><button class="ghost">知道了</button>`);
    root.querySelector('button').onclick = close;
    document.querySelector('[data-type="quesBasketNav"]')?.click();
  }

  async function clearBag() {
    sessionStorage.setItem(CLEARED, '1');
    const result = await ask('bag-clear', 10000);
    if (!result?.ok) {
      sessionStorage.removeItem(CLEARED);
      return manual('没能自动清空，可能还剩一些题。');
    }
    // 和网站自己清空后一样刷新页面；智能组卷把教材参数带回去，刷新后教材仍是选好的
    const keep = new URLSearchParams();
    if (versionId) keep.set('zyzd-v', versionId);
    if (grade) keep.set('zyzd-g', grade);
    history.replaceState(history.state, '', location.pathname + location.search + (keep.size ? `#${keep}` : ''));
    location.reload();
  }

  async function remindBag() {
    const bag = await readBag();
    if (!bag?.total) return;
    const root = mount(`<div class="txt">${describe(bag)}之前的题，会和这次的作业混在一起。<small>一键清空会同时清掉试题篮和组卷草稿，15 天内可在【我的 - 选题记录】找回</small></div><button class="primary">一键清空</button><button class="ghost">保留</button>`);
    const [clear, keep] = root.querySelectorAll('button');
    keep.onclick = close;
    clear.onclick = () => {
      if (!bag.canClear) return manual('这个页面没法自动清空试题篮。');
      clear.disabled = true;
      clear.textContent = '正在清空…';
      clearBag();
    };
  }

  async function confirmCleared() {
    const bag = await readBag();
    if (bag?.total) manual(`${describe(bag)}，可能没清空成功。`);
    else toast('✓ 试题篮和组卷草稿已清空，可以开始选这次的题了');
  }

  if (versionId && location.pathname.includes('/zhineng/')) selectTextbook();
  if (justCleared) confirmCleared();
  else if (checkBag) remindBag();
})();
