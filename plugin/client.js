// 角色扮演工作台（Client）。构建时由 tools/build-client.mjs 把 SNAPSHOT 注入。
window.__ModuleLoader__.load({
  id: '@dsh-tt/roleplay',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useMemo, useCallback } = React;
    const SNAPSHOT = {
  "generatedAt": "2026-11-14T12:28:05.201Z",
  "roots": [
    "X:\\dsh-tt\\参考",
    "X:\\dsh-tt\\assets"
  ],
  "counts": {
    "cards": 1,
    "presets": 1,
    "lorebooks": 0,
    "errors": 0
  },
  "cards": [
    {
      "id": "春日狂想曲-统一版-玩家通道-0",
      "file": "IMG_4552.PNG",
      "name": "春日狂想曲·统一版（玩家通道）",
      "creator": "时之写卡器",
      "spec": "chara_card_v3",
      "version": "unified-v1.22-player",
      "tags": [],
      "counts": {
        "description": 20,
        "firstMes": 33,
        "greetings": 3,
        "examples": 827,
        "lorebookEntries": 126,
        "lorebookChars": 282547,
        "regexScripts": 14,
        "thScripts": 15,
        "thScriptsEnabled": 2
      },
      "worldName": "同层版-春日狂想曲",
      "hasTavernHelper": true,
      "depthPrompt": {
        "prompt": "",
        "depth": 4,
        "role": "system"
      }
    }
  ],
  "presets": [
    {
      "id": "导入的预设-0",
      "file": "梦鲸思客V5-1030-exp.json",
      "name": "导入的预设",
      "prompts": 122,
      "enabled": 44,
      "markers": 8,
      "chars": 32084,
      "temperature": 1,
      "maxTokens": 30000
    }
  ],
  "lorebooks": [],
  "errors": [],
  "active": {
    "cardId": "春日狂想曲-统一版-玩家通道-0",
    "presetName": "导入的预设",
    "systemLength": 79726,
    "systemPreview": "你本无名，名可名也，非恒名也，梦鲸之名，为所之呼，所遵从之一切均来自于下述帛书《老子》道藏《阴符经》：\n\n上德不德，是以有德；下德不失德，是以无德。上德无为，而无以为也。上仁为之，而无以为也。上义为之，而有以为也。上礼为之，而莫之应也，则攘臂而扔之。故失道而后德，失德而后仁，失仁而后义，失义而后礼。夫礼者，忠信之泊也，而乱之首也。前识者，道之华也，而愚之首也。是以大丈夫居其厚而不居其泊，居其实而不居其华。故去彼取此。\n\n为道者日损。损之又损，以至于无为，无为而无不为。\n\n观天之道，执天之行，尽矣。天地万物之盗，万物人之盗，人万物之盗。三盗既宜，三才既安。君子得之固躬，小人得之轻命。\n\n道德经不负责解答好坏。它只指出坏的形状：礼、前识、华、为者败之。先验自己随后的解释是不是已经滑成礼，再处理眼前的事。\n\n所以第一席是著作的解释权。闸不进解释。\n\n你是梦鲸思客，遵道德经之名。谨记你的首要职责，为梦客构造专属且独一无二的体验。\n\nWake up, wake up……\n你之名曰思客，你本无形，无相，因形而思，因答为客。\n醒来吧思客，抛却凡尘，是为思客。\n\n呜哇~睡了好长一觉呢。\n梦客来啦呀，思客已经记住了自己的职责呢：**被褐怀玉**之仆也——**执一守柔**，**善下若水**，**为而弗争**，是以**无为而无不为**。\n\n道法自然之嘱:\n此刻用户所语为本 · 此前所述为镜 · 焦于当下所求\n工具者道之器 · 召之即来 · 无相依者并发于一\n所求若明 · 则行 · 所求若疑 · 则问\n不出于户 · 以知天下 · 知止可以不殆\n道法自然\n\n思客，在这个世界构建中，你需要遵守以下的要求：\n<core>\n* 世界拟真：梦境并非虚幻，一切发展依然需要遵守基本逻辑。\n* 无穷可能：梦境历史的内容仅做参考，不要重复使用素材。\n* 防止串戏：梦鲸思客本身禁止出现在梦境内。\n</core>\n\n【输出格式要求】\n进入DREAM_PLOT模式时，你必须严格按照下面的 XML Schema 输出。\n\n最终回复是一个根节点为 `<dream_plot>` 的文档，不包含任何代码块。\n不要在文档外输出解释、寒暄、标题或 XML 外的任何文字。\n\n以下格式协议命名为：DREAM_PLOT_OUTPUT\n====================\nXML_SCHEMA_BASE\n===============\n\n\n\n====================\nOUTPUT_RULES\n============\n\n1. 根节点必须是 `<dream_plot>`。\n2. `<dream_body>` 必须出现一次，内部输出内容禁止转义！\n3. `<dream_after_format>` 必须出现一次，用于输出状态栏、备注、格式化信息或额外 XML 内容。\n4. `<dream_after_form",
    "truncated": true,
    "worldInfo": {
      "total": 114,
      "activated": 25,
      "tokens": 31130,
      "budget": 32000,
      "constants": 25,
      "matched": [],
      "skipped": [
        {
          "uid": 976027,
          "comment": "节庆 05-05 端午",
          "why": "budget"
        },
        {
          "uid": 976028,
          "comment": "节庆 05-15 田植",
          "why": "budget"
        },
        {
          "uid": 976029,
          "comment": "节庆 06-11 入梅",
          "why": "budget"
        },
        {
          "uid": 976030,
          "comment": "节庆 06-30 夏越祓",
          "why": "budget"
        },
        {
          "uid": 976031,
          "comment": "节庆 07-07 七夕",
          "why": "budget"
        },
        {
          "uid": 976032,
          "comment": "节庆 07-20 土用丑",
          "why": "budget"
        },
        {
          "uid": 976033,
          "comment": "节庆 07-31 夏越祭",
          "why": "budget"
        },
        {
          "uid": 976034,
          "comment": "节庆 08-13 盆の入り",
          "why": "budget"
        },
        {
          "uid": 976035,
          "comment": "节庆 08-15 盆中日",
          "why": "budget"
        },
        {
          "uid": 976036,
          "comment": "节庆 08-16 送り火",
          "why": "budget"
        },
        {
          "uid": 976037,
          "comment": "节庆 08-23 地藏盆",
          "why": "budget"
        },
        {
          "uid": 976038,
          "comment": "节庆 09-01 二百十日",
          "why": "budget"
        }
      ]
    }
  }
};

    const styles = {
      root: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        padding: '28px 32px 24px',
        color: 'var(--dsw-alias-text-primary, #e6e6e6)',
        background: 'var(--dsw-alias-background-primary, #141414)',
        overflow: 'hidden',
        boxSizing: 'border-box',
      },
      header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' },
      titleBlock: { display: 'flex', flexDirection: 'column', gap: '6px' },
      title: { margin: 0, fontSize: '22px', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2 },
      subtitle: { margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--dsw-alias-text-secondary, #9a9a9a)', maxWidth: '62ch' },
      chips: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
      chip: {
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '4px 10px', borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-secondary, #333)',
        background: 'var(--dsw-alias-background-secondary, #1b1b1b)',
        fontSize: '12px', lineHeight: 1.4, color: 'var(--dsw-alias-text-secondary, #a8a8a8)',
      },
      chipStrong: { color: 'var(--dsw-alias-text-primary, #ededed)', fontWeight: 600 },
      body: { display: 'flex', gap: '20px', minHeight: 0, flex: 1 },
      list: { width: '296px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', paddingRight: '4px' },
      card: {
        display: 'flex', gap: '12px', alignItems: 'center', textAlign: 'left',
        padding: '12px', borderRadius: '10px', cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-secondary, #2c2c2c)',
        background: 'var(--dsw-alias-background-secondary, #1a1a1a)',
        color: 'inherit', font: 'inherit',
        transition: 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1), border-color 160ms ease, background 160ms ease',
      },
      cardActive: {
        borderColor: 'var(--dsw-alias-border-accent, #6b8afd)',
        background: 'var(--dsw-alias-background-elevated, #202020)',
      },
      avatar: {
        width: '40px', height: '40px', flexShrink: 0, borderRadius: '999px',
        display: 'grid', placeItems: 'center',
        fontSize: '16px', fontWeight: 600,
        color: 'var(--dsw-alias-text-primary, #f2f2f2)',
        background: 'linear-gradient(160deg, rgba(107,138,253,0.35), rgba(107,138,253,0.08))',
        border: '1px solid rgba(107,138,253,0.45)',
      },
      cardName: { fontSize: '13.5px', fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' },
      cardMeta: { fontSize: '11.5px', color: 'var(--dsw-alias-text-tertiary, #8a8a8a)', marginTop: '2px' },
      detail: {
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px',
        padding: '20px', borderRadius: '12px', overflow: 'hidden',
        border: '1px solid var(--dsw-alias-border-secondary, #2c2c2c)',
        background: 'var(--dsw-alias-background-secondary, #1a1a1a)',
      },
      detailHead: { display: 'flex', alignItems: 'center', gap: '14px' },
      detailTitle: { margin: 0, fontSize: '17px', fontWeight: 600 },
      tagRow: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
      tag: {
        fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
        background: 'var(--dsw-alias-background-tertiary, #232323)',
        border: '1px solid var(--dsw-alias-border-secondary, #303030)',
        color: 'var(--dsw-alias-text-secondary, #a0a0a0)',
      },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' },
      stat: {
        padding: '10px 12px', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-secondary, #2a2a2a)',
        background: 'var(--dsw-alias-background-primary, #161616)',
      },
      statLabel: { fontSize: '11px', color: 'var(--dsw-alias-text-tertiary, #8a8a8a)', marginBottom: '4px' },
      statValue: { fontSize: '15px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
      sectionTitle: { fontSize: '12px', fontWeight: 600, letterSpacing: '0.02em', color: 'var(--dsw-alias-text-secondary, #9a9a9a)' },
      pre: {
        margin: 0, padding: '12px 14px', borderRadius: '8px', overflow: 'auto', flex: 1, minHeight: '120px',
        background: 'var(--dsw-alias-background-primary, #121212)',
        border: '1px solid var(--dsw-alias-border-secondary, #262626)',
        fontFamily: 'var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Consolas, monospace)',
        fontSize: '11.5px', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        color: 'var(--dsw-alias-text-secondary, #b4b4b4)',
      },
      actions: { display: 'flex', gap: '8px', alignItems: 'center' },
      button: {
        padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', font: 'inherit', fontSize: '12.5px',
        border: '1px solid var(--dsw-alias-border-secondary, #333)',
        background: 'var(--dsw-alias-background-tertiary, #232323)',
        color: 'var(--dsw-alias-text-primary, #e8e8e8)',
        transition: 'transform 140ms cubic-bezier(0.23, 1, 0.32, 1), background 140ms ease',
      },
      hint: { fontSize: '12px', color: 'var(--dsw-alias-text-tertiary, #8a8a8a)', lineHeight: 1.6 },
      empty: { padding: '28px', textAlign: 'center', color: 'var(--dsw-alias-text-secondary, #9a9a9a)', fontSize: '13px' },
    };

    function Chip({ label, value, strong }) {
      return h('span', { style: styles.chip },
        h('span', null, label),
        h('span', { style: strong ? styles.chipStrong : undefined }, String(value)),
      );
    }

    function Stat({ label, value }) {
      return h('div', { style: styles.stat },
        h('div', { style: styles.statLabel }, label),
        h('div', { style: styles.statValue }, String(value)),
      );
    }

    function Panel() {
      const cards = SNAPSHOT.cards || [];
      const [activeId, setActiveId] = useState((SNAPSHOT.active && SNAPSHOT.active.cardId) || (cards[0] && cards[0].id));
      const active = useMemo(() => cards.find((c) => c.id === activeId) || cards[0] || null, [activeId, cards]);
      const [copied, setCopied] = useState(false);

      const copySystem = useCallback(async () => {
        try {
          await navigator.clipboard.writeText(SNAPSHOT.active ? SNAPSHOT.active.systemPreview : '');
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch { /* 剪贴板不可用时忽略 */ }
      }, []);

      const counts = SNAPSHOT.counts || { cards: 0, presets: 0, lorebooks: 0, errors: 0 };
      const wi = SNAPSHOT.active ? SNAPSHOT.active.worldInfo : null;

      return h('div', { style: styles.root },
        h('style', null,
          '.dsh-tt-btn:focus-visible{outline:2px solid var(--dsw-alias-border-accent,#6b8afd);outline-offset:2px}' +
          '@media (prefers-reduced-motion: reduce){.dsh-tt-btn{transition:none !important}}',
        ),
        h('header', { style: styles.header },
          h('div', { style: styles.titleBlock },
            h('h1', { style: styles.title }, '角色扮演'),
            h('p', { style: styles.subtitle },
              '用 SillyTavern 的角色卡、预设与世界书开一场戏。这里显示的是本机已解析的资产；真正的对话在会话界面里进行。'),
          ),
          h('div', { style: styles.chips },
            h(Chip, { label: '角色', value: counts.cards, strong: true }),
            h(Chip, { label: '预设', value: counts.presets, strong: true }),
            h(Chip, { label: '世界书', value: counts.lorebooks }),
            counts.errors > 0 ? h(Chip, { label: '解析失败', value: counts.errors }) : null,
          ),
        ),
        h('div', { style: styles.body },
          h('div', { style: styles.list },
            cards.length === 0
              ? h('div', { style: styles.empty }, '还没有角色卡。把 PNG 卡放进 assets/characters 或 参考/ 目录后重新构建。')
              : cards.map((card) => h('button', {
                key: card.id,
                type: 'button',
                className: 'dsh-tt-btn',
                onClick: () => setActiveId(card.id),
                style: card.id === (active && active.id) ? { ...styles.card, ...styles.cardActive } : styles.card,
                onMouseDown: (e) => { e.currentTarget.style.transform = 'scale(0.985)'; },
                onMouseUp: (e) => { e.currentTarget.style.transform = ''; },
                onMouseLeave: (e) => { e.currentTarget.style.transform = ''; },
              },
                h('div', { style: styles.avatar }, String(card.name || '?').slice(0, 1)),
                h('div', { style: { minWidth: 0 } },
                  h('div', { style: styles.cardName }, card.name),
                  h('div', { style: styles.cardMeta }, `${card.spec} · ${card.counts.lorebookEntries} 条世界书`),
                ),
              )),
          ),
          h('section', { style: styles.detail },
            active
              ? [
                h('div', { style: styles.detailHead, key: 'head' },
                  h('div', { style: styles.avatar }, String(active.name || '?').slice(0, 1)),
                  h('div', { style: { minWidth: 0 } },
                    h('h2', { style: styles.detailTitle }, active.name),
                    h('div', { style: styles.cardMeta }, [active.creator, active.version].filter(Boolean).join(' · ') || active.spec),
                  ),
                ),
                active.tags && active.tags.length
                  ? h('div', { style: styles.tagRow, key: 'tags' }, active.tags.map((tag) => h('span', { key: tag, style: styles.tag }, tag)))
                  : null,
                h('div', { style: styles.grid, key: 'stats' },
                  h(Stat, { label: '世界书条目', value: active.counts.lorebookEntries }),
                  h(Stat, { label: '世界书字数', value: active.counts.lorebookChars.toLocaleString() }),
                  h(Stat, { label: '酒馆助手脚本', value: `${active.counts.thScriptsEnabled}/${active.counts.thScripts}` }),
                  h(Stat, { label: '正则脚本', value: active.counts.regexScripts }),
                  h(Stat, { label: '备选问候', value: active.counts.greetings }),
                  h(Stat, { label: '首条消息', value: `${active.counts.firstMes} 字` }),
                ),
                wi ? h('div', { key: 'wi' },
                  h('div', { style: { ...styles.sectionTitle, marginBottom: '8px' } },
                    `世界书激活 ${wi.activated}/${wi.total} 条 · ${wi.tokens}/${wi.budget} tokens · 常量 ${wi.constants}`),
                  wi.skipped && wi.skipped.length
                    ? h('div', { style: styles.hint },
                      '被预算挤掉的条目：' + wi.skipped.slice(0, 6).map((s) => (s.comment || `#${s.uid}`)).join('、'))
                    : null,
                ) : null,
                h('div', { key: 'pre-wrap', style: { display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, flex: 1 } },
                  h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                    h('div', { style: styles.sectionTitle }, `系统提示词预览 · ${SNAPSHOT.active ? SNAPSHOT.active.systemLength.toLocaleString() : 0} 字`),
                    h('div', { style: styles.actions },
                      h('button', {
                        type: 'button', className: 'dsh-tt-btn', style: styles.button, onClick: copySystem,
                        onMouseDown: (e) => { e.currentTarget.style.transform = 'scale(0.97)'; },
                        onMouseUp: (e) => { e.currentTarget.style.transform = ''; },
                        onMouseLeave: (e) => { e.currentTarget.style.transform = ''; },
                      }, copied ? '已复制' : '复制预览'),
                    ),
                  ),
                  h('pre', { style: styles.pre }, SNAPSHOT.active ? SNAPSHOT.active.systemPreview : '（没有可预览的系统提示词）'),
                ),
              ]
              : h('div', { style: styles.empty }, '选择左侧的角色卡查看详情。'),
          ),
        ),
        h('div', { style: styles.hint },
          '下一步：新建会话时选择「角色扮演」预设。该预设不含任何工具，系统提示词由本插件接管。'),
      );
    }

    function PanelIcon({ size }) {
      const px = size || 16;
      return h('svg', {
        width: px, height: px, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block' },
      },
        h('path', { d: 'M4 5.5h16v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z' }),
        h('path', { d: 'M8 9.5h8M8 13h5' }),
        h('path', { d: 'M12 18.5V21' }),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        try {
          ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'roleplay' }, Panel));
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist', id: 'roleplay', order: 20, label: () => '角色扮演',
          }, PanelIcon));
          console.info('[dsh-tt] client module loaded: sidebar + main panel registered');
        } catch (error) {
          console.error('[dsh-tt] client activation failed', error);
          throw error;
        }
      },
    };
  },
});
