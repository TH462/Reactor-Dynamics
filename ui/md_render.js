/*
 * ui/md_render.js — tiny GFM-ish markdown renderer (→ RD.mdToHtml) for the
 * packed Manuals/*.md operator set. Covers exactly what the manuals use:
 * headings, pipe tables, lists (nested), bold/italic/inline code, code fences,
 * blockquotes, horizontal rules, hard line breaks (trailing double space), and
 * links. All raw HTML in the source is escaped — the manuals are plain
 * markdown, and this keeps injected text inert. Links to *.md files become
 * in-manual navigation (`data-doc`); http(s) links open in a new tab.
 */
;(function (RD) {
  'use strict';

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, function (m, c) { return '<code>' + c + '</code>'; });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/(^|[\s(&>])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, u) {
      if (/\.md$/i.test(u)) return '<a href="#" class="mdoc-doclink" data-doc="' + esc(u.replace(/^\.\//, '')) + '">' + t + '</a>';
      if (/^https?:/i.test(u)) return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + t + '</a>';
      return t;
    });
    return s;
  }

  function splitRow(ln) {
    return ln.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
  }

  RD.mdToHtml = function (md) {
    var lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
    var out = [], para = [], lists = [], i = 0, m;

    function flushPara() {
      if (!para.length) return;
      var html = '';
      for (var k = 0; k < para.length; k++) {
        html += inline(para[k].replace(/\s+$/, ''));
        if (k < para.length - 1) html += /\s{2,}$/.test(para[k]) ? '<br>' : ' ';
      }
      out.push('<p>' + html + '</p>');
      para = [];
    }
    function closeLists() { while (lists.length) out.push('</' + lists.pop().type + '>'); }

    while (i < lines.length) {
      var ln = lines[i];

      if (/^```/.test(ln)) {                                   // fenced code
        flushPara(); closeLists();
        var code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++;
        out.push('<pre class="mdoc-code">' + esc(code.join('\n')) + '</pre>');
        continue;
      }

      if (/^\s*\|/.test(ln) && i + 1 < lines.length &&          // pipe table
          /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].indexOf('-') !== -1) {
        flushPara(); closeLists();
        var hdr = splitRow(ln); i += 2;
        var t = '<div class="mdoc-tw"><table><thead><tr>' +
          hdr.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        while (i < lines.length && /^\s*\|/.test(lines[i])) {
          t += '<tr>' + splitRow(lines[i]).map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
          i++;
        }
        out.push(t + '</tbody></table></div>');
        continue;
      }

      m = /^(#{1,6})\s+(.*)$/.exec(ln);                         // heading
      if (m) {
        flushPara(); closeLists();
        var lvl = m[1].length;
        out.push('<h' + lvl + '>' + inline(m[2].replace(/\s*#+\s*$/, '')) + '</h' + lvl + '>');
        i++; continue;
      }

      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(ln)) {          // horizontal rule
        flushPara(); closeLists();
        out.push('<hr>');
        i++; continue;
      }

      if (/^\s*>\s?/.test(ln)) {                                // blockquote
        flushPara(); closeLists();
        var bq = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { bq.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote>' + RD.mdToHtml(bq.join('\n')) + '</blockquote>');
        continue;
      }

      m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(ln);             // list item
      if (m) {
        flushPara();
        var indent = m[1].length, type = /^[-*+]$/.test(m[2]) ? 'ul' : 'ol';
        while (lists.length && lists[lists.length - 1].indent > indent) out.push('</' + lists.pop().type + '>');
        if (lists.length && lists[lists.length - 1].indent === indent && lists[lists.length - 1].type !== type) {
          out.push('</' + lists.pop().type + '>');
        }
        if (!lists.length || lists[lists.length - 1].indent < indent) {
          lists.push({ type: type, indent: indent });
          out.push('<' + type + '>');
        }
        out.push('<li>' + inline(m[3]) + '</li>');
        i++; continue;
      }

      if (/^\s*$/.test(ln)) { flushPara(); closeLists(); i++; continue; }

      para.push(ln); i++;                                       // paragraph text
    }
    flushPara(); closeLists();
    return out.join('\n');
  };

})(globalThis.RD || (globalThis.RD = {}));
