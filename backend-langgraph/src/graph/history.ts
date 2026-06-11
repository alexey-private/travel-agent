import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { LMRound } from '../types/lm';

/**
 * Expands LMRound[] into the proper LangGraph message sequence for one assistant turn.
 *
 * For each round: AIMessage(tool_calls) → ToolMessage(result) × N
 * Rounds with empty tool_calls or missing IDs are skipped to avoid API errors.
 *
 * The final AIMessage (the assistant's text response) is NOT produced here — it is
 * appended separately from m.content by the caller.
 */
export function lmRoundsToMessages(rounds: LMRound[]): BaseMessage[] {
  const msgs: BaseMessage[] = [];
  for (const round of rounds) {
    if (!round.tool_calls.length) continue;
    // Skip any round where IDs are missing — the API would reject mismatched tool_call_ids.
    if (round.tool_calls.some(tc => !tc.id)) continue;

    msgs.push(
      new AIMessage({
        content: '',
        tool_calls: round.tool_calls.map(tc => ({
          id: tc.id,
          name: tc.name,
          args: tc.args as Record<string, unknown>,
          type: 'tool_call' as const,
        })),
      }),
    );
    for (const result of round.tool_results) {
      msgs.push(
        new ToolMessage({
          content: result.content,
          tool_call_id: result.tool_call_id,
          name: result.name,
        }),
      );
    }
  }
  return msgs;
}

/**
 * Converts a raw DB history row array into LangGraph BaseMessage[].
 * Expands assistant rows that have lm_messages into full AIMessage+ToolMessage sequences.
 */
export function historyToMessages(
  history: Array<{ role: 'user' | 'assistant'; content: string; lm_messages: LMRound[] | null }>,
): BaseMessage[] {
  const result: BaseMessage[] = [];
  for (const m of history) {
    if (m.role === 'user') {
      result.push(new HumanMessage(m.content));
      continue;
    }
    // Skip empty assistant messages with no tool rounds — these are incomplete
    // turns saved after an error (e.g. Google not connected) that contain no
    // usable content and would break the tool_use/tool_result pairing requirement.
    if (!m.content && !m.lm_messages?.length) continue;

    const roundMsgs = m.lm_messages?.length ? lmRoundsToMessages(m.lm_messages) : [];
    result.push(...roundMsgs, new AIMessage(m.content));
  }
  return result;
}
