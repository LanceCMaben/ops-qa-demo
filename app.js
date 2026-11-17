(function () {
  'use strict';

  var DASHBOARD = '3E Operations';
  var SQL_TIMEOUT_MS = 60000;

  var DATASET_LABELS = {
    programs: 'TOP_PROGRAMS_ACTIVITY_STATUS',
    partnerFiles: 'PARTNER_FILES_SUMMARY',
    downloads: 'VW_PARTNER_DOWNLOADS_KMK',
    loadHistory: 'PROGRAM_LOAD_HISTORY',
    leads: 'leads_programs_xpl',
    printBatches: 'PRINT_BATCHES',
    campaignQaInsights: 'Enrollment Metrics',
    programMeta: 'VW_PROGRAM_META',
    emailSkew: 'Email skew',
    pageViews: 'PortalActivity'
  };

  var DATASETS = {
    programs: { alias: 'programs', id: '59afa2d3-bbd8-4ed8-9e1c-c474f6fe7c46' },
    partnerFiles: { alias: 'partnerFiles', id: '79b16d1a-be4d-441d-a6ec-619156b764cf' },
    downloads: { alias: 'downloads', id: '422fec3e-c1f1-4e9d-baba-2e8365cb6289' },
    loadHistory: { alias: 'loadHistory', id: 'cf232f03-3941-4bfe-b4c6-8e5709c6c1a2' },
    leads: { alias: 'leads', id: 'e4871332-8b50-4d6a-8021-dcb29669f5b8' },
    printBatches: { alias: 'printBatches', id: '9100cf4b-7aa4-46be-b055-a59cb46e70db' },
    campaignQaInsights: { alias: 'campaignQaInsights', id: '43a17397-6e63-4e9d-9ef6-bbc2217ddac2' },
    programMeta: { alias: 'programMeta', id: 'efa412ee-ca5b-483a-9cf0-f7eca03034ed' },
    emailSkew: { alias: 'emailSkew', id: 'c9aced4a-18bd-43df-aa45-df993c868726' },
    pageViews: { alias: 'pageViews', id: 'dea70a64-b434-4783-80d3-84df858a785c' }
  };

  var ACTIVE_STATUS_SQL = "UPPER(PROGRAM_STATUS) LIKE '%ACTIVE%' AND UPPER(PROGRAM_STATUS) NOT LIKE '%INACTIVE%' AND UPPER(PROGRAM_STATUS) NOT LIKE '%DEVELOP%'";

  var CHECKS = [
    check('Partner Data Health', 'Program activity returns rows', function () {
      return expectProbe('programs', 'Program activity', '', 'PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, PROGRAM_STATUS, FIRST_ACTIVITY, LAST_ACTIVITY');
    }, { dataset: 'programs', about: 'Confirms the activity table that Partner Data Health opens with has at least one row.' }),
    check('Partner Data Health', 'Active programs exist', function () {
      return countWhere('programs', sandboxWhere(ACTIVE_STATUS_SQL)).catch(function () {
        return countWhere('programs', ACTIVE_STATUS_SQL);
      }).then(function (n) {
        if (n < 1) return fail('No program rows with an Active status. Inactive, Development, and z_ sandbox partners are excluded, matching the chapter.');
        return pass(formatNum(n) + ' program rows are Active.');
      });
    }, { dataset: 'programs', about: 'Counts Active programs the same way the chapter chips do. Inactive, Development, and z_ partners are excluded.' }),
    check('Partner Data Health', 'An active program was touched within 14 days', function () {
      return expectFresh('programs', 'LAST_ACTIVITY', 14, 'Newest active last activity', sandboxWhere(ACTIVE_STATUS_SQL)).catch(function () {
        return expectFresh('programs', 'LAST_ACTIVITY', 14, 'Newest active last activity', ACTIVE_STATUS_SQL);
      });
    }, { dataset: 'programs', about: 'Newest LAST_ACTIVITY among Active programs should be within 14 days.' }),
    check('Partner Data Health', 'Partner files return rows', function () {
      return expectProbe('partnerFiles', 'Partner files');
    }, { dataset: 'partnerFiles', about: 'The Files table needs at least one row from PARTNER_FILES_SUMMARY.' }),
    check('Partner Data Health', 'Partner downloads return a date', function () {
      return expectFreshColumns('downloads', ['EVENT_DATE', 'DOWNLOAD_DATE'], null, 'Newest download');
    }, { dataset: 'downloads', about: 'Looks for EVENT_DATE or DOWNLOAD_DATE so the Downloads table can show a download date.' }),
    check('Partner Data Health', 'Daily load returns rows', function () {
      return expectProbe('loadHistory', 'Daily load');
    }, { dataset: 'loadHistory', about: 'The Daily Load table needs at least one PROGRAM_LOAD_HISTORY row.' }),
    check('Partner Data Health', 'Campaign totals return rows', function () {
      return expectProbe('leads', 'Leads');
    }, { dataset: 'leads', about: 'Campaign Totals counts rows in leads_programs_xpl.' }),

    check('Print Batches', 'Print batch columns return a row', function () {
      return expectProbe('printBatches', 'PRINT_BATCHES', '', 'PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, SENT_BATCH, SENT_DEMAND, CNV_SCORE');
    }, { dataset: 'printBatches', about: 'Confirms the Print Batches columns used on the Operations chapter return a row.' }),
    check('Print Batches', 'Current cycle year is present', function () {
      function yearRows(whereSql) {
        return sql('printBatches', 'SELECT CAMPAIGN_YEAR AS Y FROM {alias} WHERE ' + whereSql + ' GROUP BY CAMPAIGN_YEAR');
      }
      return yearRows(sandboxWhere('CAMPAIGN_YEAR IS NOT NULL')).catch(function () {
        return yearRows('CAMPAIGN_YEAR IS NOT NULL');
      }).then(function (rows) {
        var years = rows.map(function (row) { return String(cell(row, 'Y') == null ? '' : cell(row, 'Y')).trim(); }).filter(Boolean);
        var hit = years.filter(isCurrentCycleYear);
        var label = cycleYear() + ' or ' + cycleToken();
        if (!hit.length) {
          return fail('No ' + label + ' value in CAMPAIGN_YEAR. Years returned: ' + (years.slice(0, 12).join(', ') || 'none') + '.');
        }
        return pass('CAMPAIGN_YEAR includes the current cycle (' + hit.slice(0, 4).join(', ') + ').');
      });
    }, { dataset: 'printBatches', about: 'Print years should include the current campaign cycle. The year rolls in August.' }),

    check('Campaign Upload QA', 'Enrollment Metrics returns rows', function () {
      return expectProbe('campaignQaInsights', 'Enrollment Metrics');
    }, { dataset: 'campaignQaInsights', about: 'Campaign Upload QA reads Enrollment Metrics first.' }),
    check('Campaign Upload QA', 'CNVA rows are present', function () {
      return probe('campaignQaInsights', "UPPER(PROGRAM_SOLUTION) = 'CNVA'").then(function (ok) {
        if (ok) return pass('Enrollment Metrics has PROGRAM_SOLUTION CNVA.');
        return probe('campaignQaInsights', "UPPER(CF_CAMPAIGN_TYPE) LIKE '%CONVERSION APPLY%'").then(function (named) {
          if (named) return pass('Enrollment Metrics has Conversion Apply on CF_CAMPAIGN_TYPE. The chapter maps that name to CNVA.');
          return fail('No PROGRAM_SOLUTION CNVA rows, and no Conversion Apply value on CF_CAMPAIGN_TYPE.');
        }).catch(function () {
          return fail('Enrollment Metrics has no PROGRAM_SOLUTION = CNVA rows.');
        });
      });
    }, { dataset: 'campaignQaInsights', about: 'Looks for CNVA on PROGRAM_SOLUTION, then Conversion Apply on CF_CAMPAIGN_TYPE.' }),
    check('Campaign Upload QA', 'Source file date is within 21 days', function () {
      return expectFreshColumns('campaignQaInsights', ['CF_SOURCE_FILE_DATE', 'SOURCE_FILE_DATE', 'EXTRACT_TIME'], 21, 'Newest source file');
    }, { dataset: 'campaignQaInsights', about: 'Newest source file date should be within 21 days.' }),
    check('Campaign Upload QA', 'XPL fallback returns rows', function () {
      return expectProbe('leads', 'XPL leads', 'MEMBERSHIP_DATE IS NOT NULL', 'MEMBERSHIP_DATE');
    }, { dataset: 'leads', about: 'If Enrollment Metrics is empty, Upload QA falls back to XPL membership dates.' }),

    check('Campaign Timelines', 'A live partner has first and last activity', function () {
      var where = "FIRST_ACTIVITY IS NOT NULL AND LAST_ACTIVITY IS NOT NULL AND (PARTITION IS NULL OR LOWER(SUBSTRING(PARTITION, 1, 2)) <> 'z_')";
      return expectProbe('programs', 'Campaign timelines', where, 'PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, FIRST_ACTIVITY, LAST_ACTIVITY').catch(function () {
        return expectProbe('programs', 'Campaign timelines', 'FIRST_ACTIVITY IS NOT NULL AND LAST_ACTIVITY IS NOT NULL', 'PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, FIRST_ACTIVITY, LAST_ACTIVITY');
      });
    }, { dataset: 'programs', about: 'A live (non z_) partner should have FIRST_ACTIVITY and LAST_ACTIVITY for the timelines Gantt.' }),

    check('Campaign Load History', 'Membership dates exist', function () {
      return expectProbe('leads', 'Membership load', 'MEMBERSHIP_DATE IS NOT NULL', 'PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, MEMBERSHIP_DATE');
    }, { dataset: 'leads', about: 'Load History charts membership dates from leads_programs_xpl.' }),
    check('Campaign Load History', 'Membership load is within 14 days', function () {
      return expectFresh('leads', 'MEMBERSHIP_DATE', 14, 'Newest membership date', SANDBOX_SQL).catch(function () {
        return expectFresh('leads', 'MEMBERSHIP_DATE', 14, 'Newest membership date');
      });
    }, { dataset: 'leads', about: 'Newest MEMBERSHIP_DATE, ignoring z_ partners, should be within 14 days.' }),

    check('Program Meta', 'Program meta returns rows', function () {
      return expectProbe('programMeta', 'Program meta', '', 'PARTITION, PROGRAM_SOLUTION, CAMPAIGN_YEAR, PROGRAM_STATUS');
    }, { dataset: 'programMeta', about: 'Program Meta cards come from VW_PROGRAM_META partner, campaign, year, and status.' }),
    check('Program Meta', 'Active program meta rows exist', function () {
      return countWhere('programMeta', sandboxWhere(ACTIVE_STATUS_SQL)).catch(function () {
        return countWhere('programMeta', ACTIVE_STATUS_SQL);
      }).then(function (n) {
        if (n < 1) return fail('Program meta has no Active PROGRAM_STATUS rows. Inactive, Development, and z_ sandbox partners are excluded.');
        return pass(formatNum(n) + ' program meta rows are Active.');
      });
    }, { dataset: 'programMeta', about: 'At least one Active program meta row should exist after excluding Inactive, Development, and z_ partners.' }),
    check('Program Meta', 'Email skew returns a difference', function () {
      return expectProbe('emailSkew', 'Email skew', 'PERCENTAGE_DIFF IS NOT NULL', 'PARTITION, CAMPAIGN_YEAR, PROGRAM_SOLUTION, PERCENTAGE_DIFF');
    }, { dataset: 'emailSkew', about: 'Program Meta shows PERCENTAGE_DIFF when an email skew match exists.' }),
    check('Program Meta', 'Last download date exists', function () {
      return expectFreshColumns('downloads', ['EVENT_DATE', 'DOWNLOAD_DATE'], null, 'Newest download');
    }, { dataset: 'downloads', about: 'Last download on Program Meta uses the same downloads view as Partner Data Health.' }),

    check('Insights Activity', 'Portal activity returns a page name', function () {
      return expectProbe('pageViews', 'Portal activity', 'page_name IS NOT NULL', 'page_name, act_date');
    }, { dataset: 'pageViews', about: 'Insights Activity needs page_name on PortalActivity.' }),
    check('Insights Activity', 'Portal activity is within 7 days', function () {
      return expectFresh('pageViews', 'act_date', 7, 'Newest portal view');
    }, { dataset: 'pageViews', about: 'Newest act_date should be within 7 days.' }),

    check('Documentation', 'Static chapter has no dataset', function () {
      return Promise.resolve(pass('Documentation is static content, so this chapter has no data query.'));
    }, { about: 'Documentation has no dataset. This check always passes.' })
  ];
  CHECKS.forEach(function (item, i) { item.id = 'c' + i; });

  var running = false;
  var lastReport = null;
  var latestResults = [];
  var attentionOnly = false;
  var selectedCheckId = null;
  var CONCURRENCY = 3;

  function $(id) { return document.getElementById(id); }

  function check(chapter, name, run, extra) {
    extra = extra || {};
    return {
      dashboard: DASHBOARD,
      chapter: chapter,
      name: name,
      run: run,
      dataset: extra.dataset || '',
      about: extra.about || ''
    };
  }

  function datasetLabel(key) {
    return DATASET_LABELS[key] || key || 'None';
  }

  function resultFromSpec(spec, outcome) {
    outcome = outcome || {};
    var status = outcome.status === 'fail' ? 'fail' : (outcome.status === 'warn' ? 'warn' : 'pass');
    return {
      id: spec.id,
      dashboard: spec.dashboard,
      chapter: spec.chapter,
      name: spec.name,
      dataset: spec.dataset || '',
      about: spec.about || '',
      status: status,
      detail: outcome.detail || '',
      error: !!outcome.error,
      freshDate: outcome.freshDate || null
    };
  }

  function currentResults() {
    if (latestResults.length) return latestResults;
    return lastReport && lastReport.results ? lastReport.results : [];
  }

  function findResult(id) {
    var rows = currentResults();
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].id === id) return rows[i];
    }
    return null;
  }

  function attentionResults() {
    return currentResults().filter(function (item) {
      return item.status === 'fail' || item.status === 'warn';
    });
  }

  function needsAttention(item) {
    return item && (item.status === 'fail' || item.status === 'warn');
  }

  function statusRank(status) {
    return status === 'fail' ? 0 : (status === 'warn' ? 1 : 2);
  }

  function worstStatus(items) {
    if (items.some(function (item) { return item.status === 'fail'; })) return 'fail';
    if (items.some(function (item) { return item.status === 'warn'; })) return 'warn';
    return 'pass';
  }

  function statusLabel(status) {
    return status === 'fail' ? 'Fail' : (status === 'warn' ? 'Warn' : 'Pass');
  }

  function pass(detail, extra) { return Object.assign({ status: 'pass', detail: detail }, extra || {}); }
  function fail(detail, extra) { return Object.assign({ status: 'fail', detail: detail }, extra || {}); }
  function warn(detail, extra) { return Object.assign({ status: 'warn', detail: detail }, extra || {}); }

  function cell(row, key) {
    if (!row) return null;
    if (row[key] != null) return row[key];
    var upper = String(key).toUpperCase();
    var name;
    for (name in row) {
      if (Object.prototype.hasOwnProperty.call(row, name) && String(name).toUpperCase() === upper) return row[name];
    }
    return null;
  }

  function num(value) {
    if (value == null || value === '') return 0;
    var n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  }

  function formatNum(n) {
    return Math.round(num(n)).toLocaleString('en-US');
  }

  function parseDate(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
      var ms = value > 1e12 ? value : (value > 1e9 ? value * 1000 : NaN);
      var fromNum = new Date(ms);
      return isNaN(fromNum.getTime()) ? null : fromNum;
    }
    var text = String(value).trim();
    if (/^\d{13}$/.test(text)) return new Date(Number(text));
    var parsed = new Date(text);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDate(value) {
    var d = parseDate(value);
    if (!d) return 'unknown date';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function daysSince(value) {
    var d = parseDate(value);
    if (!d) return null;
    return (Date.now() - d.getTime()) / 86400000;
  }

  function errMessage(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    var parts = [];
    if (err.message) parts.push(String(err.message));
    if (err.responseText && parts.indexOf(String(err.responseText)) === -1) parts.push(String(err.responseText));
    if (err.error && String(err.error) !== parts[0]) parts.push(typeof err.error === 'string' ? err.error : JSON.stringify(err.error));
    if (err.status) parts.push('HTTP ' + err.status + (err.statusText ? ' ' + err.statusText : ''));
    return parts.filter(Boolean).join('\n') || String(err);
  }

  /* Campaign year rolls in August, matching Operations: Oct 2026 is CY26. */
  function cycleYear(date) {
    var d = date || new Date();
    var year = d.getFullYear();
    if (d.getMonth() < 7) year -= 1;
    return year;
  }

  function cycleToken(year) {
    return 'CY' + String(year == null ? cycleYear() : year).slice(-2);
  }

  function isCurrentCycleYear(value) {
    var year = cycleYear();
    var token = cycleToken(year);
    var s = String(value == null ? '' : value).toUpperCase().replace(/\s+/g, '');
    if (s === String(year) || s === String(year) + '.0' || s === token) return true;
    if (s.indexOf(token) === 0) return true;
    return Number(s) === year;
  }

  var SANDBOX_SQL = "(PARTITION IS NULL OR LOWER(SUBSTRING(PARTITION, 1, 2)) <> 'z_')";

  function sandboxWhere(whereSql) {
    if (!whereSql) return SANDBOX_SQL;
    return '(' + whereSql + ') AND ' + SANDBOX_SQL;
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(label + ' timed out after ' + Math.round(ms / 1000) + 's'));
      }, ms);
      promise.then(function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function rowsFromSql(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw.error || raw.status === 'error') && !raw.columns && !raw.rows) {
      throw new Error(raw.error || raw.message || 'SQL error');
    }
    if (raw && Array.isArray(raw.columns) && Array.isArray(raw.rows)) {
      return raw.rows.map(function (row) {
        var obj = {};
        raw.columns.forEach(function (col, i) {
          var name = col && col.name ? col.name : col;
          obj[name] = Array.isArray(row) ? row[i] : row[name];
        });
        return obj;
      });
    }
    if (Array.isArray(raw)) return raw;
    return [];
  }

  function sqlErrorText(status, text) {
    var body = String(text || '').trim();
    if (body) {
      try {
        var parsed = JSON.parse(body);
        var detail = parsed.error || parsed.message || parsed.details || parsed.errorMessage;
        if (detail && typeof detail !== 'string') detail = JSON.stringify(detail);
        if (detail) body = String(detail);
      } catch (e) { /* keep the raw response */ }
    }
    if (!body) return 'HTTP ' + status;
    return body;
  }

  function postSql(path, statement) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/sql/v1/' + path);
      xhr.setRequestHeader('Content-Type', 'text/plain');
      if (window.__RYUU_SID__) xhr.setRequestHeader('X-DOMO-Ryuu-Session', window.__RYUU_SID__);
      xhr.onload = function () {
        var text = xhr.responseText || '';
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(text ? JSON.parse(text) : []); }
          catch (e) { reject(new Error('Invalid JSON response\n' + text)); }
          return;
        }
        reject(new Error(sqlErrorText(xhr.status, text)));
      };
      xhr.onerror = function () { reject(new Error('Network error')); };
      xhr.send(statement);
    });
  }

  function mappingHint(spec, err) {
    var msg = errMessage(err);
    if (!/DA0004|could not be found in the mapping/i.test(msg)) return msg;
    return 'Alias "' + spec.alias + '" (' + datasetLabel(spec.alias) + ') is not mapped on this card. Edit the card → Data and map ' + spec.alias + ' to dataset ' + spec.id + '.';
  }

  function sql(datasetKey, statement) {
    var spec = DATASETS[datasetKey];
    if (!spec) return Promise.reject(new Error('Unknown dataset ' + datasetKey));
    var q = statement.replace(/\{alias\}/g, spec.alias);
    return withTimeout(postSql(spec.alias, q), SQL_TIMEOUT_MS, spec.alias)
      .then(rowsFromSql)
      .catch(function (err) {
        throw new Error(mappingHint(spec, err));
      });
  }

  function countWhere(datasetKey, whereSql) {
    var statement = 'SELECT COUNT(*) AS N FROM {alias}' + (whereSql ? ' WHERE ' + whereSql : '');
    return sql(datasetKey, statement).then(function (rows) {
      return num(cell(rows[0], 'N'));
    });
  }

  function probe(datasetKey, whereSql, columns) {
    var statement = 'SELECT ' + (columns || '1 AS N') + ' FROM {alias}' + (whereSql ? ' WHERE ' + whereSql : '') + ' LIMIT 1';
    return sql(datasetKey, statement).then(function (rows) {
      return !!(rows && rows.length);
    });
  }

  function expectProbe(datasetKey, label, whereSql, columns) {
    return probe(datasetKey, whereSql, columns).then(function (ok) {
      if (!ok) return fail(label + ' returned 0 rows.');
      return pass(label + ' returned a row.');
    });
  }

  function expectFresh(datasetKey, column, maxDays, label, whereSql) {
    var statement = 'SELECT MAX(' + column + ') AS D FROM {alias}' + (whereSql ? ' WHERE ' + whereSql : '');
    return sql(datasetKey, statement).then(function (rows) {
      var value = cell(rows[0], 'D');
      var age = daysSince(value);
      if (age == null) return fail(label + ' did not return a date from ' + column + '.');
      var rounded = Math.max(0, Math.floor(age));
      var extra = { freshDate: value };
      if (maxDays != null && age > maxDays) {
        return warn(label + ' is ' + formatDate(value) + ' (' + rounded + ' days ago). Expected within ' + maxDays + ' days.', extra);
      }
      return pass(label + ' is ' + formatDate(value) + ' (' + rounded + ' days ago).', extra);
    });
  }

  function expectFreshColumns(datasetKey, columns, maxDays, label, whereSql) {
    function attempt(i) {
      return expectFresh(datasetKey, columns[i], maxDays, label, whereSql).then(function (result) {
        var missing = result.status === 'fail' && /did not return a date/i.test(result.detail);
        if (missing && i + 1 < columns.length) return attempt(i + 1);
        return result;
      }).catch(function (err) {
        if (i + 1 < columns.length) return attempt(i + 1);
        return fail(errMessage(err));
      });
    }
    return attempt(0);
  }

  function setStatus(text) {
    $('runStatus').textContent = text;
  }

  function showProgress(done, total, label) {
    var panel = $('runProgress');
    var pct = total ? Math.round((done / total) * 100) : 0;
    panel.hidden = false;
    $('runProgressLabel').textContent = label || 'Running checks…';
    $('runProgressMeta').textContent = done + ' of ' + total;
    $('runProgressFill').style.width = pct + '%';
    $('runProgressBar').setAttribute('aria-valuenow', String(pct));
    $('runProgressBar').setAttribute('aria-valuemax', '100');
  }

  function hideProgress() {
    $('runProgress').hidden = true;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pill(status) {
    var kind = status === 'fail'
      ? 'status-chip status-chip--fail'
      : (status === 'warn' ? 'status-chip status-chip--warn' : 'status-chip status-chip--pass');
    return '<span class="' + kind + '">' + statusLabel(status) + '</span>';
  }

  function chapterSlug(name) {
    return 'chapter-' + String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function setKpiTone(id, tone) {
    var value = $(id);
    if (!value) return;
    var card = value.closest ? value.closest('.kpi-card') : null;
    if (!card) return;
    card.classList.remove('kpi-card--fail', 'kpi-card--warn', 'kpi-card--pass');
    if (tone) card.classList.add('kpi-card--' + tone);
  }

  function groupResults(results) {
    var dashboards = [];
    var byDash = {};
    results.forEach(function (item) {
      var dash = byDash[item.dashboard];
      if (!dash) {
        dash = { name: item.dashboard, chapters: [], byChapter: {} };
        byDash[item.dashboard] = dash;
        dashboards.push(dash);
      }
      var chapter = dash.byChapter[item.chapter];
      if (!chapter) {
        chapter = { name: item.chapter, checks: [] };
        dash.byChapter[item.chapter] = chapter;
        dash.chapters.push(chapter);
      }
      chapter.checks.push(item);
    });
    dashboards.forEach(function (dash) {
      dash.chapters.forEach(function (chapter) {
        chapter.status = worstStatus(chapter.checks);
      });
      dash.status = worstStatus(dash.chapters.map(function (chapter) { return { status: chapter.status }; }));
    });
    return dashboards;
  }

  function uniqueChapters() {
    var names = [];
    CHECKS.forEach(function (spec) {
      if (names.indexOf(spec.chapter) === -1) names.push(spec.chapter);
    });
    return names;
  }

  function chapterSummary(chapter, finishedAt) {
    var failedN = chapter.checks.filter(function (item) { return item.status === 'fail'; }).length;
    var warnN = chapter.checks.filter(function (item) { return item.status === 'warn'; }).length;
    var planned = CHECKS.filter(function (item) { return item.chapter === chapter.name; }).length;
    var parts = [];
    if (failedN) parts.push(failedN + ' failed');
    if (warnN) parts.push(warnN + ' warnings');
    if (parts.length) {
      var ok = chapter.checks.length - failedN - warnN;
      if (ok) parts.push(ok + ' passed');
      return parts.join(' · ');
    }
    if (!finishedAt && chapter.checks.length < planned) {
      return chapter.checks.length + ' of ' + planned + ' finished';
    }
    return 'All ' + chapter.checks.length + ' passed';
  }

  function catalogHtml() {
    var names = uniqueChapters();
    var articles = names.map(function (name) {
      var specs = CHECKS.filter(function (item) { return item.chapter === name; });
      var items = specs.map(function (spec) {
        return '<li class="is-pass"><div></div><div><p class="check-name">' + escapeHtml(spec.name) +
          '</p><p class="check-detail">' + escapeHtml(datasetLabel(spec.dataset)) +
          (spec.about ? ' · ' + spec.about : '') + '</p></div></li>';
      }).join('');
      return '<article class="chapter table-panel" id="' + chapterSlug(name) + '"><div class="chapter-head"><div><h3>' +
        escapeHtml(name) + '</h3><p class="chapter-summary">' + specs.length +
        ' checks · not run</p></div></div><ul class="check-list">' + items + '</ul></article>';
    }).join('');
    return '<p class="result-banner">Check catalog. Click <strong>Run checks</strong> to query these datasets.</p>' +
      '<div class="chapter-grid">' + articles + '</div>';
  }

  function fillChapterChips(chapters, live) {
    var nav = $('chapterChips');
    if (!nav) return;
    if (!chapters.length) {
      nav.hidden = true;
      nav.innerHTML = '';
      return;
    }
    var sorted = chapters.slice();
    if (!live) sorted.sort(function (a, b) { return statusRank(a.status) - statusRank(b.status); });
    nav.hidden = false;
    nav.innerHTML = sorted.map(function (chapter) {
      var failedN = chapter.checks.filter(function (item) { return item.status === 'fail'; }).length;
      var warnN = chapter.checks.filter(function (item) { return item.status === 'warn'; }).length;
      var extra = failedN ? ' · ' + failedN + ' fail' : (warnN ? ' · ' + warnN + ' warn' : '');
      var tone = chapter.status ? ' is-' + chapter.status : '';
      return '<button type="button" class="chapter-chip' + tone + '" data-jump-chapter="' +
        escapeHtml(chapter.name) + '">' + escapeHtml(chapter.name) + extra + '</button>';
    }).join('');
  }

  function fillDatasetStrip(results) {
    var strip = $('datasetStrip');
    if (!strip) return;
    var keys = Object.keys(DATASETS);
    strip.hidden = false;
    strip.innerHTML = keys.map(function (key) {
      var planned = CHECKS.filter(function (item) { return item.dataset === key; }).length;
      var items = (results || []).filter(function (item) { return item.dataset === key; });
      var failedN = items.filter(function (item) { return item.status === 'fail'; }).length;
      var warnN = items.filter(function (item) { return item.status === 'warn'; }).length;
      var tone = items.length ? worstStatus(items) : '';
      var fresh = null;
      items.forEach(function (item) {
        var d = parseDate(item.freshDate);
        if (d && (!fresh || d > fresh)) fresh = d;
      });
      var dateLine = fresh
        ? 'Newest ' + formatDate(fresh)
        : (items.length ? 'No date in this run' : 'Not run');
      var countLine = items.length
        ? items.length + ' of ' + planned + ' checks' + (failedN ? ' · ' + failedN + ' fail' : '') + (warnN ? ' · ' + warnN + ' warn' : '')
        : planned + ' checks';
      return '<article class="dataset-tile' + (tone ? ' is-' + tone : '') + '"><p class="dataset-tile-label">' +
        escapeHtml(DATASET_LABELS[key] || key) + '</p><p class="dataset-tile-alias">' + escapeHtml(key) +
        '</p><p class="dataset-tile-meta">' + escapeHtml(countLine) + '</p><p class="dataset-tile-date">' +
        escapeHtml(dateLine) + '</p></article>';
    }).join('');
  }

  function jumpChapter(name) {
    var el = document.getElementById(chapterSlug(name));
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render(results, finishedAt) {
    latestResults = (results || []).slice();
    var groups = groupResults(results);
    var chapters = [];
    groups.forEach(function (dash) {
      dash.chapters.forEach(function (chapter) { chapters.push(chapter); });
    });
    var failedChecks = results.filter(function (item) { return item.status === 'fail'; }).length;
    var warnChecks = results.filter(function (item) { return item.status === 'warn'; }).length;
    var chapterCount = chapters.length;
    var failedChapters = chapters.filter(function (chapter) { return chapter.status === 'fail'; }).length;
    var warnChapters = chapters.filter(function (chapter) { return chapter.status === 'warn'; }).length;
    var overall = results.length ? worstStatus(results) : '';
    var resultText = !results.length ? '—' : (overall === 'fail' ? 'Fail' : (overall === 'warn' ? 'Warn' : (finishedAt ? 'Pass' : '…')));
    $('kpiResult').textContent = resultText;
    $('kpiResultHint').textContent = finishedAt
      ? (overall === 'fail' ? 'At least one empty or broken check' : (overall === 'warn' ? 'Dates are stale; tables have rows' : 'This run'))
      : (results.length ? 'Still running' : 'After a run');
    $('kpiChapters').textContent = results.length ? String(failedChapters) : '—';
    $('kpiChaptersHint').textContent = chapterCount
      ? ('of ' + chapterCount + (warnChapters ? ' · ' + warnChapters + ' warn' : ''))
      : 'Empty or broken checks';
    $('kpiChecks').textContent = results.length ? String(failedChecks) : '—';
    $('kpiChecksHint').textContent = results.length
      ? ('of ' + results.length + (warnChecks ? ' · ' + warnChecks + ' warn' : ''))
      : 'Open a chapter for the reason';
    $('kpiWhen').textContent = finishedAt
      ? finishedAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : (running ? 'Running' : '—');
    setKpiTone('kpiResult', overall || '');
    setKpiTone('kpiChapters', failedChapters ? 'fail' : (warnChapters ? 'warn' : (results.length ? 'pass' : '')));
    setKpiTone('kpiChecks', failedChecks ? 'fail' : (warnChecks ? 'warn' : (results.length ? 'pass' : '')));

    fillDatasetStrip(results);
    var toolbar = $('reportToolbar');
    var copyBtn = $('btnCopyFailures');
    if (!results.length) {
      fillChapterChips(uniqueChapters().map(function (name) {
        return { name: name, status: '', checks: [] };
      }), true);
      if (toolbar) toolbar.hidden = true;
      if (copyBtn) copyBtn.disabled = true;
      $('btnExportReport').disabled = true;
      $('report').innerHTML = running
        ? '<p class="result-banner">Starting checks…</p>'
        : catalogHtml();
      return;
    }

    if (finishedAt) lastReport = { results: results.slice(), finishedAt: finishedAt };
    $('btnExportReport').disabled = !lastReport || running;
    if (toolbar) toolbar.hidden = false;
    if (copyBtn) copyBtn.disabled = !attentionResults().length;

    var banner;
    var bannerClass = 'result-banner';
    if (overall === 'fail') {
      bannerClass += ' is-fail';
      banner = finishedAt
        ? failedChecks + ' checks failed across ' + failedChapters + ' chapters' + (warnChecks ? ' · ' + warnChecks + ' warnings' : '') + '.'
        : failedChecks + ' failed so far. Checks are still running.';
    } else if (overall === 'warn') {
      bannerClass += ' is-warn';
      banner = finishedAt
        ? warnChecks + ' stale-date warnings. No empty tables.'
        : warnChecks + ' warnings so far. Checks are still running.';
    } else {
      bannerClass += finishedAt ? ' is-pass' : '';
      banner = finishedAt ? 'All ' + results.length + ' checks passed.' : 'Checks are still running.';
    }

    var attentionItems = results.filter(needsAttention).slice().sort(function (a, b) {
      return statusRank(a.status) - statusRank(b.status);
    });
    var attention = '';
    if (finishedAt && attentionItems.length) {
      attention = '<section class="attention table-panel"><h2>Needs attention</h2><ul class="attention-list">' +
        attentionItems.map(function (item) {
          return '<li><button type="button" class="attention-open" data-open-check="' + escapeHtml(item.id) + '">' +
            '<span class="attention-chapter' + (item.status === 'warn' ? ' is-warn' : '') + '">' +
            escapeHtml(item.chapter) + ' · ' + statusLabel(item.status) + '</span>' +
            '<span class="attention-name">' + escapeHtml(item.name) + '</span></button>' +
            '<p class="check-detail">' + escapeHtml(item.detail) + '</p></li>';
        }).join('') + '</ul></section>';
    }

    if (finishedAt) {
      chapters.sort(function (a, b) { return statusRank(a.status) - statusRank(b.status); });
    }
    fillChapterChips(chapters, !finishedAt);

    var body = chapters.map(function (chapter) {
      var visible = attentionOnly ? chapter.checks.filter(needsAttention) : chapter.checks;
      if (!visible.length) return '';
      var items = visible.map(function (item) {
        var openable = needsAttention(item);
        var open = openable
          ? ' class="check-open" data-open-check="' + escapeHtml(item.id) + '" tabindex="0" role="button" aria-label="Open details for ' + escapeHtml(item.name) + '"'
          : '';
        var rowClass = (item.status === 'fail' ? 'is-fail' : (item.status === 'warn' ? 'is-warn' : 'is-pass')) +
          (openable ? ' is-clickable' : '') +
          (selectedCheckId === item.id ? ' is-selected' : '');
        return '<li class="' + rowClass + '"' + open + '><div>' + pill(item.status) +
          '</div><div><p class="check-name">' + escapeHtml(item.name) + '</p><p class="check-detail">' +
          escapeHtml(item.detail) + '</p>' + (openable ? '<p class="check-open-hint">Open details</p>' : '') + '</div></li>';
      }).join('');
      var chapterClass = chapter.status === 'fail' ? ' is-fail' : (chapter.status === 'warn' ? ' is-warn' : '');
      return '<article class="chapter table-panel' + chapterClass +
        '" id="' + chapterSlug(chapter.name) + '"><div class="chapter-head"><div><h3>' + escapeHtml(chapter.name) +
        '</h3><p class="chapter-summary">' + escapeHtml(chapterSummary(chapter, finishedAt)) + '</p></div>' +
        pill(chapter.status) + '</div><ul class="check-list">' + items + '</ul></article>';
    }).join('');

    if (!body && attentionOnly) {
      body = '<p class="panel-empty">No failed or stale checks' + (finishedAt ? '.' : ' yet.') + '</p>';
    } else {
      body = '<div class="chapter-grid">' + body + '</div>';
    }
    $('report').innerHTML = '<p class="' + bannerClass + '">' + escapeHtml(banner) + '</p>' + attention + body;
    if (selectedCheckId && findResult(selectedCheckId)) fillDetail(findResult(selectedCheckId));
  }

  function fillDetail(item) {
    if (!item) return;
    var title = $('checkDetailTitle');
    var sub = $('checkDetailSub');
    var body = $('checkDetailBody');
    if (title) title.textContent = item.name;
    if (sub) sub.textContent = item.chapter + ' · ' + item.dashboard;
    var attention = attentionResults();
    var idx = -1;
    attention.forEach(function (row, i) { if (row.id === item.id) idx = i; });
    var related = currentResults().filter(function (row) {
      return row.chapter === item.chapter && row.id !== item.id && needsAttention(row);
    });
    var relatedHtml = related.length
      ? '<ul class="detail-related">' + related.map(function (row) {
          return '<li><button type="button" data-open-check="' + escapeHtml(row.id) + '">' +
            escapeHtml(statusLabel(row.status) + ' · ' + row.name) + '</button></li>';
        }).join('') + '</ul>'
      : '<p class="detail-empty">No other Fail or Warn checks in this chapter.</p>';
    var nav = '';
    if (attention.length > 1 && idx >= 0) {
      nav = '<div class="detail-nav">' +
        '<button type="button" class="detail-nav-btn" data-fail-step="-1"' + (idx <= 0 ? ' disabled' : '') + '>Previous</button>' +
        '<span>' + (idx + 1) + ' of ' + attention.length + '</span>' +
        '<button type="button" class="detail-nav-btn" data-fail-step="1"' + (idx >= attention.length - 1 ? ' disabled' : '') + '>Next</button></div>';
    }
    var messageClass = 'detail-message' + (item.status === 'warn' ? ' is-warn' : (item.status === 'pass' ? ' is-pass' : ''));
    var messageBlock = item.error
      ? '<section class="detail-section"><h3>Query error</h3><pre class="detail-error">' +
        escapeHtml(item.detail || 'Unknown error.') + '</pre>' +
        '<button type="button" class="detail-copy-btn" id="btnCopyCheckDetail">Copy message</button></section>'
      : '<section class="detail-section"><h3>Message</h3><p class="' + messageClass + '">' +
        escapeHtml(item.detail || 'No message.') + '</p>' +
        '<button type="button" class="detail-copy-btn" id="btnCopyCheckDetail">Copy message</button></section>';
    if (body) {
      body.innerHTML =
        '<dl class="detail-dl">' +
        '<div><dt>Result</dt><dd>' + pill(item.status) + '</dd></div>' +
        '<div><dt>Chapter</dt><dd>' + escapeHtml(item.chapter) + '</dd></div>' +
        '<div><dt>Dataset</dt><dd>' + escapeHtml(datasetLabel(item.dataset)) +
          (item.dataset ? ' <span class="detail-muted">(' + escapeHtml(item.dataset) + ')</span>' : '') + '</dd></div>' +
        '</dl>' +
        (item.about ? '<section class="detail-section"><h3>What this checks</h3><p>' + escapeHtml(item.about) + '</p></section>' : '') +
        messageBlock +
        '<section class="detail-section"><h3>Other failures in this chapter</h3>' + relatedHtml + '</section>' +
        nav;
    }
  }

  function setDetailOpen(open, item) {
    var drawer = $('checkDetailDrawer');
    var overlay = $('checkDetailOverlay');
    if (!drawer) return;
    if (open && item) {
      selectedCheckId = item.id;
      fillDetail(item);
    } else if (!open) {
      selectedCheckId = null;
    }
    drawer.classList.toggle('is-open', !!open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (overlay) {
      overlay.classList.toggle('is-open', !!open);
      overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    document.body.classList.toggle('detail-open', !!open);
    if (open) {
      var closeBtn = $('btnCloseCheckDetail');
      if (closeBtn) closeBtn.focus();
    }
    document.querySelectorAll('[data-open-check]').forEach(function (el) {
      el.classList.toggle('is-selected', el.getAttribute('data-open-check') === selectedCheckId);
    });
  }

  function openCheck(id) {
    var item = findResult(id);
    if (!item) return;
    setDetailOpen(true, item);
  }

  function stepFailure(dir) {
    var attention = attentionResults();
    if (!attention.length) return;
    var idx = 0;
    attention.forEach(function (row, i) { if (row.id === selectedCheckId) idx = i; });
    idx = Math.max(0, Math.min(attention.length - 1, idx + dir));
    openCheck(attention[idx].id);
  }

  function flashCopy(id, doneLabel, restLabel) {
    var btn = $(id);
    if (!btn) return;
    btn.textContent = doneLabel;
    setTimeout(function () { if (btn) btn.textContent = restLabel; }, 1200);
  }

  function copyDetail() {
    var item = findResult(selectedCheckId);
    if (!item || !item.detail || !navigator.clipboard) return;
    navigator.clipboard.writeText(item.chapter + ' — ' + item.name + '\n' + item.detail).then(function () {
      flashCopy('btnCopyCheckDetail', 'Copied', 'Copy message');
    }).catch(function () { /* ignore */ });
  }

  function copyFailures() {
    var rows = attentionResults();
    if (!rows.length || !navigator.clipboard) return;
    var text = rows.map(function (item) {
      return statusLabel(item.status).toUpperCase() + ' · ' + item.chapter + ' — ' + item.name + '\n' + item.detail;
    }).join('\n\n');
    navigator.clipboard.writeText(text).then(function () {
      flashCopy('btnCopyFailures', 'Copied', 'Copy failures');
    }).catch(function () { /* ignore */ });
  }

  function runAll() {
    if (running) return;
    if ((typeof domo === 'undefined' || !domo.post) && !window.__PAGES_DEMO__) {
      setStatus('Open this card in Domo to run checks.');
      return;
    }
    running = true;
    lastReport = null;
    latestResults = [];
    selectedCheckId = null;
    setDetailOpen(false);
    $('runChecks').disabled = true;
    $('btnExportReport').disabled = true;
    var slots = new Array(CHECKS.length);
    var nextIndex = 0;
    var inflight = 0;
    var completed = 0;
    var started = Date.now();

    function orderedResults() {
      return slots.filter(function (item) { return !!item; });
    }

    function finish() {
      running = false;
      $('runChecks').disabled = false;
      hideProgress();
      var results = orderedResults();
      var seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      var failed = results.filter(function (item) { return item.status === 'fail'; }).length;
      var warned = results.filter(function (item) { return item.status === 'warn'; }).length;
      if (failed) {
        setStatus(failed + ' checks failed' + (warned ? ', ' + warned + ' warnings' : '') + ' in ' + seconds + 's.');
      } else if (warned) {
        setStatus(warned + ' warnings, no failures in ' + seconds + 's.');
      } else {
        setStatus('All ' + results.length + ' checks passed in ' + seconds + 's.');
      }
      render(results, new Date());
    }

    function startOne(position) {
      var spec = CHECKS[position];
      var label = spec.chapter + ' — ' + spec.name;
      inflight += 1;
      setStatus('Running ' + label + ' (' + (position + 1) + ' of ' + CHECKS.length + ')');
      showProgress(completed, CHECKS.length, label);
      Promise.resolve().then(spec.run).then(function (outcome) {
        slots[position] = resultFromSpec(spec, outcome);
      }).catch(function (err) {
        slots[position] = resultFromSpec(spec, { status: 'fail', detail: errMessage(err), error: true });
      }).then(function () {
        inflight -= 1;
        completed += 1;
        showProgress(completed, CHECKS.length, label);
        render(orderedResults(), null);
        pump();
      });
    }

    function pump() {
      if (completed >= CHECKS.length && inflight === 0) {
        finish();
        return;
      }
      while (inflight < CONCURRENCY && nextIndex < CHECKS.length) {
        var position = nextIndex;
        nextIndex += 1;
        startOne(position);
      }
    }

    setStatus('Running checks…');
    showProgress(0, CHECKS.length, 'Starting checks…');
    render([], null);
    pump();
  }

  function applyTheme(mode) {
    var theme = mode;
    if (mode === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      try { localStorage.removeItem('3e-dashboard-theme'); } catch (e) { /* ignore */ }
    } else {
      try { localStorage.setItem('3e-dashboard-theme', mode); } catch (e) { /* ignore */ }
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-toggle-btn').forEach(function (btn) {
      var on = btn.getAttribute('data-theme-set') === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function exportCell(value) {
    return escapeHtml(String(value == null ? '' : value)).replace(/\n/g, '<br>');
  }

  function exportTable(headers, rows) {
    var head = '<tr>' + headers.map(function (h) { return '<th>' + escapeHtml(h) + '</th>'; }).join('') + '</tr>';
    var body = rows.map(function (row) {
      return '<tr>' + row.map(function (cell) { return '<td>' + exportCell(cell) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<table>' + head + body + '</table>';
  }

  function exportReport() {
    if (!lastReport || !lastReport.results.length) return;
    var groups = groupResults(lastReport.results);
    var when = lastReport.finishedAt.toLocaleString('en-US');
    var failed = lastReport.results.filter(function (item) { return item.status === 'fail'; });
    var warned = lastReport.results.filter(function (item) { return item.status === 'warn'; });
    var rows = [];
    var failRows = [];
    groups.forEach(function (dash) {
      dash.chapters.forEach(function (chapter) {
        chapter.checks.forEach(function (item) {
          var line = [
            dash.name,
            statusLabel(dash.status),
            chapter.name,
            statusLabel(chapter.status),
            item.name,
            statusLabel(item.status),
            item.detail || ''
          ];
          rows.push(line);
          if (needsAttention(item)) failRows.push(line);
        });
      });
    });
    var headers = ['Dashboard', 'Dashboard result', 'Chapter', 'Chapter result', 'Check', 'Result', 'Message'];
    var html = '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">' +
      '<style>body{font-family:Segoe UI,sans-serif;color:#1a1a1a} h1{font-size:18px} h2{font-size:14px;margin-top:22px} p{font-size:12px;color:#444} table{border-collapse:collapse;width:100%} th{background:#ffd100;text-align:left;padding:6px 8px;font-size:11px} td{border-top:1px solid #e5e7eb;padding:6px 8px;font-size:11px;vertical-align:top;mso-number-format:"\\@"} td:last-child{white-space:pre-wrap}</style></head><body>' +
      '<h1>Operations QA</h1><p>3E Operations · ' + escapeHtml(when) + ' · ' + failed.length + ' failed, ' + warned.length + ' warnings, of ' + lastReport.results.length + ' checks. The Message column is the exact check text.</p>' +
      '<h2>Needs attention</h2>' + (failRows.length ? exportTable(headers, failRows) : '<p>No failed or stale checks.</p>') +
      '<h2>Full report</h2>' + exportTable(headers, rows) +
      '</body></html>';
    var stamp = lastReport.finishedAt.toISOString().slice(0, 16).replace(/[:T]/g, '-');
    var blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'operations-qa-report-' + stamp + '.xls';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function bind() {
    $('runChecks').addEventListener('click', runAll);
    $('btnExportReport').addEventListener('click', exportReport);
    if ($('btnCopyFailures')) $('btnCopyFailures').addEventListener('click', copyFailures);
    if ($('btnCloseCheckDetail')) $('btnCloseCheckDetail').addEventListener('click', function () { setDetailOpen(false); });
    if ($('checkDetailOverlay')) $('checkDetailOverlay').addEventListener('click', function () { setDetailOpen(false); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      var drawer = $('checkDetailDrawer');
      if (drawer && drawer.classList.contains('is-open')) setDetailOpen(false);
    });
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || typeof t.closest !== 'function') return;
      var openBtn = t.closest('[data-open-check]');
      if (openBtn) {
        ev.preventDefault();
        openCheck(openBtn.getAttribute('data-open-check'));
        return;
      }
      var jumpBtn = t.closest('[data-jump-chapter]');
      if (jumpBtn) {
        ev.preventDefault();
        jumpChapter(jumpBtn.getAttribute('data-jump-chapter'));
        return;
      }
      var stepBtn = t.closest('[data-fail-step]');
      if (stepBtn && !stepBtn.disabled) {
        stepFailure(Number(stepBtn.getAttribute('data-fail-step')));
        return;
      }
      if (t.id === 'btnCopyCheckDetail' || (t.closest && t.closest('#btnCopyCheckDetail'))) {
        copyDetail();
      }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var t = ev.target;
      if (!t || typeof t.closest !== 'function') return;
      var row = t.closest('[data-open-check]');
      if (!row) return;
      ev.preventDefault();
      openCheck(row.getAttribute('data-open-check'));
    });
    document.querySelectorAll('[data-report-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        attentionOnly = btn.getAttribute('data-report-filter') === 'attention';
        document.querySelectorAll('[data-report-filter]').forEach(function (peer) {
          var on = peer === btn;
          peer.classList.toggle('is-active', on);
          peer.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        if (latestResults.length) render(latestResults, running ? null : (lastReport && lastReport.finishedAt));
        else if (lastReport) render(lastReport.results, lastReport.finishedAt);
      });
    });
    document.querySelectorAll('.theme-toggle-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(btn.getAttribute('data-theme-set'));
      });
    });
    var saved = null;
    try { saved = localStorage.getItem('3e-dashboard-theme'); } catch (e) { /* ignore */ }
    applyTheme(saved === 'light' || saved === 'dark' ? saved : 'system');
    render([], null);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
