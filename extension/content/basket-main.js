// 运行在组卷网页面自己的脚本环境（MAIN world），只响应 content/zujuan.js 发来的请求。
// 组卷网有两份「旧题」：
//   试题篮   ZujuanCom.QuestionBasketModule.questionBasketManager，与服务器 /zujuan-api/sync_baskets 同步
//   组卷草稿 ZujuanCom.Paper（「有组卷草稿未完成」），与服务器 /zujuan-api/sync_version 同步
// 清空用的都是网站自己的函数，效果和在网站上手动删除一样（可在【我的-选题记录】找回）。
(() => {
  const reply = (id, result) => document.dispatchEvent(new CustomEvent('zyzd:bag-reply', { detail: JSON.stringify({ id, ...result }) }));
  const request = e => { try { return JSON.parse(e.detail); } catch { return {}; } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // 服务器同步请求完成后会出现在资源记录里，据此判断「已从服务器拉到最新」「清空已提交」
  const synced = name => performance.getEntriesByType('resource').filter(e => e.name.includes(`/zujuan-api/${name}`)).length;

  function read() {
    const manager = window.ZujuanCom?.QuestionBasketModule?.questionBasketManager;
    const paper = window.ZujuanCom?.Paper;
    try {
      if (!manager?.findAllQuestionIds || !paper?.QuesCount) return { ready: false };
      return {
        ready: true,
        basket: manager.findAllQuestionIds().length,
        draft: paper.QuesCount(),
        synced: synced('sync_baskets') > 0,
        canClear: typeof manager.clearBasket === 'function' && typeof window.ZujuanCom.quesBasketOperation?.emptyQuesBatch === 'function'
      };
    } catch {
      return { ready: false };
    }
  }

  document.addEventListener('zyzd:bag-count', e => reply(request(e).id, read()));

  document.addEventListener('zyzd:bag-clear', async e => {
    const { id } = request(e);
    try {
      const { ZujuanCom } = window;
      const manager = ZujuanCom.QuestionBasketModule.questionBasketManager;
      const before = { baskets: synced('sync_baskets'), version: synced('sync_version') };
      const hadDraft = ZujuanCom.Paper.QuesCount() > 0;
      const hadBasket = manager.findAllQuestionIds().length > 0;
      // 先清组卷草稿（网站「清空试题」确认后执行的就是它），再清试题篮（false = 同步到服务器）
      if (hadDraft) ZujuanCom.quesBasketOperation.emptyQuesBatch();
      if (hadBasket) manager.clearBasket(false);
      // 等同步请求发完再让页面刷新，免得请求被中断、服务器上还留着旧题
      for (const end = Date.now() + 6000; Date.now() < end; await sleep(150)) {
        if ((!hadBasket || synced('sync_baskets') > before.baskets) && (!hadDraft || synced('sync_version') > before.version)) break;
      }
      await sleep(300);
      reply(id, { ok: manager.findAllQuestionIds().length === 0 && ZujuanCom.Paper.QuesCount() === 0 });
    } catch {
      reply(id, { ok: false });
    }
  });
})();
