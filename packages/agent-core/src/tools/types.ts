import type { ToolSpec } from '@kevin.xie.toronto/llm-provider-abstraction';
import { z } from 'zod';

export interface ToolDefinition<Schema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: Schema;
  /**
   * Precomputed JSON Schema for the tool's parameters. When set, it is sent
   * to the model verbatim instead of deriving one from `schema`. Used by tools
   * whose schema originates outside zod — MCP servers advertise JSON Schema
   * directly, so there is no zod type to convert.
   */
  parameters?: Record<string, unknown>;
  execute(args: z.infer<Schema>): Promise<string>;
}

/** What the model sees: name + description + JSON Schema for the arguments. */
export function toToolSpec(tool: ToolDefinition): ToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    parameters:
      tool.parameters ?? (z.toJSONSchema(tool.schema) as Record<string, unknown>),
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  specs(): ToolSpec[] {
    return [...this.tools.values()].map(toToolSpec);
  }

  /** Parse raw JSON arguments, validate against the schema, run the tool. */
  async dispatch(name: string, rawArguments: string): Promise<string> {
    const tool = this.tools.get(name);
    if (tool === undefined) {
      return `Error: unknown tool "${name}"`;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawArguments === '' ? '{}' : rawArguments);
    } catch {
      return `Error: tool arguments were not valid JSON: ${rawArguments}`;
    }
    const validated = tool.schema.safeParse(parsed);
    if (!validated.success) {
      return `Error: invalid arguments for ${name}: ${validated.error.message}`;
    }
    try {
      return await tool.execute(validated.data);
    } catch (error) {
      return `Error: tool ${name} failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
