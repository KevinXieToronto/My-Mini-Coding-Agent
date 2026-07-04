import { exec } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { z } from 'zod';

import type { ToolDefinition } from '#tools/types';

const execAsync = promisify(exec);

const MAX_OUTPUT_CHARS = 30_000;

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n... [truncated ${text.length - MAX_OUTPUT_CHARS} chars]`;
}

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description:
    'Read a text file and return its contents with line numbers. Use this before editing any file.',
  schema: z.object({
    path: z.string().describe('Path to the file, relative to the working directory'),
  }),
  async execute({ path }) {
    const content = await readFile(path, 'utf8');
    const numbered = content
      .split('\n')
      .map((line, index) => `${index + 1}\t${line}`)
      .join('\n');
    return truncate(numbered);
  },
};

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description:
    'Write content to a file, creating it if needed and overwriting it if it exists.',
  schema: z.object({
    path: z.string().describe('Path to the file to write'),
    content: z.string().describe('Full content to write to the file'),
  }),
  async execute({ path, content }) {
    await writeFile(path, content, 'utf8');
    return `Wrote ${content.length} chars to ${path}`;
  },
};

export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: 'List the entries of a directory. Directories are suffixed with "/".',
  schema: z.object({
    path: z.string().default('.').describe('Directory to list (default: cwd)'),
  }),
  async execute({ path }) {
    const entries = await readdir(path, { withFileTypes: true });
    if (entries.length === 0) return '(empty directory)';
    return truncate(
      entries
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
        .join('\n'),
    );
  },
};

export const bashTool: ToolDefinition = {
  name: 'bash',
  description:
    'Run a shell command and return stdout/stderr. Use for git, package managers, running tests, etc. Commands time out after 60 seconds.',
  schema: z.object({
    command: z.string().describe('The shell command to run'),
  }),
  async execute({ command }) {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const output = [stdout, stderr && `[stderr]\n${stderr}`]
        .filter(Boolean)
        .join('\n');
      return truncate(output === '' ? '(no output)' : output);
    } catch (error) {
      // Non-zero exit is information for the model, not a crash.
      const err = error as { stdout?: string; stderr?: string; message: string };
      return truncate(
        `Command failed: ${err.message}\n${err.stdout ?? ''}\n${err.stderr ?? ''}`,
      );
    }
  },
};

export const builtinTools: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  listDirTool,
  bashTool,
];
