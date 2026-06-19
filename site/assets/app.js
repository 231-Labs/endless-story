(function () {
  'use strict';

  // Each item: slug + bilingual labels. Deep docs carry `lang` (their written language).
  // Entry pages carry `bilingual:true` (a .zh variant exists alongside the .md).
  var GROUPS = [
    { key: 'start', items: [
      { slug: 'overview', en: 'Overview', zh: '總覽', bilingual: true },
      { slug: 'roadmap', en: 'Roadmap', zh: '路線圖', bilingual: true }
    ] },
    { key: 'design', items: [
      { slug: 'product-positioning', en: 'Product positioning', zh: '產品定位', lang: 'zh' },
      { slug: 'whitepaper', en: 'Whitepaper', zh: '白皮書', lang: 'zh' },
      { slug: 'narrative-agents', en: 'Narrative agents', zh: '敘事 Agent 架構', lang: 'zh' },
      { slug: 'content-pipeline', en: 'Content pipeline', zh: '內容鏈路', lang: 'zh' },
      { slug: 'character-economy', en: 'Character economy', zh: '角色經濟', lang: 'zh' },
      { slug: 'production-engine', en: 'Production engine', zh: '劇目製作引擎', lang: 'zh' },
      { slug: 'event-lifecycle', en: 'Event lifecycle', zh: '事件生命週期', lang: 'zh' },
      { slug: 'pitch-deck', en: 'Pitch outline', zh: '簡報大綱', lang: 'zh' }
    ] },
    { key: 'infra', items: [
      { slug: 'walrus-assets', en: 'Walrus assets', zh: 'Walrus 資產', lang: 'zh' },
      { slug: 'api-contract', en: 'API contract', zh: 'API 合約', lang: 'en' },
      { slug: 'prompts', en: 'Prompts', zh: 'Prompts', lang: 'en' },
      { slug: 'deployment', en: 'Deployment', zh: '部署', lang: 'zh' }
    ] },
    { key: 'links', items: [
      { url: './pitch/endless-story-pitch-light-en.html', en: 'Pitch deck (EN)', zh: '簡報（English）' },
      { url: './pitch/endless-story-pitch-light.html', en: 'Pitch deck (中文)', zh: '簡報（中文）' },
      { url: './pitch/endless-story-architecture-map.html', en: 'Architecture map', zh: '架構圖' },
      { url: 'https://spring-snow.231labs.xyz', en: 'Live demo', zh: '線上 Demo' }
    ] }
  ];

  var STRINGS = {
    en: {
      brandSub: 'Design docs',
      groups: { start: 'Start', design: 'Design', infra: 'Build & infra', links: 'Links' },
      footTrack: 'Sui Overflow 2026 · Walrus track',
      footBy: 'Built by 231 Labs',
      pageFoot: 'Walrus + Seal · MemWal SDK · Sui. Built by 231 Labs.',
      toggle: '中文',
      docNote: function (lang) {
        return lang === 'zh'
          ? 'This design doc is written in Chinese (中文).'
          : 'This design doc is written in English.';
      },
      notFound: 'Not found'
    },
    zh: {
      brandSub: '設計文檔',
      groups: { start: '開始', design: '設計', infra: '建置與基建', links: '連結' },
      footTrack: 'Sui Overflow 2026 · Walrus 賽道',
      footBy: '由 231 Labs 打造',
      pageFoot: 'Walrus + Seal · MemWal SDK · Sui。由 231 Labs 打造。',
      toggle: 'EN',
      docNote: function (lang) {
        return lang === 'zh'
          ? '本設計文件以中文撰寫。'
          : '本設計文件以英文（English）撰寫。';
      },
      notFound: '找不到頁面'
    }
  };

  var LANG_KEY = 'es-docs-lang';
  function initialLang() {
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved === 'en' || saved === 'zh') return saved;
    } catch (e) { /* ignore */ }
    return 'en'; // default to English (international judges); toggle + localStorage override
  }
  var lang = initialLang();

  var titleBySlug = {};
  var meta = {};
  GROUPS.forEach(function (g) {
    g.items.forEach(function (it) {
      if (it.slug) { meta[it.slug] = it; titleBySlug[it.slug] = it; }
    });
  });

  var contentEl = document.getElementById('content');
  var navEl = document.getElementById('nav');
  var sidebar = document.getElementById('sidebar');
  var toggle = document.getElementById('menu-toggle');
  var langBtn = document.getElementById('lang-toggle');
  var brandSubEl = document.getElementById('brand-sub');
  var footTrackEl = document.getElementById('foot-track');
  var footByEl = document.getElementById('foot-by');
  var pageFootEl = document.getElementById('page-foot');

  function S() { return STRINGS[lang]; }

  function langBadge(itemLang) {
    return '<span class="nav-badge ' + itemLang + '">' + (itemLang === 'zh' ? '中' : 'EN') + '</span>';
  }

  function buildNav() {
    var html = '';
    GROUPS.forEach(function (g) {
      html += '<div class="nav-group"><div class="nav-label">' + S().groups[g.key] + '</div>';
      g.items.forEach(function (it) {
        var label = it[lang] || it.en;
        if (it.url) {
          html += '<a class="nav-link ext" href="' + it.url + '" target="_blank" rel="noopener">' +
            label + '<span class="arr">↗</span></a>';
        } else {
          var badge = it.lang ? langBadge(it.lang) : '';
          html += '<a class="nav-link" data-slug="' + it.slug + '" href="#/' + it.slug + '">' +
            '<span class="nav-text">' + label + '</span>' + badge + '</a>';
        }
      });
      html += '</div>';
    });
    navEl.innerHTML = html;
  }

  function applyChrome() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
    if (brandSubEl) brandSubEl.textContent = S().brandSub;
    if (footTrackEl) footTrackEl.textContent = S().footTrack;
    if (footByEl) footByEl.textContent = S().footBy;
    if (pageFootEl) pageFootEl.textContent = S().pageFoot;
    if (langBtn) { langBtn.textContent = S().toggle; langBtn.setAttribute('aria-label', S().toggle); }
  }

  function slugifyHeading(text) {
    return text.toLowerCase().trim().replace(/[^\w一-鿿]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function rewriteLinks() {
    Array.prototype.forEach.call(contentEl.querySelectorAll('a[href]'), function (a) {
      var href = a.getAttribute('href');
      if (!href) return;
      if (/\.md(#.*)?$/i.test(href)) {
        var base = href.split('/').pop().replace(/\.md(#.*)?$/i, '');
        a.setAttribute('href', '#/' + base.toLowerCase().replace(/_/g, '-'));
      } else if (/^https?:\/\//i.test(href) || /\.html(#.*)?$/i.test(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      }
    });
  }

  function addHeadingIds() {
    Array.prototype.forEach.call(contentEl.querySelectorAll('h2, h3'), function (h) {
      if (!h.id) h.id = slugifyHeading(h.textContent || '');
    });
  }

  function setActive(slug) {
    Array.prototype.forEach.call(navEl.querySelectorAll('.nav-link'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-slug') === slug);
    });
  }

  function currentSlug() {
    var h = location.hash.replace(/^#\/?/, '').split('#')[0];
    return meta[h] ? h : 'overview';
  }

  // Which markdown file to fetch for a slug, given current language.
  function fileFor(slug) {
    var it = meta[slug];
    if (it && it.bilingual && lang === 'zh') return slug + '.zh';
    return slug;
  }

  function render() {
    var slug = currentSlug();
    var it = meta[slug];
    contentEl.classList.add('loading');
    fetch('./content/' + fileFor(slug) + '.md', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) {
          // Fall back to the base file if a .zh variant is missing.
          if (fileFor(slug) !== slug) return fetch('./content/' + slug + '.md').then(function (r2) { return r2.text(); });
          throw new Error('HTTP ' + r.status);
        }
        return r.text();
      })
      .then(function (md) {
        var note = '';
        if (it && it.lang && it.lang !== lang) {
          note = '<div class="doc-lang-note">' + S().docNote(it.lang) + '</div>';
        }
        contentEl.innerHTML = note + marked.parse(md);
        contentEl.classList.remove('loading');
        rewriteLinks();
        addHeadingIds();
        setActive(slug);
        var t = titleBySlug[slug];
        document.title = ((t && t[lang]) || 'Docs') + ' · Endless Story';
        window.scrollTo(0, 0);
        sidebar.classList.remove('open');
      })
      .catch(function (e) {
        contentEl.classList.remove('loading');
        contentEl.innerHTML = '<h1>' + S().notFound + '</h1><p><code>' + slug +
          '</code> (' + e.message + ').</p><p><a href="#/overview">← Overview</a></p>';
      });
  }

  function setLang(next) {
    if (next === lang) return;
    lang = next;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
    applyChrome();
    buildNav();
    setActive(currentSlug());
    render();
  }

  applyChrome();
  buildNav();
  window.addEventListener('hashchange', render);
  toggle.addEventListener('click', function () { sidebar.classList.toggle('open'); });
  if (langBtn) langBtn.addEventListener('click', function () { setLang(lang === 'en' ? 'zh' : 'en'); });
  if (!location.hash) { location.replace('#/overview'); }
  render();
})();
