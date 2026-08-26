/**
 * Minimal CSV parser (RFC4180-ish): commas, quoted fields, "" escapes.
 */
export function parseCsv(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const lines = splitLines(text.trim());
  if (!lines.length) return { headers: [], rows: [] };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = (cells[c] ?? "").trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

function splitLines(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.length) out.push(cur);
  return out;
}

function parseLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

export function toCsv(headers: string[], rows: Array<Record<string, string | number | null | undefined>>): string {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}
