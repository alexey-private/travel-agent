"use client";

import { Plane, ShoppingBag } from "lucide-react";
import { SHOPPING_ENABLED } from "@/lib/config";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/dictionaries";

export type AgentType = "travel" | "shopping";

interface AgentSelectorProps {
  value: AgentType;
  onChange: (agentType: AgentType) => void;
}

const ALL_AGENTS: { type: AgentType; labelKey: TKey; Icon: typeof Plane }[] = [
  { type: "travel", labelKey: "common.agentTravel", Icon: Plane },
  { type: "shopping", labelKey: "common.agentShopping", Icon: ShoppingBag },
];

const AGENTS = SHOPPING_ENABLED ? ALL_AGENTS : ALL_AGENTS.filter((a) => a.type !== "shopping");

/**
 * Tab-style toggle for switching between Travel and Shopping agents.
 */
export default function AgentSelector({ value, onChange }: AgentSelectorProps) {
  const t = useT();

  if (AGENTS.length < 2) return null;

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {AGENTS.map(({ type, labelKey, Icon }) => {
        const active = value === type;
        return (
          <button
            key={type}
            onClick={() => onChange(type)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active
                ? "bg-white text-blue-600 shadow-xs"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{t(labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
