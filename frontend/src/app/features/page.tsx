"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Plane,
  Hotel,
  Car,
  Compass,
  Sparkles,
  Globe2,
  Landmark,
  Coins,
  CalendarDays,
  ListChecks,
  Brain,
  Send,
  BellRing,
  Settings as SettingsIcon,
} from "lucide-react";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/dictionaries";

interface Feature {
  Icon: typeof Plane;
  titleKey: TKey;
  descriptionKey: TKey;
}

const TRAVEL_TOOLS: Feature[] = [
  { Icon: Plane, titleKey: "features.flightsTitle", descriptionKey: "features.flightsDescription" },
  { Icon: Hotel, titleKey: "features.hotelsTitle", descriptionKey: "features.hotelsDescription" },
  { Icon: Car, titleKey: "features.carRentalTitle", descriptionKey: "features.carRentalDescription" },
  { Icon: Compass, titleKey: "features.toursTitle", descriptionKey: "features.toursDescription" },
  { Icon: Sparkles, titleKey: "features.spaTitle", descriptionKey: "features.spaDescription" },
  { Icon: Globe2, titleKey: "features.weatherTitle", descriptionKey: "features.weatherDescription" },
  { Icon: Landmark, titleKey: "features.visaTitle", descriptionKey: "features.visaDescription" },
  { Icon: Coins, titleKey: "features.currencyTitle", descriptionKey: "features.currencyDescription" },
];

const PRODUCTIVITY: Feature[] = [
  { Icon: CalendarDays, titleKey: "features.calendarTitle", descriptionKey: "features.calendarDescription" },
  { Icon: ListChecks, titleKey: "features.tasksTitle", descriptionKey: "features.tasksDescription" },
  { Icon: Brain, titleKey: "features.memoryTitle", descriptionKey: "features.memoryDescription" },
];

const TELEGRAM_BOT_URL = "https://t.me/my_ai_travel_agent_bot";

/** Command names are the bot's API surface — only their descriptions translate. */
const TELEGRAM_COMMANDS: { command: string; descriptionKey: TKey }[] = [
  { command: "/start", descriptionKey: "features.cmdStart" },
  { command: "/connect", descriptionKey: "features.cmdConnect" },
  { command: "/new", descriptionKey: "features.cmdNew" },
  { command: "/history", descriptionKey: "features.cmdHistory" },
  { command: "/tasks", descriptionKey: "features.cmdTasks" },
  { command: "/calendar", descriptionKey: "features.cmdCalendar" },
  { command: "/remind", descriptionKey: "features.cmdRemind" },
  { command: "/travel", descriptionKey: "features.cmdTravel" },
  { command: "/mode", descriptionKey: "features.cmdMode" },
  { command: "/clear", descriptionKey: "features.cmdClear" },
];

function FeatureCard({ Icon, titleKey, descriptionKey }: Feature) {
  const t = useT();
  return (
    <div className="flex gap-3 p-4 bg-white border border-gray-200 rounded-lg">
      <div className="shrink-0 w-9 h-9 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
        <Icon size={18} />
      </div>
      <div>
        <p className="font-medium text-gray-800 text-sm">{t(titleKey)}</p>
        <p className="text-sm text-gray-500 mt-0.5">{t(descriptionKey)}</p>
      </div>
    </div>
  );
}

export default function FeaturesPage() {
  const t = useT();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-200">
        <Link href="/" title={t("features.backToChat")} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <span className="font-semibold text-gray-800 me-auto">{t("features.title")}</span>
        <LanguageSwitcher />
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-12">
        <section>
          <p className="text-gray-600">{t("features.intro")}</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            {t("features.travelHeading")}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {TRAVEL_TOOLS.map((f) => (
              <FeatureCard key={f.titleKey} {...f} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            {t("features.productivityHeading")}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {PRODUCTIVITY.map((f) => (
              <FeatureCard key={f.titleKey} {...f} />
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <Send size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {t("features.telegramHeading")}
            </h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            {t("features.telegramIntroBefore")}{" "}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded-sm">/connect</code>{" "}
            {t("features.telegramIntroAfter")}
          </p>
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Send size={14} />
            {t("features.telegramOpen")}
          </a>
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {TELEGRAM_COMMANDS.map(({ command, descriptionKey }) => (
              <div key={command} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <code className="font-mono text-blue-600 shrink-0 w-24">{command}</code>
                <span className="text-gray-500">{t(descriptionKey)}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <BellRing size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {t("features.notificationsHeading")}
            </h2>
          </div>
          <p className="text-sm text-gray-600">{t("features.notificationsText")}</p>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <SettingsIcon size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {t("features.settingsHeading")}
            </h2>
          </div>
          <p className="text-sm text-gray-600">
            {t("features.settingsTextBefore")}{" "}
            <Link href="/settings" className="text-blue-600 hover:underline">
              /settings
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
