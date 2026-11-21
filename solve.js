// solve.js — a fast drop-in for csv-reader 1.0.0 (make.fun csv-reader-speed-01-run-20261121).
//
// Written from scratch from the competition's RULES.txt specification. It
// reproduces csv-reader's broken-row policy exactly: a U+FEFF at the very start
// is dropped; a record ends at LF or CRLF and a line left with no characters is
// no record; outside quotes a CR not followed by LF is dropped (stray_cr); a
// field that opens with a quote runs to the next quote that is not doubled,
// "" inside it is one quote and each CRLF or lone CR inside it reads as LF;
// what follows its closing quote, up to the next comma or line break, is
// appended as it stands (quote_junk, when the field ends); a quote that never
// closes is a literal character and the text after it is read again as
// unquoted (unterminated_quote); a quote inside an unquoted field is literal;
// fields stay strings, never trimmed or converted; columns is the first record
// when header is true, else null; rows are padded with "" (short_row) or cut
// (long_row) to the first record's width; each error is {code, line, row} in
// the order met, line the 1-based line its record starts on.
//
// Speed strategy (fast-path + fallback): most records are read through a
// single slice + split(',') — a record whose text up to the next LF holds no
// quote and no stray CR can be split directly, which is what clean data
// (the bulk of every drawn set) costs. Anything else falls back to an
// indexOf/regex-driven state machine below, which jumps from delimiter to
// delimiter instead of walking one character at a time.

const LF = 10;
const CR = 13;
const COMMA = 44;
const QUOTE = 34;

// How a field ended: at a comma, at a line break, or at the end of the text.
const AT_COMMA = 0;
const AT_BREAK = 1;
const AT_END = 2;

/** The reading of one CSV input, {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  // The next delimiter of any kind inside an unquoted field, and the next
  // line break of any kind inside a quoted field. Regex exec stops at the
  // first match, so each scan is bounded by the distance to the next
  // delimiter instead of the rest of the text.
  const delimRe = /[,\r\n]/g;
  const breakRe = /[\r\n]/g;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function pushErr(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Returns the field and how
  // it ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    let chunk = pos; // start of the not-yet-copied span
    for (;;) {
      delimRe.lastIndex = pos;
      const m = delimRe.exec(text);
      if (m === null) {
        if (chunk < n) {
          value += text.slice(chunk, n);
          added += n - chunk;
        }
        pos = n;
        return { value, ended: AT_END, added };
      }
      const i = m.index;
      const c = m[0];
      if (c === ',') {
        if (i > chunk) {
          value += text.slice(chunk, i);
          added += i - chunk;
        }
        pos = i + 1;
        return { value, ended: AT_COMMA, added };
      }
      if (c === '\n') {
        if (i > chunk) {
          value += text.slice(chunk, i);
          added += i - chunk;
        }
        pos = i + 1;
        line += 1;
        return { value, ended: AT_BREAK, added };
      }
      // A CR: a line break when followed by LF, else a dropped stray CR.
      if (text.charCodeAt(i + 1) === LF) {
        if (i > chunk) {
          value += text.slice(chunk, i);
          added += i - chunk;
        }
        pos = i + 2;
        line += 1;
        return { value, ended: AT_BREAK, added };
      }
      if (i > chunk) {
        value += text.slice(chunk, i);
        added += i - chunk;
      }
      pushErr('stray_cr');
      pos = i + 1;
      chunk = pos;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    let seg = pos; // start of the not-yet-copied span inside the quotes
    for (;;) {
      const q = text.indexOf('"', pos);
      const end = q === -1 ? n : q;
      // Fold every CR or LF inside [pos, end): each becomes one LF in the
      // value, and each counts as a line.
      let i = pos;
      for (;;) {
        breakRe.lastIndex = i;
        const m = breakRe.exec(text);
        if (m === null || m.index >= end) break;
        const b = m.index;
        if (b > seg) value += text.slice(seg, b);
        value += '\n';
        line += 1;
        i = b + 1;
        if (text.charCodeAt(b) === CR && text.charCodeAt(i) === LF) i += 1;
        seg = i;
      }
      if (end > seg) value += text.slice(seg, end);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        pushErr('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === QUOTE) {
        // A doubled quote is one quote inside the field.
        value += '"';
        pos = q + 2;
        seg = pos;
        continue;
      }
      pos = q + 1;
      if (pos >= n) return { value, ended: AT_END };
      const c = text.charCodeAt(pos);
      if (c === COMMA) {
        pos += 1;
        return { value, ended: AT_COMMA };
      }
      if (c === LF) {
        pos += 1;
        line += 1;
        return { value, ended: AT_BREAK };
      }
      if (c === CR && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
        return { value, ended: AT_BREAK };
      }
      // What follows the closing quote is appended as it stands, up to the next comma or line break.
      const junk = readUnquoted(value);
      if (junk.added > 0) pushErr('quote_junk');
      return junk;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos += 1;
        line += 1;
      } else if (c === CR && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record's text up to the next LF holds no quote and no
    // stray CR, so it can be split directly. The segment is sliced once and
    // reused for the checks and the split, so the quote/CR scans stay
    // bounded by this record instead of running to the end of the text.
    const nl = text.indexOf('\n', pos);
    const segEnd = nl === -1 ? n : nl;
    const seg = text.slice(pos, segEnd);
    let fields = null;
    if (seg.indexOf('"') === -1) {
      const r = seg.indexOf('\r');
      if (r === -1) {
        fields = seg.split(',');
        pos = nl === -1 ? n : nl + 1;
        line += 1;
      } else if (r === seg.length - 1 && nl !== -1) {
        // The only CR is the CRLF line break at the segment's end.
        fields = seg.slice(0, -1).split(',');
        pos = nl + 1;
        line += 1;
      }
    }
    if (fields === null) {
      // Fallback: field by field through the state machine.
      fields = [];
      let ended;
      let quoted = false;
      do {
        quoted = text.charCodeAt(pos) === QUOTE;
        const f = quoted ? readQuoted() : readUnquoted('');
        ended = f.ended;
        fields.push(f.value);
      } while (ended === AT_COMMA);

      // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
      if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    } else if (fields.length === 1 && fields[0] === '') {
      // A lone empty field on the fast path: an empty line, no record.
      continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
