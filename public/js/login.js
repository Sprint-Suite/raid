// public/js/login.js
//
// Submit handler for the login form. POSTs /api/login, redirects to /
// on success, shows an error on failure.

(function () {
  'use strict';

  function init() {
    const form = document.getElementById('login-form');
    const input = document.getElementById('key-input');
    const submit = document.getElementById('login-submit');
    const errorEl = document.getElementById('login-error');
    if (!form || !input || !submit || !errorEl) return;

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }

    function clearError() {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }

    input.addEventListener('input', clearError);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearError();
      const key = input.value.trim();
      if (!key) {
        showError('Enter your access key.');
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Signing in…';
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
        if (res.status === 200) {
          window.location.href = '/';
          return;
        }
        if (res.status === 401) {
          showError('Invalid key. Try again.');
        } else if (res.status === 429) {
          showError('Too many attempts. Please wait a few minutes.');
        } else {
          showError('Sign in failed. Please try again.');
        }
      } catch (_err) {
        showError("Couldn't reach the server. Check your connection and try again.");
      } finally {
        submit.disabled = false;
        submit.textContent = 'Sign in';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
