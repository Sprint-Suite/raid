// public/js/app.js
//
// Single-page state machine for the RAID UI.
// State phases: 'idle' | 'loading' | 'result' | 'error'.

(function () {
  'use strict';

  const MIN_CHARS = 10;
  const MAX_CHARS = 1_000_000;

  // ---------- State ----------
  const state = {
    phase: 'idle',
    currentSample: 0,
    result: null,
    error: null
  };

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const dom = {
    textarea:    null,
    counter:     null,
    helper:      null,
    generate:    null,
    resultZone:  null
  };

  // ---------- Validation ----------
  function validate(text) {
    const len = text.length;
    if (len < MIN_CHARS) return { ok: false, helper: `Add a bit more content — at least ${MIN_CHARS} characters.` };
    if (len > MAX_CHARS) return { ok: false, helper: 'Too long — please shorten or submit in parts.' };
    return { ok: true, helper: '' };
  }

  function counterClass(len) {
    if (len > MAX_CHARS) return 'input-card__counter--err';
    if (len > MAX_CHARS * 0.8) return 'input-card__counter--warn';
    return '';
  }

  // ---------- Render ----------
  function render() {
    // Char counter
    const len = dom.textarea.value.length;
    dom.counter.textContent = `${len.toLocaleString()} chars`;
    dom.counter.className = `input-card__counter ${counterClass(len)}`.trim();

    // Helper text + Generate enabled state
    const v = validate(dom.textarea.value);
    if (v.ok) {
      dom.helper.classList.add('input-card__helper--hidden');
      dom.helper.textContent = '';
    } else {
      dom.helper.classList.remove('input-card__helper--hidden');
      dom.helper.textContent = v.helper;
    }
    dom.generate.disabled = !v.ok || state.phase === 'loading';

    // Textarea readonly during loading
    dom.textarea.readOnly = state.phase === 'loading';

    // Generate label
    dom.generate.textContent = state.phase === 'loading' ? 'Generating…' : 'Generate RAID';

    // Result zone
    renderResultZone();
  }

  // ---------- Helpers ----------
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ragClass(rag) {
    return `raid-item__rag--${String(rag).toLowerCase()}`;
  }

  function sevLabelClass(sev) {
    return `raid-item__sev-label--${String(sev).toLowerCase()}`;
  }

  // ---------- Per-category renderers ----------
  function renderRiskItem(r) {
    return `
      <div class="raid-item">
        <h3 class="raid-item__title">${escapeHtml(r.title)}</h3>
        <div class="raid-item__meta">
          <span class="raid-item__owner">${escapeHtml(r.owner)}</span>
          <span class="raid-item__score">P${r.probability} · I${r.impact} · Sev ${r.severity}</span>
          <span class="raid-item__rag ${ragClass(r.rag)}">${escapeHtml(r.rag)}</span>
        </div>
        <p class="raid-item__body"><span class="raid-item__label">Mitigation:</span> ${escapeHtml(r.mitigation)}</p>
      </div>`;
  }

  function renderAssumptionItem(a) {
    return `
      <div class="raid-item">
        <h3 class="raid-item__title">${escapeHtml(a.title)}</h3>
        <div class="raid-item__meta">
          <span class="raid-item__owner">${escapeHtml(a.owner)}</span>
        </div>
        <p class="raid-item__body">${escapeHtml(a.description)}</p>
        <p class="raid-item__body"><span class="raid-item__label">Validate by:</span> ${escapeHtml(a.validation_needed)}</p>
      </div>`;
  }

  function renderIssueItem(i) {
    return `
      <div class="raid-item">
        <h3 class="raid-item__title">${escapeHtml(i.title)}</h3>
        <div class="raid-item__meta">
          <span class="raid-item__owner">${escapeHtml(i.owner)}</span>
          <span class="raid-item__rag ${sevLabelClass(i.severity)}">${escapeHtml(i.severity)}</span>
        </div>
        <p class="raid-item__body">${escapeHtml(i.description)}</p>
        <p class="raid-item__body"><span class="raid-item__label">Action:</span> ${escapeHtml(i.suggested_action)}</p>
      </div>`;
  }

  function renderDependencyItem(d) {
    const conflict = d.conflict_flag === true;
    return `
      <div class="raid-item">
        <h3 class="raid-item__title">${escapeHtml(d.title)}</h3>
        <div class="raid-item__meta">
          <span class="raid-item__owner">${escapeHtml(d.owner)}</span>
          ${conflict ? `<span class="raid-item__conflict-pill">Conflict</span>` : ''}
        </div>
        <p class="raid-item__body"><span class="raid-item__label">Depends on:</span> ${escapeHtml(d.depends_on)}</p>
        ${conflict ? `<div class="raid-item__conflict-callout"><strong>⚠</strong> ${escapeHtml(d.conflict_note)}</div>` : ''}
      </div>`;
  }

  // ---------- Card renderer ----------
  function renderCard({ key, label, items, renderItem, sort, hasConflict }) {
    const sorted = sort ? [...items].sort(sort) : items;
    const body = sorted.length === 0
      ? `<p class="raid-card__empty">No items detected.</p>`
      : sorted.map(renderItem).join('');
    const conflictClass = hasConflict ? ' raid-card--conflict' : '';
    const cornerChip = hasConflict ? `<span class="raid-card__corner-chip">⚠ Conflict</span>` : '';
    return `
      <article class="raid-card${conflictClass}" data-category="${key}">
        ${cornerChip}
        <header class="raid-card__header">
          <span class="raid-card__pill raid-card__pill--${key}">${label}</span>
          <span class="raid-card__count">${items.length}</span>
        </header>
        ${body}
      </article>`;
  }

  function renderActionBar() {
    return `
      <div class="action-bar">
        <button id="copy-md-button" class="btn btn--primary" type="button">Copy as Markdown</button>
        <button id="dl-csv-button" class="btn btn--secondary" type="button">Download CSV</button>
        <button id="dl-jira-button" class="btn btn--secondary" type="button">Download for Jira</button>
        <button id="try-another-button" class="btn btn--ghost" type="button">Try another sample</button>
      </div>`;
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function downloadBlob(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function onCopyMarkdown() {
    const btn = $('#copy-md-button');
    const md = window.RaidExports.toMarkdown(state.result);
    try {
      await window.RaidClipboard.copyText(md);
      const original = btn.textContent;
      btn.textContent = 'Copied ✓';
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1500);
    } catch (_err) {
      btn.textContent = 'Copy failed';
      setTimeout(() => { btn.textContent = 'Copy as Markdown'; }, 1500);
    }
  }

  function onDownloadCSV() {
    const csv = window.RaidExports.toCSV(state.result);
    downloadBlob(`raid-log-${todayStr()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function onDownloadJira() {
    const csv = window.RaidExports.toJiraCSV(state.result);
    downloadBlob(`raid-jira-${todayStr()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function onTryAnother() {
    const samples = window.RAID_SAMPLES || [];
    if (samples.length === 0) return;
    state.currentSample = (state.currentSample + 1) % samples.length;
    dom.textarea.value = samples[state.currentSample].text;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    render();
    onGenerate();
  }

  function wireActionBar() {
    $('#copy-md-button')?.addEventListener('click', onCopyMarkdown);
    $('#dl-csv-button')?.addEventListener('click', onDownloadCSV);
    $('#dl-jira-button')?.addEventListener('click', onDownloadJira);
    $('#try-another-button')?.addEventListener('click', onTryAnother);
  }

  function renderGrid(raid) {
    const cards = [
      renderCard({
        key: 'risks',
        label: 'Risks',
        items: raid.risks || [],
        renderItem: renderRiskItem,
        sort: (a, b) => b.severity - a.severity
      }),
      renderCard({
        key: 'assumptions',
        label: 'Assumptions',
        items: raid.assumptions || [],
        renderItem: renderAssumptionItem
      }),
      renderCard({
        key: 'issues',
        label: 'Issues',
        items: raid.issues || [],
        renderItem: renderIssueItem,
        sort: (a, b) => {
          const order = { High: 0, Medium: 1, Low: 2 };
          return order[a.severity] - order[b.severity];
        }
      }),
      renderCard({
        key: 'dependencies',
        label: 'Dependencies',
        items: raid.dependencies || [],
        renderItem: renderDependencyItem,
        sort: (a, b) => (b.conflict_flag === true) - (a.conflict_flag === true),
        hasConflict: (raid.dependencies || []).some((d) => d.conflict_flag === true)
      })
    ];
    return `<div class="result-grid">${cards.join('')}</div>`;
  }

  // ---------- Result zone ----------
  function renderResultZone() {
    if (state.phase === 'idle') {
      dom.resultZone.hidden = true;
      dom.resultZone.innerHTML = '';
      return;
    }
    dom.resultZone.hidden = false;
    if (state.phase === 'loading') {
      dom.resultZone.innerHTML = `
        <div class="loading">
          <div class="spinner" aria-hidden="true"></div>
          <p>Analysing your notes…</p>
        </div>`;
    } else if (state.phase === 'result') {
      dom.resultZone.innerHTML = renderGrid(state.result) + renderActionBar();
      wireActionBar();
    } else if (state.phase === 'error') {
      // Phase 7 replaces this with the proper error-card
      dom.resultZone.innerHTML = `<div class="error">${escapeHtml(state.error)}</div>`;
    }
  }

  // ---------- API call ----------
  async function callExtract(text) {
    let res;
    try {
      res = await fetch('/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
    } catch (_networkErr) {
      return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }
    if (res.status === 502) return { ok: false, error: 'Extraction failed. Try rephrasing or shortening your notes.' };
    if (res.status === 400) return { ok: false, error: 'The AI service rejected the request. This is likely a temporary configuration issue. Please try again.' };
    if (res.status === 429) return { ok: false, error: 'Too many requests. Please wait a moment and try again.' };
    if (!res.ok)             return { ok: false, error: 'Extraction failed. Try rephrasing or shortening your notes.' };
    const data = await res.json();
    return { ok: true, data };
  }

  // ---------- Event handlers ----------
  async function onGenerate() {
    const v = validate(dom.textarea.value);
    if (!v.ok) return;
    state.phase = 'loading';
    state.error = null;
    render();

    const result = await callExtract(dom.textarea.value);
    if (result.ok) {
      state.phase = 'result';
      state.result = result.data;
    } else {
      state.phase = 'error';
      state.error = result.error;
    }
    render();
  }

  function onTextareaInput() {
    render();
  }

  // ---------- Init ----------
  function init() {
    dom.textarea   = $('#notes-textarea');
    dom.counter    = $('#notes-counter');
    dom.helper     = $('#notes-helper');
    dom.generate   = $('#generate-button');
    dom.resultZone = $('#result-zone');

    // Pre-load sample 0
    if (window.RAID_SAMPLES && window.RAID_SAMPLES[0]) {
      dom.textarea.value = window.RAID_SAMPLES[0].text;
      state.currentSample = 0;
    }

    dom.textarea.addEventListener('input', onTextareaInput);
    dom.generate.addEventListener('click', onGenerate);

    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
