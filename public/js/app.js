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

  function renderResultZone() {
    // Placeholder: real rendering in Phase 4. Here, just expose the phase.
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
      // Phase 4 replaces this with the 2x2 grid
      dom.resultZone.innerHTML = `<pre>${JSON.stringify(state.result, null, 2)}</pre>`;
    } else if (state.phase === 'error') {
      dom.resultZone.innerHTML = `<div class="error">${state.error}</div>`;
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
