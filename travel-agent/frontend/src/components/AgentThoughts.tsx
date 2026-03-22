"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, CheckCircle, XCircle } from "lucide-react";

export interface ToolStep {
  id: string;
  tool: string;
  input: unknown;
  output?: unknown;
  error?: string;
  /** true while waiting for the tool_end event */
  pending: boolean;
}

interface AgentThoughtsProps {
  steps: ToolStep[];
  /** Whether the agent is still streaming text */
  streaming: boolean;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function ToolStepRow({ step }: { step: ToolStep }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        {step.pending ? (
          <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
        ) : step.error ? (
          <XCircle size={14} className="text-red-500 shrink-0" />
        ) : (
          <CheckCircle size={14} className="text-green-500 shrink-0" />
        )}

        <span className="font-mono font-medium text-gray-700">{step.tool}</span>

        {/* Short preview of input */}
        <span className="text-gray-400 truncate flex-1">
          {typeof step.input === "object" && step.input !== null
            ? Object.values(step.input as Record<string, unknown>)
                .filter((v) => typeof v === "string")
                .join(", ")
                .slice(0, 60)
            : String(step.input).slice(0, 60)}
        </span>

        {expanded ? (
          <ChevronDown size={14} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-gray-400 shrink-0" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 py-2 bg-white space-y-2">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">Input</p>
            <pre className="text-xs bg-gray-50 rounded p-2 overflow-auto max-h-32 text-gray-700 whitespace-pre-wrap">
              {formatValue(step.input)}
            </pre>
          </div>

          {!step.pending && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">
                {step.error ? "Error" : "Output"}
              </p>
              <pre
                className={`text-xs rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap ${
                  step.error
                    ? "bg-red-50 text-red-700"
                    : "bg-green-50 text-gray-700"
                }`}
              >
                {step.error ?? formatValue(step.output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible section that shows the agent's tool-use steps in real time.
 */
export default function AgentThoughts({ steps, streaming }: AgentThoughtsProps) {
  const [open, setOpen] = useState(true);

  if (steps.length === 0 && !streaming) return null;

  return (
    <div className="my-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 mb-2"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {streaming && steps.length === 0
          ? "Agent is thinking…"
          : `Agent used ${steps.length} tool${steps.length !== 1 ? "s" : ""}`}
      </button>

      {open && (
        <div className="space-y-1 pl-1">
          {steps.map((step) => (
            <ToolStepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}
