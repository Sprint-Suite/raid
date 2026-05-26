// public/js/exports.js
//
// Pure functions that convert a RAID JSON object to:
//   - toMarkdown(raid): single Markdown string
//   - toCSV(raid):      flat CSV string with harmonised columns
//   - toJiraCSV(raid):  CSV string with Jira-default columns + priority mapping
//
// Attached to window.RaidExports.

(function attachExports(window) {

  function mdEscape(s) {
    return String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  }

  function toMarkdown(raid) {
    const out = ['# RAID Log', ''];

    out.push('## Risks');
    if (!raid.risks?.length) {
      out.push('_No items detected._');
    } else {
      out.push('| Title | Owner | P | I | Sev | RAG | Mitigation |');
      out.push('|---|---|---|---|---|---|---|');
      for (const r of raid.risks) {
        out.push(`| ${mdEscape(r.title)} | ${mdEscape(r.owner)} | ${r.probability} | ${r.impact} | ${r.severity} | ${r.rag} | ${mdEscape(r.mitigation)} |`);
      }
    }
    out.push('');

    out.push('## Assumptions');
    if (!raid.assumptions?.length) {
      out.push('_No items detected._');
    } else {
      out.push('| Title | Owner | Description | Validate by |');
      out.push('|---|---|---|---|');
      for (const a of raid.assumptions) {
        out.push(`| ${mdEscape(a.title)} | ${mdEscape(a.owner)} | ${mdEscape(a.description)} | ${mdEscape(a.validation_needed)} |`);
      }
    }
    out.push('');

    out.push('## Issues');
    if (!raid.issues?.length) {
      out.push('_No items detected._');
    } else {
      out.push('| Title | Owner | Severity | Description | Action |');
      out.push('|---|---|---|---|---|');
      for (const i of raid.issues) {
        out.push(`| ${mdEscape(i.title)} | ${mdEscape(i.owner)} | ${i.severity} | ${mdEscape(i.description)} | ${mdEscape(i.suggested_action)} |`);
      }
    }
    out.push('');

    out.push('## Dependencies');
    if (!raid.dependencies?.length) {
      out.push('_No items detected._');
    } else {
      out.push('| Title | Owner | Depends on | Conflict | Conflict note |');
      out.push('|---|---|---|---|---|');
      for (const d of raid.dependencies) {
        out.push(`| ${mdEscape(d.title)} | ${mdEscape(d.owner)} | ${mdEscape(d.depends_on)} | ${d.conflict_flag ? 'Yes' : 'No'} | ${mdEscape(d.conflict_note)} |`);
      }
    }
    out.push('');

    return out.join('\n');
  }

  function csvCell(v) {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function csvRow(arr) { return arr.map(csvCell).join(','); }

  function toCSV(raid) {
    const header = ['Type','Title','Description','Owner','Probability','Impact','SeverityScore','RAG','SeverityLabel','Mitigation','Action','Validation','DependsOn','Conflict','ConflictNote'];
    const rows = [header];

    for (const r of raid.risks || []) {
      rows.push(['Risk', r.title, r.description, r.owner, r.probability, r.impact, r.severity, r.rag, '', r.mitigation, '', '', '', '', '']);
    }
    for (const a of raid.assumptions || []) {
      rows.push(['Assumption', a.title, a.description, a.owner, '', '', '', '', '', '', '', a.validation_needed, '', '', '']);
    }
    for (const i of raid.issues || []) {
      rows.push(['Issue', i.title, i.description, i.owner, '', '', '', '', i.severity, '', i.suggested_action, '', '', '', '']);
    }
    for (const d of raid.dependencies || []) {
      rows.push(['Dependency', d.title, d.description, d.owner, '', '', '', '', '', '', '', '', d.depends_on, d.conflict_flag ? 'Yes' : 'No', d.conflict_note || '']);
    }
    return rows.map(csvRow).join('\n');
  }

  function jiraPriorityForRisk(rag) {
    if (rag === 'Red') return 'Highest';
    if (rag === 'Amber') return 'High';
    return 'Medium';
  }

  function jiraPriorityForIssue(severity) {
    if (severity === 'High') return 'Highest';
    if (severity === 'Medium') return 'High';
    return 'Medium';
  }

  function toJiraCSV(raid) {
    const header = ['Summary','Issue Type','Priority','Description','Assignee','Labels'];
    const rows = [header];

    for (const r of raid.risks || []) {
      const desc = `${r.description}\n\nMitigation: ${r.mitigation}\n\nProbability: ${r.probability}, Impact: ${r.impact}, Severity: ${r.severity}, RAG: ${r.rag}`;
      rows.push([r.title, 'Risk', jiraPriorityForRisk(r.rag), desc, r.owner === 'Unassigned' ? '' : r.owner, 'raid-extracted risk']);
    }
    for (const a of raid.assumptions || []) {
      const desc = `${a.description}\n\nValidate by: ${a.validation_needed}`;
      rows.push([a.title, 'Task', 'Medium', desc, a.owner === 'Unassigned' ? '' : a.owner, 'raid-extracted assumption']);
    }
    for (const i of raid.issues || []) {
      const desc = `${i.description}\n\nAction: ${i.suggested_action}`;
      rows.push([i.title, 'Bug', jiraPriorityForIssue(i.severity), desc, i.owner === 'Unassigned' ? '' : i.owner, 'raid-extracted issue']);
    }
    for (const d of raid.dependencies || []) {
      const desc = `${d.description}\n\nDepends on: ${d.depends_on}${d.conflict_flag ? `\n\nCONFLICT: ${d.conflict_note}` : ''}`;
      rows.push([d.title, 'Task', d.conflict_flag ? 'Highest' : 'Medium', desc, d.owner === 'Unassigned' ? '' : d.owner, 'raid-extracted dependency']);
    }
    return rows.map(csvRow).join('\n');
  }

  window.RaidExports = { toMarkdown, toCSV, toJiraCSV };
})(window);
