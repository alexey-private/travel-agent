"use client";

import { Plane, ShoppingBag } from "lucide-react";

export type AgentType = "travel" | "shopping";

interface AgentSelectorProps {
  value: AgentType;
  onChange: (agentType: AgentType) => void;
}

const AGENTS: { type: AgentType; label: string; Icon: typeof Plane }[] = [
  { type: "travel", label: "Travel", Icon: Plane },
  { type: "shopping", label: "Shopping", Icon: ShoppingBag },
];

/**
 * Tab-style toggle for switching between Travel and Shopping agents.
 */
export default function AgentSelector({ value, onChange }: AgentSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {AGENTS.map(({ type, label, Icon }) => {
        const active = value === type;
        return (
          <button
            key={type}
            onClick={() => onChange(type)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
