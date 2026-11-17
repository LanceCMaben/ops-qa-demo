/* Minimal in-browser SQL for GitHub Pages demos (SELECT / WHERE / GROUP BY / ORDER BY / LIMIT). */
(function (global) {
  'use strict';

  var tables = {};

  function registerTable(alias, rows) {
    tables[String(alias).toLowerCase()] = (rows || []).map(upperKeys);
  }

  function upperKeys(row) {
    var out = {};
    Object.keys(row || {}).forEach(function (k) { out[k.toUpperCase()] = row[k]; });
    return out;
  }

  function cell(row, col) { return row[String(col).toUpperCase()]; }

  function parseAlias(sql) {
    var m = sql.match(/\bFROM\s+([a-zA-Z_][\w]*)/i);
    return m ? m[1].toLowerCase() : '';
  }

  function splitSelect(sql) {
    var m = sql.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+/i);
    return m ? m[1].trim() : '*';
  }

  function parseWhere(sql) {
    var m = sql.match(/\bWHERE\s+([\s\S]+?)(\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT\s+|\s*$)/i);
    return m ? m[1].trim() : '';
  }

  function parseGroupBy(sql) {
    var m = sql.match(/\bGROUP\s+BY\s+([\s\S]+?)(\s+ORDER\s+BY|\s+LIMIT\s+|\s*$)/i);
    if (!m) return [];
    return m[1].split(',').map(function (s) { return s.trim(); });
  }

  function parseOrderBy(sql) {
    var m = sql.match(/\bORDER\s+BY\s+([\s\S]+?)(\s+LIMIT\s+|\s*$)/i);
    if (!m) return null;
    var parts = m[1].split(',').map(function (p) {
      var bits = p.trim().split(/\s+/);
      return { col: bits[0], desc: /^DESC$/i.test(bits[1] || '') };
    });
    return parts;
  }

  function parseLimit(sql) {
    var m = sql.match(/\bLIMIT\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function evalCond(row, expr) {
    expr = expr.trim();
    if (!expr) return true;
    if (/^NOT\s+/i.test(expr)) return !evalCond(row, expr.replace(/^NOT\s+/i, ''));
    var andParts = splitTop(expr, 'AND');
    if (andParts.length > 1) return andParts.every(function (p) { return evalCond(row, p); });
    var orParts = splitTop(expr, 'OR');
    if (orParts.length > 1) return orParts.some(function (p) { return evalCond(row, p); });

    if (/^NOT\s*\(/i.test(expr)) {
      var inner = expr.replace(/^NOT\s*\(/i, '').replace(/\)\s*$/, '');
      return !evalCond(row, inner);
    }

    if (/\bIS\s+NOT\s+NULL\b/i.test(expr)) {
      var c1 = expr.split(/\s+IS\s+NOT\s+NULL/i)[0].trim();
      return cell(row, c1) != null && cell(row, c1) !== '';
    }
    if (/\bIS\s+NULL\b/i.test(expr)) {
      var c0 = expr.split(/\s+IS\s+NULL/i)[0].trim();
      return cell(row, c0) == null || cell(row, c0) === '';
    }

    var inM = expr.match(/^(.+?)\s+IN\s*\(([^)]+)\)\s*$/i);
    if (inM) {
      var colIn = inM[1].trim();
      var vals = inM[2].split(',').map(unquote);
      var v = String(cell(row, colIn) == null ? '' : cell(row, colIn));
      return vals.some(function (x) { return v === x; });
    }

    var likeM = expr.match(/^(.+?)\s+LIKE\s+'([^']*)'/i);
    if (likeM) {
      var pat = likeM[2].replace(/%/g, '.*').replace(/_/g, '.');
      return new RegExp('^' + pat + '$', 'i').test(String(cell(row, likeM[1].trim()) || ''));
    }

    var fnLike = expr.match(/^UPPER\s*\(\s*([^)]+)\s*\)\s+LIKE\s+'([^']*)'/i);
    if (fnLike) {
      var pat2 = fnLike[2].replace(/%/g, '.*');
      return new RegExp(pat2, 'i').test(String(cell(row, fnLike[1].trim()) || '').toUpperCase());
    }

    var eqM = expr.match(/^(.+?)\s*=\s*'([^']*)'\s*$/);
    if (eqM) return String(cell(row, eqM[1].trim()) || '') === eqM[2];

    var neM = expr.match(/^(.+?)\s*<>\s*'([^']*)'\s*$/);
    if (neM) return String(cell(row, neM[1].trim()) || '') !== neM[2];

    var lowM = expr.match(/^LOWER\s*\(\s*SUBSTRING\s*\(\s*([^,]+)\s*,\s*\d+\s*,\s*\d+\s*\)\s*\)\s*<>\s*'([^']*)'/i);
    if (lowM) {
      var part = String(cell(row, lowM[1].trim()) || '').toLowerCase();
      return part.slice(0, 2) !== lowM[2].toLowerCase();
    }

    return true;
  }

  function splitTop(expr, sep) {
    var parts = [];
    var depth = 0;
    var buf = '';
    var tokens = expr.split(/\s+/);
    var i = 0;
  }

  function splitAnd(expr) {
    var parts = [];
    var depth = 0;
    var current = '';
    for (var i = 0; i < expr.length; i++) {
      var ch = expr[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 0 && expr.slice(i, i + 5).toUpperCase() === ' AND ') {
        parts.push(current.trim());
        current = '';
        i += 4;
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts.length ? parts : [expr];
  }

  function splitTop(expr, sep) { return sep === 'AND' ? splitAnd(expr) : [expr]; }

  function unquote(s) {
    s = s.trim();
    if (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") return s.slice(1, -1);
    return s;
  }

  function project(select, row) {
    if (select === '*') return Object.assign({}, row);
    var out = {};
    select.split(',').forEach(function (part) {
      part = part.trim();
      var asM = part.match(/^(.+?)\s+AS\s+([A-Z0-9_]+)$/i);
      var expr = asM ? asM[1].trim() : part;
      var alias = asM ? asM[2].toUpperCase() : expr.toUpperCase();
      if (/^\d+\s+AS\s+/i.test(part) || expr === '1') {
        out[alias] = 1;
        return;
      }
      if (/COUNT\s*\(\s*\*\s*\)/i.test(expr)) {
        out[alias] = 1;
        return;
      }
      out[alias] = cell(row, expr);
    });
    return out;
  }

  function aggregate(groupCols, select, rows) {
    var map = {};
    rows.forEach(function (row) {
      var key = groupCols.map(function (c) { return String(cell(row, c)); }).join('\u0001');
      if (!map[key]) map[key] = { sample: row, list: [] };
      map[key].list.push(row);
    });
    var out = [];
    Object.keys(map).forEach(function (key) {
      var bucket = map[key];
      var base = {};
      groupCols.forEach(function (c) { base[c.toUpperCase()] = cell(bucket.sample, c); });
      var sel = select.toUpperCase();
      if (/COUNT\s*\(\s*DISTINCT\s+([A-Z_]+)\s*\)/i.test(sel)) {
        var col = sel.match(/COUNT\s*\(\s*DISTINCT\s+([A-Z_]+)\s*\)/i)[1];
        var set = {};
        bucket.list.forEach(function (r) { set[String(cell(r, col))] = true; });
        base.N = Object.keys(set).length;
      } else if (/COUNT\s*\(\s*\*\s*\)/i.test(sel)) {
        base.N = bucket.list.length;
      } else if (/SUM\s*\(\s*([A-Z_]+)\s*\)/i.test(sel)) {
        var sc = sel.match(/SUM\s*\(\s*([A-Z_]+)\s*\)/i)[1];
        base.N = bucket.list.reduce(function (s, r) { return s + (Number(cell(r, sc)) || 0); }, 0);
      } else if (/MAX\s*\(\s*([A-Z_]+)\s*\)/i.test(sel)) {
        var mc = sel.match(/MAX\s*\(\s*([A-Z_]+)\s*\)/i)[1];
        base.V = bucket.list.reduce(function (best, r) {
          var v = cell(r, mc);
          return best == null || String(v) > String(best) ? v : best;
        }, null);
        if (sel.indexOf(' AS V') !== -1) { /* keep V */ }
        else base[mc] = base.V;
      } else {
        groupCols.forEach(function (c) { base[c.toUpperCase()] = cell(bucket.sample, c); });
        if (sel.indexOf(' AS V') !== -1) base.V = cell(bucket.sample, groupCols[0]);
      }
      out.push(base);
    });
    return out;
  }

  function distinctValues(rows, col) {
    var set = {};
    var out = [];
    rows.forEach(function (r) {
      var v = cell(r, col);
      if (v == null || v === '') return;
      var s = String(v);
      if (set[s]) return;
      set[s] = true;
      var row = {};
      row.V = v;
      out.push(row);
    });
    return out;
  }

  function runSql(sql) {
    var alias = parseAlias(sql);
    var base = tables[alias] || [];
    var select = splitSelect(sql);
    var where = parseWhere(sql);
    var filtered = base.filter(function (row) { return evalCond(row, where); });
    var group = parseGroupBy(sql);
    var rows;
    if (group.length) {
      rows = aggregate(group, select, filtered);
      if (/AS\s+V\b/i.test(select) && group.length === 1) {
        rows = rows.map(function (r) { return { V: r[group[0].toUpperCase()] || r.V }; });
      }
    } else if (/^\s*SELECT\s+DISTINCT\s+/i.test(sql)) {
      var col = select.replace(/^DISTINCT\s+/i, '').replace(/\s+AS\s+\w+$/i, '').trim();
      rows = distinctValues(filtered, col);
    } else if (/COUNT\s*\(\s*DISTINCT/i.test(select) && !group.length) {
      var dc = select.match(/COUNT\s*\(\s*DISTINCT\s+([A-Z_]+)\s*\)/i);
      if (dc) {
        var set = {};
        filtered.forEach(function (r) { set[String(cell(r, dc[1]))] = true; });
        rows = [{ N: Object.keys(set).length }];
      } else rows = [{ N: filtered.length }];
    } else {
      rows = filtered.map(function (r) { return project(select, r); });
    }
    var order = parseOrderBy(sql);
    if (order) {
      rows.sort(function (a, b) {
        for (var i = 0; i < order.length; i++) {
          var av = cell(a, order[i].col);
          var bv = cell(b, order[i].col);
          if (av === bv) continue;
          var cmp = String(av) < String(bv) ? -1 : 1;
          return order[i].desc ? -cmp : cmp;
        }
        return 0;
      });
    }
    var limit = parseLimit(sql);
    if (limit != null) rows = rows.slice(0, limit);
    return rows;
  }

  function runForUrl(url, body) {
    var alias = '';
    var m = String(url).match(/\/sql\/v1\/([^/?]+)/i);
    if (m) alias = m[1].toLowerCase();
    if (!alias && body) alias = parseAlias(body);
    if (!tables[alias] && alias) return [];
    return runSql(body || 'SELECT * FROM ' + alias + ' LIMIT 1');
  }

  global.DemoSqlEngine = {
    registerTable: registerTable,
    runSql: runSql,
    runForUrl: runForUrl
  };
})(typeof window !== 'undefined' ? window : global);