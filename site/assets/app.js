(function () {
  'use strict';

  // Public docs are deliberately curated. Internal runbooks and design journals stay
  // under docs/, but are not copied verbatim into the published whitepaper site.
  var GROUPS = [
    { key: 'start', items: [
      { slug: 'overview', en: 'Overview', zh: '總覽', bilingual: true },
      { slug: 'architecture', en: 'Architecture', zh: '架構', bilingual: true },
      { slug: 'roadmap', en: 'Roadmap', zh: '路線圖', bilingual: true }
    ] },
    { key: 'protocol', items: [
      { slug: 'protocol', en: 'On-chain protocol', zh: '鏈上協議', bilingual: true, type: 'tech' },
      { slug: 'memory', en: 'Memory and storage', zh: '記憶與儲存', bilingual: true, type: 'tech' }
    ] },
    { key: 'narrative', items: [
      { slug: 'narrative', en: 'Narrative engine', zh: '敘事引擎', bilingual: true, type: 'tech' },
      { slug: 'economy', en: 'Character economy', zh: '角色經濟', bilingual: true, type: 'product' }
    ] },
    { key: 'research', items: [
      { slug: 'whitepaper', en: 'Mechanism whitepaper', zh: '機制白皮書', bilingual: true, type: 'research' }
    ] },
    { key: 'links', items: [
      { url: './pitch/endless-story-pitch-light-en.html', en: 'Pitch deck (EN)', zh: '簡報（English）' },
      { url: './pitch/endless-story-pitch-light.html', en: 'Pitch deck (中文)', zh: '簡報（中文）' },
      { url: 'https://spring-snow.231labs.xyz', en: 'Live demo', zh: '線上 Demo' }
    ] }
  ];

  var STRINGS = {
    en: {
      brandSub: 'Design docs',
      groups: { start: 'Start', protocol: 'Protocol', narrative: 'System', participation: 'Participation', research: 'Research', links: 'Links' },
      footTrack: 'Sui Overflow 2026 · Walrus track',
      footBy: 'Built by 231 Labs',
      pageFoot: 'Walrus + Seal · MemWal SDK · Sui. Built by 231 Labs.',
      toggle: '中文',
      typeName: { product: 'Product', tech: 'Technical', research: 'Research' },
      docNote: function (lang) {
        return lang === 'zh' ? 'This design doc is written in Chinese (中文).' : 'This design doc is written in English.';
      },
      notFound: 'Not found'
    },
    zh: {
      brandSub: '設計文檔',
      groups: { start: '開始', protocol: '協議', narrative: '系統', participation: '用戶參與', research: '研究', links: '連結' },
      footTrack: 'Sui Overflow 2026 · Walrus 賽道',
      footBy: '由 231 Labs 打造',
      pageFoot: 'Walrus + Seal · MemWal SDK · Sui。由 231 Labs 打造。',
      toggle: 'EN',
      typeName: { product: '產品', tech: '技術', research: '研究' },
      docNote: function (lang) {
        return lang === 'zh' ? '本設計文件以中文撰寫。' : '本設計文件以英文（English）撰寫。';
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

  function badges(it) {
    var html = '';
    if (it.type) {
      html += '<span class="type-badge ' + it.type + '" title="' + S().typeName[it.type] + '">' +
        (it.type === 'product' ? 'P' : it.type === 'research' ? 'R' : 'T') + '</span>';
    }
    if (it.lang) {
      html += '<span class="nav-badge ' + it.lang + '">' + (it.lang === 'zh' ? '中' : 'EN') + '</span>';
    }
    return html;
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
          html += '<a class="nav-link" data-slug="' + it.slug + '" href="#/' + it.slug + '">' +
            '<span class="nav-text">' + label + '</span><span class="nav-tags">' + badges(it) + '</span></a>';
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

  // marked deliberately stays dependency-free, so render the small formula set used by
  // the public whitepaper into readable HTML instead of exposing raw $$ / TeX commands.
  function readableFormula(source) {
    return source.trim()
      .replace(/\\operatorname\{([^}]+)\}/g, '$1')
      .replace(/\\mathrm\{([^}]+)\}/g, '$1')
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1 / $2)')
      .replace(/\\prod_\{?([^}\s]+)\}?/g, '∏_$1')
      .replace(/\\times/g, '×')
      .replace(/\\rightarrow/g, '→')
      .replace(/\\alpha/g, 'α')
      .replace(/\\max/g, 'max')
      .replace(/\\bmod/g, 'mod')
      .replace(/\\left|\\right|\\boxed/g, '')
      .replace(/\\lfloor/g, 'floor(')
      .replace(/\\rfloor/g, ')')
      .replace(/_\{([^}]+)\}/g, '_$1')
      .replace(/\^\{([^}]+)\}/g, '^($1)')
      .replace(/\\[;,!]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function renderFormulas() {
    Array.prototype.forEach.call(contentEl.querySelectorAll('p'), function (p) {
      var text = (p.textContent || '').trim();
      if (text.slice(0, 2) !== '$$' || text.slice(-2) !== '$$') return;
      var formula = document.createElement('div');
      formula.className = 'formula';
      formula.textContent = readableFormula(text.slice(2, -2));
      p.replaceWith(formula);
    });

    Array.prototype.forEach.call(contentEl.querySelectorAll('p, li, td'), function (el) {
      if (el.querySelector('code, pre')) return;
      el.innerHTML = el.innerHTML.replace(/\$([^$<>]+)\$/g, '<var>$1</var>');
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
        renderFormulas();
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
