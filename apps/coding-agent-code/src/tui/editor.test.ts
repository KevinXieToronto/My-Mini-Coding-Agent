import { describe, expect, it } from 'vitest';

import { Editor } from '#tui/editor';

describe('Editor', () => {
  it('inserts characters and tracks the cursor', () => {
    const editor = new Editor();
    editor.insert('abc');
    expect(editor.value).toBe('abc');
    expect(editor.cursor).toBe(3);
  });

  it('backspaces at the cursor, not the end', () => {
    const editor = new Editor();
    editor.insert('abc');
    editor.left();
    editor.backspace(); // removes 'b'
    expect(editor.value).toBe('ac');
    expect(editor.cursor).toBe(1);
  });

  it('clamps cursor movement and clears', () => {
    const editor = new Editor();
    editor.insert('hi');
    editor.right(); // already at end — no-op
    expect(editor.cursor).toBe(2);
    editor.home();
    editor.left(); // already at start — no-op
    expect(editor.cursor).toBe(0);
    editor.clear();
    expect(editor.value).toBe('');
  });
});
