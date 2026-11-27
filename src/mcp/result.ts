import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

export const json = (v: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(v) }],
  structuredContent: v as Record<string, unknown>,
});

export const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });
export const ok = (): ToolResult => text(JSON.stringify({ result: 'success' }));
export const fail = (e: unknown): ToolResult => ({
  isError: true,
  content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }],
});
