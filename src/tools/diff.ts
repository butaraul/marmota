/** Line-based unified diff, hand-rolled to keep the project dependency-free. */

type Op =
  | { type: 'equal'; oldLine: string; newLine: string }
  | { type: 'delete'; oldLine: string }
  | { type: 'insert'; newLine: string };

const MAX_DIFF_CELLS = 4_000_000; // bounds the O(n*m) LCS table for huge files

export function unifiedDiff(oldText: string, newText: string, contextLines = 3): string {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  if (oldLines.length * newLines.length > MAX_DIFF_CELLS) {
    return (
      `(file too large to diff in full: ${oldLines.length} -> ${newLines.length} lines; showing new content instead)\n` +
      firstLines(newText, 20)
    );
  }

  const hunks = buildHunks(computeOps(oldLines, newLines), contextLines);
  return hunks.length > 0 ? hunks.join('\n') : '(no changes)';
}

export function firstLines(text: string, count: number): string {
  return splitLines(text).slice(0, count).join('\n');
}

function splitLines(text: string): string[] {
  return text.length > 0 ? text.split('\n') : [];
}

function computeOps(oldLines: string[], newLines: string[]): Op[] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  const cell = (i: number, j: number): number => dp[i]![j]!;

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = oldLines[i] === newLines[j] ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1));
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'equal', oldLine: oldLines[i]!, newLine: newLines[j]! });
      i++;
      j++;
    } else if (cell(i + 1, j) >= cell(i, j + 1)) {
      ops.push({ type: 'delete', oldLine: oldLines[i]! });
      i++;
    } else {
      ops.push({ type: 'insert', newLine: newLines[j]! });
      j++;
    }
  }
  while (i < m) {
    ops.push({ type: 'delete', oldLine: oldLines[i]! });
    i++;
  }
  while (j < n) {
    ops.push({ type: 'insert', newLine: newLines[j]! });
    j++;
  }
  return ops;
}

function buildHunks(ops: Op[], contextLines: number): string[] {
  const changedIndices = ops.map((op, idx) => (op.type === 'equal' ? -1 : idx)).filter((idx) => idx !== -1);
  if (changedIndices.length === 0) return [];

  const groups: Array<[number, number]> = [];
  let start = changedIndices[0]!;
  let end = start;
  for (const idx of changedIndices.slice(1)) {
    if (idx - end <= contextLines * 2) {
      end = idx;
    } else {
      groups.push([start, end]);
      start = idx;
      end = idx;
    }
  }
  groups.push([start, end]);

  const oldStart: number[] = [];
  const newStart: number[] = [];
  let oldLineNo = 1;
  let newLineNo = 1;
  for (const op of ops) {
    oldStart.push(oldLineNo);
    newStart.push(newLineNo);
    if (op.type === 'equal') {
      oldLineNo++;
      newLineNo++;
    } else if (op.type === 'delete') {
      oldLineNo++;
    } else {
      newLineNo++;
    }
  }

  return groups.map(([groupStart, groupEnd]) => {
    const from = Math.max(0, groupStart - contextLines);
    const to = Math.min(ops.length - 1, groupEnd + contextLines);

    const lines: string[] = [];
    let oldCount = 0;
    let newCount = 0;
    for (let k = from; k <= to; k++) {
      const op = ops[k]!;
      if (op.type === 'equal') {
        lines.push(` ${op.oldLine}`);
        oldCount++;
        newCount++;
      } else if (op.type === 'delete') {
        lines.push(`-${op.oldLine}`);
        oldCount++;
      } else {
        lines.push(`+${op.newLine}`);
        newCount++;
      }
    }

    return `@@ -${oldStart[from]},${oldCount} +${newStart[from]},${newCount} @@\n${lines.join('\n')}`;
  });
}
