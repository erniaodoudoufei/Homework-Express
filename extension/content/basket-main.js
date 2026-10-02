// 运行在组卷网页面自己的脚本环境（MAIN world），只响应 content/zujuan.js 发来的请求。
// 只管试题篮（ZujuanCom.QuestionBasketModule.questionBasketManager，与服务器 /zujuan-api/sync_baskets 同步）；
// 组卷草稿（「有组卷草稿未完成 → 继续编辑」那份试卷）是另一个地方，插件不读也不动。
// 清空用的是网站自己的函数，效果和在网站上手动删除一样（可在【我的-选题记录】找回）。
(() => {
  const reply = (id, result) => document.dispatchEvent(new CustomEvent('zyzd:bag-reply', { detail: JSON.stringify({ id, ...result }) }));
  const request = e => { try { return JSON.parse(e.detail); } catch { return {}; } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // 服务器同步请求完成后会出现在资源记录里，据此判断「已从服务器拉到最新」「清空已提交」
  const synced = () => performance.getEntriesByType('resource').filter(e => e.name.includes('/zujuan-api/sync_baskets')).length;

  // 计数方式和网站自己画试题篮时一致：先按本页学段从本地存储重新载入
  function read() {
    const manager = window.ZujuanCom?.QuestionBasketModule?.questionBasketManager;
    try {
      if (!manager?.findAllQuestionIds) return { ready: false };
      manager.initQuestions?.();
      return {
        ready: true,
        basket: manager.findAllQuestionIds().length,
        synced: synced() > 0,
        canClear: typeof manager.clearBasket === 'function'
      };
    } catch {
      return { ready: false };
    }
  }

  document.addEventListener('zyzd:bag-count', e => reply(request(e).id, read()));

  document.addEventListener('zyzd:bag-clear', async e => {
    const { id } = request(e);
    try {
      const manager = window.ZujuanCom.QuestionBasketModule.questionBasketManager;
      const before = synced();
      manager.clearBasket(false); // false = 同时同步到服务器
      // 等同步请求发完再让页面刷新，免得请求被中断、服务器上还留着旧题
      for (const end = Date.now() + 6000; Date.now() < end && synced() <= before; await sleep(150));
      await sleep(300);
      reply(id, { ok: manager.findAllQuestionIds().length === 0 });
    } catch {
      reply(id, { ok: false });
    }
  });
})();
