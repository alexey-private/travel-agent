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

interface Feature {
  Icon: typeof Plane;
  title: string;
  description: string;
}

const TRAVEL_TOOLS: Feature[] = [
  { Icon: Plane, title: "Flights", description: "Search and compare flight options for your route and dates." },
  { Icon: Hotel, title: "Hotels", description: "Find hotels matching your destination, dates, and budget." },
  { Icon: Car, title: "Car rental", description: "Browse rental car options at your destination." },
  { Icon: Compass, title: "Tours & activities", description: "Discover guided tours and things to do." },
  { Icon: Sparkles, title: "Spa & wellness", description: "Find spa and wellness options to unwind on your trip." },
  { Icon: Globe2, title: "Weather", description: "Live weather lookups to help plan what to pack." },
  { Icon: Landmark, title: "Visa & country info", description: "Visa requirements and country facts for your destination." },
  { Icon: Coins, title: "Currency conversion", description: "Real-time currency conversion for trip budgeting." },
];

const PRODUCTIVITY: Feature[] = [
  {
    Icon: CalendarDays,
    title: "Calendar",
    description:
      "Ask the agent to add events to your calendar — synced with Google Calendar or Apple iCloud, whichever you connect in Settings.",
  },
  {
    Icon: ListChecks,
    title: "Tasks",
    description: "Create and track to-dos with due dates, backed by Google Tasks or iCloud Reminders.",
  },
  {
    Icon: Brain,
    title: "Memory",
    description:
      "The agent remembers preferences you mention — home airport, favorite airline, dietary needs — and recalls past conversations by meaning, not just keywords.",
  },
];

const TELEGRAM_BOT_URL = "https://t.me/my_ai_travel_agent_bot";

const TELEGRAM_COMMANDS: { command: string; description: string }[] = [
  { command: "/start", description: "Welcome message and feature overview" },
  { command: "/connect", description: "Link your Telegram account to your web app session" },
  { command: "/new", description: "Start a new conversation" },
  { command: "/history", description: "List recent conversations" },
  { command: "/tasks", description: "Show tomorrow's tasks" },
  { command: "/calendar", description: "Show upcoming calendar events" },
  { command: "/remind", description: "Subscribe to a daily morning digest" },
  { command: "/travel", description: "Switch to the Travel agent" },
  { command: "/mode", description: "Show or change the current agent mode" },
  { command: "/clear", description: "Clear conversation context" },
];

function FeatureCard({ Icon, title, description }: Feature) {
  return (
    <div className="flex gap-3 p-4 bg-white border border-gray-200 rounded-lg">
      <div className="shrink-0 w-9 h-9 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
        <Icon size={18} />
      </div>
      <div>
        <p className="font-medium text-gray-800 text-sm">{title}</p>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-200">
        <Link href="/" title="Back to chat" className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <span className="font-semibold text-gray-800">What this app can do</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-12">
        <section>
          <p className="text-gray-600">
            An AI travel planning assistant you can chat with from the web app or Telegram. It searches flights and
            hotels, keeps your calendar and tasks in sync, and remembers your preferences across conversations.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Travel planning</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {TRAVEL_TOOLS.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Calendar, tasks & memory</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {PRODUCTIVITY.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <Send size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Telegram bot</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Chat with the same agent from Telegram — send text, photos, voice messages (auto-transcribed), or your
            location for on-the-go travel context. Use <code className="text-xs bg-gray-100 px-1 py-0.5 rounded-sm">/connect</code>{" "}
            to link it to your web account so calendar and tasks stay in sync.
          </p>
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Send size={14} />
            Open @my_ai_travel_agent_bot
          </a>
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
            {TELEGRAM_COMMANDS.map(({ command, description }) => (
              <div key={command} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <code className="font-mono text-blue-600 shrink-0 w-24">{command}</code>
                <span className="text-gray-500">{description}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <BellRing size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Notifications</h2>
          </div>
          <p className="text-sm text-gray-600">
            A daily morning digest of tomorrow&apos;s events and tasks — delivered via Telegram if you&apos;ve connected the
            bot, or as a browser push notification otherwise.
          </p>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <SettingsIcon size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Settings</h2>
          </div>
          <p className="text-sm text-gray-600">
            Connect or disconnect Google Calendar/Tasks or Apple iCloud, switch between them at any time, name your
            task lists, and manage push notifications — all from{" "}
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
