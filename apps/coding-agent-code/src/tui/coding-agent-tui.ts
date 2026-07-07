import {
  addUsage,
  connectMcpServer,
  costOf,
  createAgentHarness,
  discoverCommands,
  discoverMemory,
  discoverSkills,
  emptyUsage,
  expandMentions,
  formatTokens,
  latestSession,
  listSessions,
  loadHarnessOptionsFromEnv,
  loadMcpConfig,
  loadSession,
  MODEL_PRICING,
  parseCommandLine,
  saveSession,
  substituteArgs,
} from '@kevin.xie.toronto/coding-agent-sdk';
import type {
  AgentEvents,
  AgentHarness,
  AgentHarnessOptions,
  McpConnection,
  SlashCommand,
  StoredSession,
  TokenUsage,
} from '@kevin.xie.toronto/coding-agent-sdk';
import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';

import chalk from 'chalk';

import type { ShellOptions } from '#cli/run-shell';
import { Editor } from '#tui/editor';
import { Screen } from '#tui/screen';
import type { Key } from '#tui/screen';
import {
  bashInputTag,
  bashOutputTag,
  formatBashOutputForDisplay,
  runBangCommand,
} from '#tui/shell';
import { Transcript, renderFrame, renderTranscript, transcriptFromHistory } from '#tui/transcript';
import { VERSION } from '#version';

/** Read-only tools never need approval. */
const AUTO_APPROVED = new Set(['read_file', 'list_dir']);
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const DOUBLE_CTRL_C_MS = 1500;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Connect every server in mcp.json and register its tools onto the harness,
 * reporting each result through `onLine` (a transcript notice in the TUI, a
 * console line in one-shot mode). Returns the connections so callers close them.
 */
async function registerMcpServers(
  harness: AgentHarness,
  onLine: (line: string) => void,
): Promise<{ connections: McpConnection[]; toolCount: number }> {
  const { mcpServers } = loadMcpConfig();
  const connections: McpConnection[] = [];
  let toolCount = 0;
  for (const [name, config] of Object.entries(mcpServers)) {
    try {
      const connection = await connectMcpServer(name, config);
      for (const tool of connection.tools) harness.registerTool(tool);
      connections.push(connection);
      toolCount += connection.tools.length;
      onLine(`⧉ mcp: ${name} — ${connection.tools.length} tool(s)`);
    } catch (error) {
      onLine(`⧉ mcp: ${name} failed — ${message(error)}`);
    }
  }
  return { connections, toolCount };
}

/** A pending on-screen permission prompt, waiting on a keystroke. */
interface Approval {
  name: string;
  preview: string;
  resolve: (approved: boolean) => void;
}

/** A command the app runs itself, vs a custom template that expands to a prompt. */
interface BuiltinCommand {
  name: string;
  description: string;
  run: (args: string) => void;
}

class CodingAgentTui {
  private readonly screen: Screen;
  private readonly harness: AgentHarness;
  private readonly transcript = new Transcript();
  private readonly editor = new Editor();
  private readonly sessionApproved = new Set<string>();
  private readonly mcpConnections: McpConnection[] = [];
  private readonly sessionId: string;
  private readonly createdAt: string;
  private readonly resume: StoredSession | undefined;
  /** The welcome-frame content, pinned as a fixed header (not scrollback). */
  private readonly banner: string[];
  private readonly commands: Map<string, SlashCommand>;   // custom (from .agent/commands)
  private readonly builtins: Map<string, BuiltinCommand>; // app-owned (/help, /clear, /exit)
  private readonly memorySources: string[];               // AGENTS.md files folded into the prompt

  private mcpToolCount = 0;
  private usage: TokenUsage = emptyUsage();
  private costUsd = 0;
  private running = false;
  private controller: AbortController | undefined;
  private approval: Approval | undefined;
  private spinnerTimer: ReturnType<typeof setInterval> | undefined;
  private spinnerFrame = 0;
  private lastSigint = 0;
  private renderQueued = false;
  private resolveDone: (() => void) | undefined;

  constructor(
    private readonly options: AgentHarnessOptions,
    commands: SlashCommand[] = [],
    resume?: StoredSession,
    memorySources: string[] = [],
  ) {
    this.harness = createAgentHarness(options, this.events());
    this.screen = new Screen(this.handleKey, this.scheduleRender);
    this.resume = resume;
    this.sessionId = resume?.id ?? `session_${randomUUID()}`;
    this.createdAt = resume?.createdAt ?? new Date().toISOString();
    this.banner = this.bannerLines();
    this.commands = new Map(commands.map((command) => [command.name, command]));
    this.builtins = this.builtinCommands();
    this.memorySources = memorySources;
  }

