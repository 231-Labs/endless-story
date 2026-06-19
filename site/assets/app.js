(function () {
  'use strict';

  var GROUPS = [
    { label: 'Start', items: [
      { slug: 'overview', title: 'Overview' },
      { slug: 'roadmap', title: 'Roadmap' }
    ] },
    { label: 'Design', items: [
      { slug: 'product-positioning', title: 'Product positioning' },
      { slug: 'whitepaper', title: 'Whitepaper' },
      { slug: 'narrative-agents', title: 'Narrative agents' },
      { slug: 'content-pipeline', title: 'Content pipeline' },
      { slug: 'character-economy', title: 'Character economy' },
      { slug: 'production-engine', title: 'Production engine' },
      { slug: 'event-lifecycle', title: 'Event lifecycle' },
      { slug: 'pitch-deck', title: 'Pitch outline' }
    ] },
    { label: 'Build & infra', items: [
      { slug: 'walrus-assets', title: 'Walrus assets' },
      { slug: 'api-contract', title: 'API contract' },
      { slug: 'prompts', title: 'Prompts' },
      { slug: 'deployment', title: 'Deployment' }
    ] },
    { label: 'Links', items: [
      { url: './pitch/endless-story-pitch-light-en.html', title: 'Pitch deck (EN)' },
      { url: './pitch/endless-story-pitch-light.html', title: 'Pitch deck (中文)' },
      { url: './pitch/endless-story-architecture-map.html', title: 'Architecture map' },
      { url: 'https://spring-snow.231labs.xyz', title: 'Live demo' }
    ] }
  ];

  var titleBySlug = {};
  var known = {};
  GROUPS.forEach(function (g) {
    g.items.forEach(function (it) {
      if (it.slug) { titleBySlug[it.slug] = it.title; known[it.slug] = true; }
    });
  });

  var contentEl = document.getElementById('content');
  var navEl = document.getElementById('nav');
  var sidebar = document.getElementById('sidebar');
  var toggle = document.getElementById('menu-toggle');

  function buildNav() {
    var html = '';
    GROUPS.forEach(function (g) {
      html += '<div class="nav-group"><div class="nav-label">' + g.label + '</div>';
      g.items.forEach(function (it) {
        if (it.url) {
          html += '<a class="nav-link ext" href="' + it.url + '" target="_blank" rel="noopener">' +
            it.title + '<span class="arr">↗</span></a>';
        } else {
          html += '<a class="nav-link" data-slug="' + it.slug + '" href="#/' + it.slug + '">' +
            it.title + '</a>';
        }
      });
      html += '</div>';
    });
    navEl.innerHTML = html;
  }

  function slugifyHeading(text) {
    return text.toLowerCase().trim()
      .replace(/[^\w一-鿿]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function rewriteLinks() {
    var links = contentEl.querySelectorAll('a[href]');
    Array.prototype.forEach.call(links, function (a) {
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
    var hs = contentEl.querySelectorAll('h2, h3');
    Array.prototype.forEach.call(hs, function (h) {
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
    return known[h] ? h : 'overview';
  }

  function render() {
    var slug = currentSlug();
    contentEl.classList.add('loading');
    fetch('./content/' + slug + '.md', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.text(); })
      .then(function (md) {
        contentEl.innerHTML = marked.parse(md);
        contentEl.classList.remove('loading');
        rewriteLinks();
        addHeadingIds();
        setActive(slug);
        document.title = (titleBySlug[slug] || 'Docs') + ' · Endless Story';
        window.scrollTo(0, 0);
        sidebar.classList.remove('open');
      })
      .catch(function (e) {
        contentEl.classList.remove('loading');
        contentEl.innerHTML = '<h1>Not found</h1><p>Could not load <code>' + slug +
          '</code> (' + e.message + ').</p><p><a href="#/overview">← Overview</a></p>';
      });
  }

  buildNav();
  window.addEventListener('hashchange', render);
  toggle.addEventListener('click', function () { sidebar.classList.toggle('open'); });
  if (!location.hash) { location.replace('#/overview'); }
  render();
})();
