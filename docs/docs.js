/* Oxi docs: search modal (Ctrl/Cmd+K) over search-index.json, and the mobile sections toggle.
   Plain JS, no dependencies. Loaded with defer on every docs page. */
(function () {
  'use strict';

  var script = document.querySelector('script[src$="docs.js"]');
  var scriptURL = new URL(script ? script.getAttribute('src') : 'docs.js', location.href);
  var INDEX_URL = new URL('search-index.json', scriptURL);
  var SITE_ROOT = new URL('../', scriptURL);

  /* ---------- Mobile sections toggle (<= 834 px) ---------- */
  var toggle = document.getElementById('doc-side-toggle');
  var sideNav = document.getElementById('doc-side-nav');
  if (toggle && sideNav) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Hide docs sections' : 'Show docs sections');
      sideNav.classList.toggle('is-open', open);
    });
  }

  /* ---------- Terminal cards: Copy copies the commands only (no $ prompt, no output) ---------- */
  var liveRegion = document.createElement('p');
  liveRegion.className = 'sr-only';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  document.body.appendChild(liveRegion);

  function commandsOf(card) {
    return Array.prototype.map.call(card.querySelectorAll('.t-cmd'), function (el) {
      return el.textContent.replace(/^\$ /, '');
    }).join('\n');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('no clipboard'));
  }

  document.querySelectorAll('.term-card').forEach(function (card) {
    var bar = card.querySelector('.term-bar');
    if (!bar || !card.querySelector('.t-cmd')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'term-copy';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy the commands in this terminal');
    var timer = null;
    btn.addEventListener('click', function () {
      copyText(commandsOf(card)).then(function () {
        btn.textContent = 'Copied';
        btn.setAttribute('data-copied', 'true');
        liveRegion.textContent = 'Commands copied.';
        clearTimeout(timer);
        timer = setTimeout(function () {
          btn.textContent = 'Copy';
          btn.removeAttribute('data-copied');
        }, 2000);
      }, function () {
        liveRegion.textContent = 'Copy failed. Select the commands and copy them by hand.';
      });
    });
    bar.appendChild(btn);
  });

  /* ---------- Search modal ---------- */
  var index = null;
  var dialog = null;
  var input = null;
  var list = null;
  var status = null;
  var closeBtn = null;
  var lastFocus = null;
  var active = -1;
  var results = [];

  function loadIndex() {
    if (index || !window.fetch) return Promise.resolve(index || []);
    return fetch(INDEX_URL.href, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) { index = Array.isArray(data) ? data : []; return index; })
      .catch(function () { index = []; return index; });
  }

  function build() {
    dialog = document.createElement('div');
    dialog.className = 'search';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'search-title');
    dialog.hidden = true;
    dialog.innerHTML =
      '<div class="search-panel">' +
        '<p class="eyebrow" id="search-title">// search the docs</p>' +
        '<div class="search-bar">' +
          '<label class="sr-only" for="search-q">Search the docs</label>' +
          '<input id="search-q" class="search-input" type="search" role="combobox" autocomplete="off" spellcheck="false" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list" placeholder="Search: ClickHouse, lineage, approval">' +
          '<button type="button" class="search-close">Close</button>' +
        '</div>' +
        '<ul id="search-results" class="search-results" role="listbox" aria-label="Search results"></ul>' +
        '<p class="search-status" role="status" aria-live="polite"></p>' +
      '</div>';
    document.body.appendChild(dialog);
    input = dialog.querySelector('#search-q');
    list = dialog.querySelector('#search-results');
    status = dialog.querySelector('.search-status');
    closeBtn = dialog.querySelector('.search-close');

    input.addEventListener('input', render);
    input.addEventListener('keydown', onInputKey);
    closeBtn.addEventListener('click', close);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
    dialog.addEventListener('keydown', trapFocus);
    list.addEventListener('click', function (e) {
      var li = e.target.closest && e.target.closest('[role="option"]');
      if (li) go(li);
    });
  }

  function open() {
    if (!dialog) build();
    lastFocus = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('search-open');
    input.value = '';
    render();
    input.focus();
    loadIndex().then(render);
  }

  function close() {
    if (!dialog || dialog.hidden) return;
    dialog.hidden = true;
    document.body.classList.remove('search-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function isOpen() { return !!dialog && !dialog.hidden; }

  function search(q) {
    var tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length || !index) return [];
    var scored = [];
    index.forEach(function (e) {
      var title = (e.title + ' ' + e.section).toLowerCase();
      var all = (title + ' ' + e.text).toLowerCase();
      var score = 0;
      for (var i = 0; i < tokens.length; i++) {
        if (all.indexOf(tokens[i]) === -1) return;
        score += title.indexOf(tokens[i]) !== -1 ? 3 : 1;
      }
      scored.push({ e: e, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 8).map(function (s) { return s.e; });
  }

  function render() {
    var q = input.value.trim();
    results = search(q);
    active = results.length ? 0 : -1;
    list.innerHTML = '';
    results.forEach(function (e, i) {
      var li = document.createElement('li');
      li.id = 'search-opt-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === active));
      li.dataset.href = new URL(e.path, SITE_ROOT).pathname;
      var t = document.createElement('span');
      t.className = 'search-opt-title';
      t.textContent = e.title;
      var s = document.createElement('span');
      s.className = 'search-opt-section';
      s.textContent = e.section;
      li.appendChild(t);
      li.appendChild(s);
      list.appendChild(li);
    });
    input.setAttribute('aria-expanded', String(results.length > 0));
    input.removeAttribute('aria-activedescendant');
    if (results.length) input.setAttribute('aria-activedescendant', 'search-opt-0');
    status.textContent = !index ? 'Loading the index.' :
      !q ? 'Type to search the docs.' :
      results.length ? results.length + (results.length === 1 ? ' result.' : ' results.') : 'No results for "' + q + '".';
  }

  function setActive(i) {
    if (!results.length) return;
    active = (i + results.length) % results.length;
    var opts = list.querySelectorAll('[role="option"]');
    opts.forEach(function (o, k) { o.setAttribute('aria-selected', String(k === active)); });
    input.setAttribute('aria-activedescendant', 'search-opt-' + active);
    opts[active].scrollIntoView({ block: 'nearest' });
  }

  function go(li) {
    if (!li) return;
    window.location.href = li.dataset.href;
  }

  function onInputKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) go(list.querySelectorAll('[role="option"]')[active]);
    } else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  // Focus stays inside the dialog: Tab moves between the input and the Close button only.
  function trapFocus(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var first = input;
    var last = closeBtn;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (isOpen()) close(); else open();
    }
  });

  document.querySelectorAll('[data-search-open]').forEach(function (btn) {
    btn.addEventListener('click', function () { open(); });
  });
})();