  /** Enter the alternate screen, connect MCP, and run until the user quits. */
  async start(): Promise<void> {
    const done = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
    this.screen.start();
    this.scheduleRender();

    const { connections, toolCount } = await registerMcpServers(this.harness, (line) => {
      this.transcript.addNotice(line);
      this.scheduleRender();
    });
    this.mcpConnections.push(...connections);
    this.mcpToolCount = toolCount;
    for (const skill of this.options.skills ?? []) {
      this.transcript.addNotice(`⚙ skill: ${skill.name} — ${skill.description}`);
    }
    for (const command of this.commands.values()) {
      this.transcript.addNotice(`⌘ command: /${command.name} — ${command.description}`);
    }
    for (const source of this.memorySources) {
      this.transcript.addNotice(`▣ memory: ${relative(process.cwd(), source)}`);
    }
    if (this.resume !== undefined) {
      this.transcript.load(transcriptFromHistory(this.resume.history));
      this.transcript.addNotice(`↺ resumed session ${this.sessionId}`);
    }
    this.scheduleRender();

    await done;
  }

  /** The welcome-frame content: geometric logo, greeting, and session context. */
  private bannerLines(): string[] {
    const model = this.harness.model;
    const field = (label: string, value: string): string =>
      `${`${label}:`.padEnd(10)} ${value}`;
    // Logo art (right-aligned triangle) padded to a fixed cell so the text
    // beside it lines up in one column.
    const logo = (art: string, text: string): string => `${art.padEnd(9)}${text}`;
    return [
      logo('  ◢◣', 'My Mini Code Agent'),
      logo(' ◢██◣', 'Welcome! Send /help for help information.'),
      logo('◢████◣', ''),
      field('Directory', process.cwd()),
      field('Session', this.sessionId),
      field('Model', model),
      field('Version', VERSION),
    ];
  }

  /** The app-owned commands. Custom commands (from .agent/commands) expand to a prompt instead. */
  private builtinCommands(): Map<string, BuiltinCommand> {
    const list: BuiltinCommand[] = [
      { name: 'help', description: 'List available commands', run: () => this.showHelp() },
      { name: 'clear', description: 'Clear the transcript', run: () => this.clearScreen() },
      { name: 'model', description: 'Show or switch the model', run: (args) => this.switchModel(args) },
      { name: 'cost', description: 'Show token usage and cost', run: () => this.showCost() },
      { name: 'exit', description: 'Quit the agent', run: () => this.quit() },
    ];
    return new Map(list.map((command) => [command.name, command]));
  }

  /** `/help`: list every command — built-ins and custom together — with its description. */
  private showHelp(): void {
    this.transcript.addNotice('Commands:');
    for (const command of this.builtins.values()) {
      this.transcript.addNotice(`  /${command.name} — ${command.description}`);
    }
    for (const command of this.commands.values()) {
      this.transcript.addNotice(`  /${command.name} — ${command.description}`);
    }
    this.scheduleRender();
  }

  /** `/model` with no arg lists known models; `/model <id>` switches. */
  private switchModel(args: string): void {
    const model = args.trim();
    if (model === '') {
      this.transcript.addNotice(`model: ${this.harness.model}`);
      this.transcript.addNotice(`known: ${Object.keys(MODEL_PRICING).join(', ')}`);
      this.scheduleRender();
      return;
    }
    this.harness.setModel(model);
    const priced = MODEL_PRICING[model] !== undefined;
    this.transcript.addNotice(
      priced
        ? `switched to ${model}`
        : `switched to ${model} (no price entry — its tokens won't add to $)`,
    );
    this.scheduleRender();
  }

  /** `/cost`: the running tally and dollar estimate for this session. */
  private showCost(): void {
    const { inputTokens, outputTokens } = this.usage;
    this.transcript.addNotice(
      `usage: ${formatTokens(inputTokens)} in + ${formatTokens(outputTokens)} out ` +
        `= ${formatTokens(inputTokens + outputTokens)} tokens · $${this.costUsd.toFixed(4)}`,
    );
    this.scheduleRender();
  }

  /** `/clear`: wipe the scrollback. */
  private clearScreen(): void {
    this.transcript.clear();
    this.scheduleRender();
  }

  /** Snapshot the conversation to disk. Skips an empty session (system only). */
  private persist(): void {
    if (this.harness.history.length <= 1) return;
    saveSession({
      id: this.sessionId,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      cwd: process.cwd(),
      history: [...this.harness.history],
    });
  }

  // --- harness events → transcript / spinner ---------------------------------

