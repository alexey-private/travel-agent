/** A single tool call issued by the LLM in one reasoning round. */
export interface LMToolCall {
  id: string;
  name: string;
  args: unknown;
}

/** The result returned by one tool execution. */
export interface LMToolResult {
  tool_call_id: string;
  name: string;
  content: string;
}

/**
 * One reasoning round: the LLM issued tool_calls, then received tool_results.
 * A single assistant turn may contain zero or more rounds before the final text response.
 */
export interface LMRound {
  tool_calls: LMToolCall[];
  tool_results: LMToolResult[];
}
