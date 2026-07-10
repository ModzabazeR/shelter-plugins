export type Align = "left" | "center" | "right" | null;

export interface TableBlock {
  headers: string[];
  aligns: Align[];
  rows: string[][];
  startLine: number;
  endLine: number;
}

const DELIM_CELL = /^:?-+:?$/;

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  if (cells.length && cells[0].trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

function isDelimiterLine(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => DELIM_CELL.test(c));
}

function parseAligns(line: string): Align[] {
  return splitRow(line).map((c) => {
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

function fit(cells: string[], n: number): string[] {
  const out = cells.slice(0, n);
  while (out.length < n) out.push("");
  return out;
}

export function parseTables(text: string): TableBlock[] {
  const lines = text.split("\n");
  const blocks: TableBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = lines[i];
    const delim = lines[i + 1];
    const headerIsRow = header !== undefined && header.includes("|") && header.trim() !== "";
    if (headerIsRow && delim !== undefined && isDelimiterLine(delim)) {
      const aligns = parseAligns(delim);
      const ncol = aligns.length;
      const headerCells = splitRow(header);
      if (headerCells.length !== ncol) {
        i++;
        continue;
      }
      const headers = fit(headerCells, ncol);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim() !== "" && lines[j].includes("|")) {
        rows.push(fit(splitRow(lines[j]), ncol));
        j++;
      }
      blocks.push({ headers, aligns, rows, startLine: i, endLine: j - 1 });
      i = j;
    } else {
      i++;
    }
  }
  return blocks;
}