  private events(): AgentEvents {
    return {
      onTextDelta: (delta) => {
        this.transcript.appendAssistant(delta);
        this.scheduleRender();
      },
      onText: () => {
        this.transcript.endAssistant();
        this.scheduleRender();
      },
      onToolCall: (name, args) => {
        this.transcript.addTool(name, args);
        this.scheduleRender();
      },
      onToolResult: (_name, result) => {
        this.transcript.completeTool(result);
        this.scheduleRender();
      },
      onCompaction: (before, after) => {
        this.transcript.addNotice(`⧉ compacted context: ${before} → ${after} messages`);
        this.scheduleRender();
      },
      onUsage: (usage) => {
        this.usage = addUsage(this.usage, usage);
        this.costUsd += costOf(this.harness.model, usage);
        this.scheduleRender();
      },
      canUseTool: (name, args) => this.requestApproval(name, args),
    };
  }

  /** Turn the canUseTool callback into an on-screen prompt resolved by a key. */
  private requestApproval(name: string, args: string): Promise<boolean> {
    if (AUTO_APPROVED.has(name) || this.sessionApproved.has(name)) {
      return Promise.resolve(true);
    }
    const preview = args.length > 120 ? `${args.slice(0, 120)}…` : args;
    return new Promise<boolean>((resolve) => {
      this.approval = { name, preview, resolve };
      this.scheduleRender();
    });
  }

  // --- input routing ---------------------------------------------------------

  private handleKey = (key: Key): void => {
    if (key.ctrl && key.name === 'c') {
      this.handleCtrlC();
      return;
    }
    if (this.approval !== undefined) {
      this.handleApprovalKey(key);
      return;
    }
    if (this.running) return; // input is disabled while the agent works

    switch (key.name) {
      case 'return':
      case 'enter':
        this.submit();
        break;
      case 'backspace':
        this.editor.backspace();
        this.scheduleRender();
        break;
      case 'left':
        this.editor.left();
        this.scheduleRender();
        break;
      case 'right':
        this.editor.right();
        this.scheduleRender();
        break;
      case 'home':
        this.editor.home();
        this.scheduleRender();
        break;
      case 'end':
        this.editor.end();
        this.scheduleRender();
        break;
      default:
        if (isPrintable(key)) {
          this.editor.insert(key.sequence);
          this.scheduleRender();
        }
    }
  };

  private handleApprovalKey(key: Key): void {
    const answer = key.sequence.toLowerCase();
    if (answer === 'a') {
      this.sessionApproved.add(this.approval!.name);
      this.resolveApproval(true);
    } else if (answer === 'y') {
      this.resolveApproval(true);
    } else {
      // n, Enter, Esc, anything else → deny
      this.resolveApproval(false);
    }
  }

  private resolveApproval(approved: boolean): void {
    this.approval?.resolve(approved);
    this.approval = undefined;
    this.scheduleRender();
  }

  private submit(): void {
    const text = this.editor.value.trim();
    this.editor.clear();
    if (text === '') {
      this.scheduleRender();
      return;
    }
    if (text.startsWith('/')) {
      this.runCommand(text);
      return;
    }
    if (text.startsWith('!')) {
      this.runBang(text.slice(1).trim());
      return;
    }
    // @file mentions: show what you typed; send the model the expanded prompt.
    const { prompt, files } = expandMentions(text);
    this.transcript.addUser(text);
    for (const file of files) {
      this.transcript.addNotice(chalk.dim(`⧉ attached ${file}`));
    }
    void this.runTask(prompt);
  }

  /** Dispatch a `/…` line: a built-in runs app code; a custom command expands to a prompt. */
  private runCommand(input: string): void {
    const { name, args } = parseCommandLine(input);

    const builtin = this.builtins.get(name);
    if (builtin !== undefined) {
      builtin.run(args);
      return;
    }

    const command = this.commands.get(name);
    if (command === undefined) {
      const known = [...this.builtins.keys(), ...this.commands.keys()]
        .map((each) => `/${each}`)
        .join(', ');
      this.transcript.addNotice(`unknown command "/${name}". Try: ${known}`);
      this.scheduleRender();
      return;
    }

    // Show what you typed; send the expanded template to the model.
    this.transcript.addUser(input);
    void this.runTask(substituteArgs(command.body, args));
  }

