// public/js/extractUi.js
//
// Pure mapping from an /extract HTTP response to UI text. No DOM access so it
// is unit-testable. Consumed by app.js (callExtract + renderResultZone).
(function (window) {
  'use strict';

  // Returns a descriptor { error, reload? } for known statuses, else null
  // (caller treats null as: 2xx success, or fall back to a generic message).
  function messageFor(status) {
    switch (status) {
      case 401: return { reload: true, error: 'Signed out — redirecting.' };
      case 400: return { error: 'The AI service rejected the request. This is likely a temporary configuration issue. Please try again.' };
      case 402: return { error: "You've reached your monthly extract limit. Your quota resets on the 1st." };
      case 403: return { error: "You don't have access to RAID. Request access from the Sprint Suite dashboard." };
      case 429: return { error: 'Too many requests. Please wait a moment and try again.' };
      case 502: return { error: 'Extraction failed. Try rephrasing or shortening your notes.' };
      case 503: return { error: 'Service temporarily unavailable. Please try again in a moment.' };
      default:  return null;
    }
  }

  // Quiet "N left this month" note. Empty for unlimited grants (remaining null).
  function renderNote(remaining) {
    if (typeof remaining !== 'number') return '';
    const unit = remaining === 1 ? 'extract' : 'extracts';
    return `<p class="quota-note">${remaining} ${unit} left this month.</p>`;
  }

  window.RaidExtractUi = { messageFor, renderNote };
})(window);
