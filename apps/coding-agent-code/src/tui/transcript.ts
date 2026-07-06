import chalk from 'chalk';

export type Block =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; args: string; result?: string; status: 'running' | 'done' }
  | { kind: 'notice'; text: string };

/**
 * The scrollback model: an ordered list of blocks. `appendAssistant` streams
 * into the open assistant block; `completeTool` fills in the last running tool.
 * No terminal knowledge lives here — that's what makes it unit-testable.
 */
export class Transcript {
  private blocks: Block[] = [];
  private open: Extract<Block, { kind: 'assistant' }> | undefined;

  addUser(text: string): void {
    this.blocks.push({ kind: 'user', text });
    this.open = undefined;
  }

  appendAssistant(delta: string): void {
    if (this.open === undefined) {
      this.open = { kind: 'assistant', text: '' };
      this.blocks.push(this.open);
    }
    this.open.text += delta;
  }

  /** The assistant message is complete; the next delta starts a fresh block. */
  endAssistant(): void {
    this.open = undefined;
  }

  addTool(name: string, args: string): void {
    this.blocks.push({ kind: 'tool', name, args, status: 'running' });
    this.open = undefined;
  }

  completeTool(result: string): void {
    const tool = this.lastRunningTool();
    if (tool !== undefined) {
      tool.status = 'done';
      tool.result = result;
    }
  }

  addNotice(text: string): void {
    this.blocks.push({ kind: 'notice', text });
    this.open = undefined;
  }

  get all(): readonly Block[] {
    return this.blocks;
  }

  private lastRunningTool(): Extract<Block, { kind: 'tool' }> | undefined {
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const block = this.blocks[i];
      if (block?.kind === 'tool' && block.status === 'running') return block;
    }
    return undefined;
  }
}

/** Hard-wrap text to a width, preserving explicit newlines. Pure — testable. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length <= width) {
      out.push(paragraph);
      continue;
    }
    for (let i = 0; i < paragraph.length; i += width) {
      out.push(paragraph.slice(i, i + width));
    }
  }
  return out;
}

/** A block rendered as styled, wrapped lines: prefix the first, indent the rest. */
function renderBlock(
  prefix: string,
  text: string,
  width: number,
  color: (s: string) => string,
): string[] {
  const indent = ' '.repeat(prefix.length);
  const wrapped = wrap(text, Math.max(1, width - prefix.length));
  return wrapped.map((line, i) => color((i === 0 ? prefix : indent) + line));
}

/** Turn the block list into terminal lines. Styling is applied here, not stored. */
export function renderTranscript(blocks: readonly Block[], width: number): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case 'user':
        lines.push(...renderBlock('❯ ', block.text, width, chalk.cyan));
        break;
      case 'assistant':
        lines.push(...renderBlock('', block.text, width, (s) => s));
        break;
      case 'tool': {
        const preview = block.args.length > 80 ? `${block.args.slice(0, 80)}…` : block.args;
        const mark = block.status === 'running' ? chalk.yellow('⏺') : chalk.green('⏺');
        lines.push(chalk.dim(`${mark} ${block.name}(${preview})`));
        if (block.result !== undefined) {
          const firstLine = block.result.split('\n')[0] ?? '';
          lines.push(chalk.dim(`  ↳ ${firstLine.slice(0, width - 4)}`));
        }
        break;
      }
      case 'notice':
        lines.push(...renderBlock('', block.text, width, chalk.dim));
        break;
    }
    lines.push(''); // one blank line between blocks
  }
  return lines;
}
