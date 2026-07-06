/**
 * A single-line input buffer with a cursor. Pure state, no I/O — feed it keys,
 * read `value`/`cursor`. The coordinator decides which keystroke calls which
 * method; the Screen decides how to paint it. This just holds the text.
 */
export class Editor {
  // A code-point array (not a string) so multi-byte characters edit as one unit.
  private chars: string[] = [];
  private pos = 0;

  get value(): string {
    return this.chars.join('');
  }

  get cursor(): number {
    return this.pos;
  }

  insert(text: string): void {
    const glyphs = [...text];
    this.chars.splice(this.pos, 0, ...glyphs);
    this.pos += glyphs.length;
  }

  backspace(): void {
    if (this.pos === 0) return;
    this.chars.splice(this.pos - 1, 1);
    this.pos -= 1;
  }

  left(): void {
    if (this.pos > 0) this.pos -= 1;
  }

  right(): void {
    if (this.pos < this.chars.length) this.pos += 1;
  }

  home(): void {
    this.pos = 0;
  }

  end(): void {
    this.pos = this.chars.length;
  }

  clear(): void {
    this.chars = [];
    this.pos = 0;
  }
}
