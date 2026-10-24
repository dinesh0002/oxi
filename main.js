/* Oxi site behaviour: mobile menu, scroll reveal,
   demo videos (captions.json with built-in fallback), hero terminal. */
(function () {
  'use strict';

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ASSET_DIR = 'assets/videos/';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- Mobile menu (disclosure button) ---------- */
  var menuBtn = $('#menu-btn');
  var nav = $('#site-nav');
  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('is-open', open);
  }
  menuBtn.addEventListener('click', function () {
    setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
  });
  nav.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menuBtn.focus();
    }
  });
  // The GitHub link is a placeholder until the repo is public: keep it from jumping to the top.
  $$('[data-github-link]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); });
  });
  var desktopMQ = window.matchMedia('(min-width: 961px)');
  desktopMQ.addEventListener('change', function (e) { if (e.matches) setMenu(false); });

  /* ---------- Hero terminal: types the query, then reveals the result ---------- */
  function runTerminal() {
    var typed = $('#typed');
    var rows = $$('.term .t-row, .term .t-foot');
    if (!typed) return;
    var full = typed.textContent;
    if (reduceMQ.matches) {
      rows.forEach(function (r) { r.classList.add('is-shown'); });
      return;
    }
    typed.textContent = '';
    var i = 0;
    function typeNext() {
      if (i < full.length) {
        i += 1;
        typed.textContent = full.slice(0, i);
        setTimeout(typeNext, 42);
      } else {
        showRow(0);
      }
    }
    function showRow(k) {
      if (k >= rows.length) return;
      rows[k].classList.add('is-shown');
      setTimeout(function () { showRow(k + 1); }, 260);
    }
    setTimeout(typeNext, 500);
  }

  /* ---------- Demo data: captions.json if present, built-in fallback otherwise ---------- */
  var DEFAULT_DEMOS = [
    { id: 'catalog', title: 'Browse every dataset', file: 'catalog.webm', poster: 'catalog.png',
      steps: ['Open the catalog: Parquet, CSV, JSON and Excel files appear as datasets.',
              'Folder datasets sit alongside single files.',
              'Pick a dataset to see its row count and schema.'] },
    { id: 'model', title: 'Turn a file into a semantic model', file: 'model.webm', poster: 'model.png',
      steps: ['Select a file and choose Create model.',
              'A dbt-compatible YAML model is drafted from the columns.',
              'The validator checks the model and saves it to the workspace.'] },
    { id: 'dashboard', title: 'Slice and cross-filter a dashboard', file: 'dashboard.webm', poster: 'dashboard.png',
      steps: ['Open a dashboard: every card runs its query on DuckDB.',
              'Add a slicer to narrow all the cards at once.',
              'Click a value to cross-filter the other cards.'] },
    { id: 'sql', title: 'Query models with SQL', file: 'sql.webm', poster: 'sql.png',
      steps: ['Write SELECT over your models in the SQL console.',
              'Run it and read the result grid.',
              'Save the result as a card.'] }
  ];

  function isValidCaptions(d) {
    return Array.isArray(d) && d.length > 0 && d.every(function (x) {
      return x && typeof x.id === 'string' && /^[a-z0-9-]+$/i.test(x.id);
    });
  }
  function cleanCaption(x) {
    return {
      id: x.id,
      title: typeof x.title === 'string' ? x.title : x.id,
      file: typeof x.file === 'string' ? x.file : x.id + '.webm',
      poster: typeof x.poster === 'string' ? x.poster : x.id + '.png',
      steps: Array.isArray(x.steps) ? x.steps.filter(function (s) { return typeof s === 'string'; }) : []
    };
  }
  function loadCaptions() {
    if (!window.fetch) return Promise.resolve(null);
    return fetch(ASSET_DIR + 'captions.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { return isValidCaptions(data) ? data.map(cleanCaption) : null; })
      .catch(function () { return null; });
  }

  var lookup = {};
  DEFAULT_DEMOS.forEach(function (d) { lookup[d.id] = d; });

  function buildDemos(list) {
    var host = $('#demo-list');
    var tpl = $('#demo-tpl');
    if (!host || !tpl) return;
    list.forEach(function (d, i) {
      var node = tpl.content.firstElementChild.cloneNode(true);
      $('.num', node).textContent = String(i + 1).padStart(2, '0');
      $('.demo-name', node).textContent = d.title;
      $('.frame-title', node).textContent = 'oxi / ' + d.id;
      var ol = $('.steps', node);
      d.steps.forEach(function (s) {
        var li = document.createElement('li');
        li.textContent = s;
        ol.appendChild(li);
      });
      $('video', node).setAttribute('data-video', d.id);
      $('video', node).setAttribute('aria-label', d.title + ': screen recording, muted, looping');
      host.appendChild(node);
    });
  }

  /* ---------- Video wiring: poster probe, play when visible, pause control ---------- */
  var videoIO = ('IntersectionObserver' in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var api = en.target.__oxiVideo;
          if (api) { api.setVisible(en.isIntersecting); }
        });
      }, { threshold: 0.35 })
    : null;

  function wireVideo(video) {
    if (video.__oxiVideo) return;
    var id = video.getAttribute('data-video');
    var meta = lookup[id] || {};
    var title = meta.title || id;
    var frame = video.closest('.frame');
    var btn = $('.vid-btn', frame);
    var posterSrc = ASSET_DIR + (meta.poster || id + '.png');
    var visible = false;
    var wantPlay = !reduceMQ.matches;   // reduced motion: start paused, user can still press Play

    video.muted = true;
    video.loop = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('poster', posterSrc);
    video.setAttribute('src', ASSET_DIR + (meta.file || id + '.webm'));

    function markReady() { frame.classList.add('is-ready'); }
    var probe = new Image();
    probe.onload = markReady;
    probe.src = posterSrc;
    video.addEventListener('loadeddata', markReady);

    function paint() {
      var playing = wantPlay;
      btn.textContent = playing ? 'Pause' : 'Play';
      btn.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + title + ' demo');
    }
    function sync() {
      if (visible && wantPlay) {
        var p = video.play();
        if (p && p.catch) p.catch(function () { /* no file yet or blocked: poster stays */ });
      } else {
        video.pause();
      }
      paint();
    }
    btn.addEventListener('click', function () {
      wantPlay = !wantPlay;
      sync();
    });
    reduceMQ.addEventListener('change', function (e) {
      wantPlay = !e.matches;
      sync();
    });

    video.__oxiVideo = {
      setVisible: function (v) { visible = v; sync(); }
    };
    paint();
    if (videoIO) {
      videoIO.observe(video);
    } else {
      visible = !reduceMQ.matches;
      sync();
    }
  }

  function wireAllVideos() {
    $$('video[data-video]').forEach(wireVideo);
  }

  /* ---------- Scroll reveal ---------- */
  function setupReveals(items) {
    if (reduceMQ.matches || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Boot ---------- */
  runTerminal();
  setupReveals($$('.reveal'));

  loadCaptions().then(function (captions) {
    var list = captions || DEFAULT_DEMOS;
    if (captions) {
      captions.forEach(function (c) { lookup[c.id] = Object.assign({}, lookup[c.id] || {}, c); });
    }
    buildDemos(list);
    wireAllVideos();
    setupReveals($$('#demo-list .reveal'));
  });
})();
