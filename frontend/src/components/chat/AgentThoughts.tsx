"use client";

import { memo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, CheckCircle, XCircle } from "lucide-react";
import { type ToolStep } from "@/types/agent";
import { useT } from "@/i18n/useT";
import { MIRROR_UNDER_RTL } from "@/i18n/direction";

export type { ToolStep };

interface AgentThoughtsProps {
  steps: ToolStep[];
  streaming: boolean;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

const ToolStepRow = memo(function ToolStepRow({ step }: { step: ToolStep }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-start"
      >
        {step.pending ? (
          <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
        ) : step.error ? (
          <XCircle size={14} className="text-red-500 shrink-0" />
        ) : (
          <CheckCircle size={14} className="text-green-500 shrink-0" />
        )}

        <span className="font-mono font-medium text-gray-700">{step.tool}</span>

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
          <ChevronRight size={14} className={`text-gray-400 shrink-0 ${MIRROR_UNDER_RTL}`} />
        )}
      </button>

      {expanded && (
        <div className="px-3 py-2 bg-white space-y-2">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">{t("chat.stepInput")}</p>
            <pre className="text-xs bg-gray-50 rounded-sm p-2 overflow-auto max-h-32 text-gray-700 whitespace-pre-wrap">
              {formatValue(step.input)}
            </pre>
          </div>

          {!step.pending && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">
                {step.error ? t("chat.stepError") : t("chat.stepOutput")}
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
});

const AgentThoughts = memo(function AgentThoughts({ steps, streaming }: AgentThoughtsProps) {
  const t = useT();
  const [open, setOpen] = useState(true);

  if (steps.length === 0 && !streaming) return null;

  return (
    <div className="my-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 mb-2"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} className={MIRROR_UNDER_RTL} />}
        {streaming && steps.length === 0
          ? t("chat.thinking")
          : t("chat.toolsUsed", { count: steps.length })}
      </button>

      {open && (
        <div className="space-y-1 ps-1">
          {steps.map((step) => (
            <ToolStepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
});

export default AgentThoughts;