  /** Run a `!` command now; leave the exchange in context for the next turn. */
  private runBang(command: string): void {
    if (command === '') {
      this.scheduleRender();
      return;
    }
    this.transcript.addNotice(chalk.cyan(`$ ${command}`));
    const { stdout, stderr, isError } = runBangCommand(command);
    this.transcript.addNotice(formatBashOutputForDisplay(stdout, stderr, isError));

    // The model never ran this — but next turn it should see it. Two user
    // messages, tagged as upstream tags them, appended via harness.appendContext
    // (which rides Part 10's restore). Then persist so a resumed session has it.
    this.harness.appendContext(bashInputTag(command));
    this.harness.appendContext(bashOutputTag(stdout, stderr));
    this.persist();
    this.scheduleRender();
  }

  private async runTask(text: string): Promise<void> {
    this.running = true;
    this.controller = new AbortController();
    this.startSpinner();
    this.scheduleRender();
    try {
      await this.harness.runTask(text, this.controller.signal);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        this.transcript.addNotice(chalk.red(`error: ${message(error)}`));
      }
    } finally {
      this.transcript.endAssistant();
      this.running = false;
      this.controller = undefined;
      this.stopSpinner();
      this.persist();
      this.scheduleRender();
    }
  }

  private handleCtrlC(): void {
    if (this.running && this.controller !== undefined) {
      this.controller.abort();
      // If a permission prompt is open, resolving it lets the loop reach the
      // aborted signal — otherwise run() would sit awaiting canUseTool forever.
      this.approval?.resolve(false);
      this.approval = undefined;
      this.transcript.addNotice('(cancelled — Ctrl-C again at the prompt to quit)');
      this.scheduleRender();
      return;
    }
    const now = Date.now();
    if (now - this.lastSigint < DOUBLE_CTRL_C_MS) {
      this.quit();
      return;
    }
    this.lastSigint = now;
    this.transcript.addNotice('(press Ctrl-C again to quit)');
    this.scheduleRender();
  }

  private quit(): void {
    this.persist();
    this.stopSpinner();
    this.screen.close();
    void Promise.allSettled(this.mcpConnections.map((c) => c.close())).then(() => {
      this.resolveDone?.();
    });
  }

  // --- rendering -------------------------------------------------------------

  private startSpinner(): void {
    this.spinnerFrame = 0;
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER.length;
      this.scheduleRender();
    }, 90);
  }

  private stopSpinner(): void {
    if (this.spinnerTimer !== undefined) clearInterval(this.spinnerTimer);
    this.spinnerTimer = undefined;
  }

  // Coalesce bursts of deltas into one repaint per tick.
  private scheduleRender = (): void => {
    if (this.renderQueued) return;
    this.renderQueued = true;
    setImmediate(() => {
      this.renderQueued = false;
      this.draw();
    });
  };

  private draw(): void {
    const width = this.screen.columns;
    const height = this.screen.rows;

    const header = renderFrame(this.banner, width);
    const body = renderTranscript(this.transcript.all, width);
    const status = this.renderStatus(width);
    const input = this.renderInput();

    // The banner is pinned at the top and the input + status bar at the bottom
    // (status is the very last row); the transcript scrolls between them.
    const viewport = Math.max(1, height - header.length - 2);
    const visible = body.slice(Math.max(0, body.length - viewport));
    const padding = Array<string>(Math.max(0, viewport - visible.length)).fill('');
    const lines = [...header, ...padding, ...visible, input, status];

    // Cursor sits on the input row — now the second-to-last row, above status.
    const cursorRow = height - 1;
    const cursorCol =
      this.approval !== undefined ? input.length + 1 : 2 + this.editor.cursor + 1;
    this.screen.render(lines, cursorRow, cursorCol);
  }

  private renderStatus(width: number): string {
    const state = this.running
      ? `${chalk.yellow(SPINNER[this.spinnerFrame] ?? '')} working…`
      : chalk.green('ready');
    const model = this.harness.model;
    const total = this.usage.inputTokens + this.usage.outputTokens;
    const meter = total > 0 ? ` · ${formatTokens(total)} tok · $${this.costUsd.toFixed(4)}` : '';
    const mcp = this.mcpToolCount > 0 ? ` · ${this.mcpToolCount} mcp tools` : '';
    const line = `${state} · ${model}${meter}${mcp} · Ctrl-C to cancel`;
    return chalk.dim(line.slice(0, width));
  }

  private renderInput(): string {
    if (this.approval !== undefined) {
      return chalk.yellow(`allow ${this.approval.name}(${this.approval.preview})? [y/N/a=always] `);
    }
    return chalk.cyan('❯ ') + this.editor.value;
  }
}

/** Printable = a single character that isn't a control/meta combo. */
function isPrintable(key: Key): boolean {
  return key.sequence.length === 1 && !key.ctrl && !key.meta && key.sequence >= ' ';
}

