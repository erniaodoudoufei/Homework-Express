// 课程表（ke.mathgao.com）页面：在课程卡片上提供「作业」入口，按学生姓名到作业直达里查三个链接。
// 不改动课程表自己的任何元素，只在页面上方叠加自己的浮动按钮和菜单（Shadow DOM 隔离样式），
// 课程表的点击、勾选、整理模式拖动都不受影响。
(() => {
  // 时间轴卡片 / 紧凑模式的一行；以及其中的学生姓名
  const CARD = 'article.timeline-lesson, label.lesson-row';
  const NAME = '.timeline-lesson-copy strong, .lesson-name';
  const usable = card => card && !card.hasAttribute('data-homework-integrated') && !card.classList.contains('organizing') && card.querySelector(NAME)?.textContent.trim();

  const host = document.createElement('div');
  host.id = 'zyzd-schedule';
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:calc(var(--z-toolbar, 100) + 5)';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    *{box-sizing:border-box;font-family:"Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif}
    .pill{position:fixed;pointer-events:auto;height:18px;padding:0 8px;border:none;border-radius:9px;background:#d93025;color:#fff;font-size:11px;font-weight:600;line-height:18px;cursor:pointer;box-shadow:0 1px 4px #0003}
    .pill:hover{background:#b3261e}
    .menu{position:fixed;pointer-events:auto;min-width:210px;max-width:280px;background:#fff;border:1px solid #dfe4e8;border-radius:10px;box-shadow:0 10px 30px #0000002e;padding:10px;color:#233441;font-size:13px}
    .head{display:flex;align-items:center;gap:7px;margin-bottom:8px}
    .dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    .head b{font-size:14px}.head span{color:#6f7d88;font-size:12px}
    .links{display:grid;gap:5px}
    .links button{border:1px solid #d5dee5;background:#f7f9fb;border-radius:7px;padding:7px 10px;text-align:left;font-size:13px;color:#233441;cursor:pointer}
    .links button:hover{background:#2a5d84;border-color:#2a5d84;color:#fff}
    .foot{margin-top:8px;padding-top:7px;border-top:1px solid #eef1f3;display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;color:#8a959d}
    .foot a{color:#2a5d84;cursor:pointer;text-decoration:none}.foot a:hover{text-decoration:underline}
    .empty{color:#6f7d88;line-height:1.7;margin-bottom:8px}
    .primary{width:100%;border:none;border-radius:7px;padding:7px 10px;background:#2a5d84;color:#fff;font-size:13px;cursor:pointer}
  </style><button class="pill" hidden>作业</button><div class="menu" hidden></div>`;
  const pill = root.querySelector('.pill');
  const menu = root.querySelector('.menu');
  (document.body || document.documentElement).append(host);

  const ask = message => chrome.runtime.sendMessage(message).catch(() => null);
  const h = (tag, props = {}, ...children) => { const el = Object.assign(document.createElement(tag), props); el.append(...children.filter(Boolean)); return el; };

  // ---------- 悬停按钮 ----------
  let hovered = null;
  function placePill(card) {
    const r = card.getBoundingClientRect();
    let right = r.right - 4;
    // 卡片较矮或是紧凑模式的一行时，避开右侧「未付费 / 试听」等状态标签
    const statuses = [...card.querySelectorAll('.timeline-statuses > *, .status-pill')];
    if (statuses.length && (r.height < 44 || card.matches('label.lesson-row'))) right = Math.min(...statuses.map(s => s.getBoundingClientRect().left)) - 4;
    const top = card.matches('label.lesson-row') ? r.top + (r.height - 18) / 2 : r.bottom - 21;
    pill.style.left = `${Math.max(r.left + 2, right - pill.offsetWidth)}px`;
    pill.style.top = `${top}px`;
  }
  function showPill(card) {
    hovered = card;
    pill.hidden = false;
    placePill(card);
  }
  function hidePill() { hovered = null; pill.hidden = true; }

  document.addEventListener('pointerover', e => {
    const card = e.target.closest?.(CARD);
    if (card && usable(card)) showPill(card);
  }, true);
  document.addEventListener('pointerout', e => {
    if (!hovered || !e.target.closest?.(CARD)) return;
    const to = e.relatedTarget;
    if (to === host || (to && hovered.contains(to))) return; // 移到按钮上或卡片内部不隐藏
    hidePill();
  }, true);
  pill.addEventListener('pointerleave', e => { if (!hovered?.contains(e.relatedTarget)) hidePill(); });
  pill.addEventListener('click', e => {
    e.stopPropagation();
    if (!hovered) return;
    const r = pill.getBoundingClientRect();
    openMenu(hovered, r.right, r.bottom + 4, true);
  });

  // ---------- 右键菜单 ----------
  document.addEventListener('contextmenu', e => {
    const card = e.target.closest?.(CARD);
    if (!usable(card)) return;
    e.preventDefault();
    openMenu(card, e.clientX, e.clientY, false);
  }, true);

  // ---------- 菜单 ----------
  let menuToken = 0;
  async function openMenu(card, x, y, alignRight) {
    const name = card.querySelector(NAME).textContent.trim();
    const token = ++menuToken;
    menu.replaceChildren(h('div', { className: 'empty', textContent: `正在查找「${name}」…` }));
    position(x, y, alignRight);
    const info = await ask({ type: 'ZYZD_LOOKUP', name });
    if (token !== menuToken) return;
    if (!info) {
      menu.replaceChildren(h('div', { className: 'empty', textContent: '作业直达插件已更新，请刷新这个页面。' }));
    } else if (!info.found) {
      menu.replaceChildren(
        h('div', { className: 'empty' }, `作业直达里还没有「${name}」。`, h('br'), '如果名字不一样，可在作业直达里给学生加「搜索别名」。'),
        h('button', { className: 'primary', textContent: `添加「${name}」到作业直达`, onclick: () => { ask({ type: 'ZYZD_MANAGE', add: name }); closeMenu(); } }));
    } else {
      const dot = h('i', { className: 'dot' });
      dot.style.background = info.color;
      const links = info.links.map(link => h('button', {
        textContent: link.label,
        title: 'Ctrl+点击：在后台打开，菜单不关',
        onclick: e => {
          ask({ type: 'ZYZD_OPEN', studentId: info.studentId, kind: link.kind, background: e.ctrlKey || e.metaKey });
          if (!(e.ctrlKey || e.metaKey)) closeMenu();
        }
      }));
      menu.replaceChildren(
        h('div', { className: 'head' }, dot, h('b', { textContent: info.studentName }), h('span', { textContent: info.profileName || '未设置教材' })),
        links.length ? h('div', { className: 'links' }, ...links) : h('div', { className: 'empty', textContent: '这个学生的教材档案还没有网址。' }),
        h('div', { className: 'foot' }, h('span', { textContent: '作业直达' }), h('a', { textContent: '编辑', onclick: () => { ask({ type: 'ZYZD_MANAGE', edit: info.studentId }); closeMenu(); } })));
    }
    position(x, y, alignRight);
  }
  function position(x, y, alignRight) {
    menu.hidden = false;
    const w = menu.offsetWidth, ht = menu.offsetHeight;
    let left = alignRight ? x - w : x;
    let top = y;
    left = Math.min(Math.max(8, left), innerWidth - w - 8);
    if (top + ht > innerHeight - 8) top = Math.max(8, y - ht - (alignRight ? 30 : 0));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }
  function closeMenu() { menuToken++; menu.hidden = true; }

  document.addEventListener('pointerdown', e => { if (!menu.hidden && !e.composedPath().includes(host)) closeMenu(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); hidePill(); } }, true);
  // 页面滚动（包括课程表内部的滚动区域）或缩放时，按钮和菜单的位置会对不上，直接收起
  addEventListener('scroll', () => { hidePill(); closeMenu(); }, true);
  addEventListener('resize', () => { hidePill(); closeMenu(); });
})();