/** One-shot / non-interactive mode: stream to stdout, no full-screen UI. */
async function runOneShot(
  options: AgentHarnessOptions,
  prompt: string,
  resume?: StoredSession,
): Promise<void> {
  let streaming = false;
  let usage = emptyUsage();
  let costUsd = 0;
  const model = options.model ?? 'gpt-4o-mini';
  const harness = createAgentHarness(options, {
    onTextDelta: (delta) => {
      if (!streaming) {
        process.stdout.write('\n');
        streaming = true;
      }
      process.stdout.write(delta);
    },
    onText: () => {
      if (streaming) {
        process.stdout.write('\n');
        streaming = false;
      }
    },
    onToolCall: (name, args) => {
      const preview = args.length > 120 ? `${args.slice(0, 120)}…` : args;
      console.log(chalk.dim(`  ⏺ ${name}(${preview})`));
    },
    onToolResult: (_name, result) => {
      console.log(chalk.dim(`    ↳ ${(result.split('\n')[0] ?? '').slice(0, 100)}`));
    },
    onCompaction: (before, after) => {
      console.log(chalk.dim(`  ⧉ compacted context: ${before} → ${after} messages`));
    },
    onUsage: (u) => {
      usage = addUsage(usage, u);
      costUsd += costOf(model, u);
    },
    // Non-interactive: no one to ask. Trust the prompt. A real CLI would gate
    // this behind an explicit --yes / --dangerously-skip-permissions flag.
    canUseTool: () => true,
  });
  const { connections } = await registerMcpServers(harness, (line) =>
    console.log(chalk.dim(`  ${line}`)),
  );
  for (const skill of options.skills ?? []) {
    console.log(chalk.dim(`  ⚙ skill: ${skill.name}`));
  }
  const sessionId = resume?.id ?? `session_${randomUUID()}`;
  const createdAt = resume?.createdAt ?? new Date().toISOString();
  const { prompt: expanded } = expandMentions(prompt);
  try {
    await harness.runTask(expanded);
  } finally {
    if (harness.history.length > 1) {
      saveSession({
        id: sessionId,
        createdAt,
        updatedAt: new Date().toISOString(),
        cwd: process.cwd(),
        history: [...harness.history],
      });
      console.log(chalk.dim(`\nTo resume this session: coding-agent -r ${sessionId}`));
    }
    const total = usage.inputTokens + usage.outputTokens;
    if (total > 0) {
      console.log(chalk.dim(`\nusage: ${formatTokens(total)} tokens · $${costUsd.toFixed(4)}`));
    }
    await Promise.allSettled(connections.map((c) => c.close()));
  }
}

export async function startTui(prompt?: string, opts: ShellOptions = {}): Promise<void> {
  // --list: print saved sessions and exit, before touching the API key.
  if (opts.list === true) {
    for (const session of listSessions()) {
      const firstPrompt =
        session.history.find((message) => message.role === 'user')?.content ?? '';
      const title = firstPrompt.split('\n')[0]?.slice(0, 60) ?? '';
      console.log(`${session.id}  ${session.updatedAt}  ${session.cwd}\n    ${title}`);
    }
    return;
  }

  const loaded = loadHarnessOptionsFromEnv();
  if (!loaded.ok) {
    console.error(chalk.red(loaded.error));
    process.exit(1);
  }

  // Which session to resume? -r <id> loads that one; bare -r takes the newest
  // overall; -c takes the newest for this directory; otherwise none.
  let resume: StoredSession | undefined;
  if (typeof opts.resume === 'string') {
    resume = loadSession(opts.resume);
    if (resume === undefined) console.error(chalk.red(`no session "${opts.resume}"`));
  } else if (opts.resume === true) {
    resume = listSessions()[0];
  } else if (opts.continue === true) {
    resume = latestSession(process.cwd());
  }

  const memory = discoverMemory();
  const options: AgentHarnessOptions = {
    ...loaded.options,
    skills: discoverSkills(),
    ...(memory.text !== '' && { memory: memory.text }),
    ...(resume !== undefined && { resumeHistory: resume.history }),
  };
  const commands = discoverCommands();

  // A full-screen UI only makes sense on a real terminal. One-shot mode
  // (`coding-agent "fix the test"`) and piped stdin fall back to plain output.
  if (prompt !== undefined || !process.stdin.isTTY) {
    if (prompt === undefined) {
      console.error(chalk.red('no prompt given and stdin is not a TTY.'));
      process.exit(1);
    }
    await runOneShot(options, prompt, resume);
    return;
  }

  await new CodingAgentTui(options, commands, resume, memory.sources).start();
}
