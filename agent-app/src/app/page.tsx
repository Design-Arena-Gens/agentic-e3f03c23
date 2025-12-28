"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Loader2,
  Mic,
  Phone,
  PhoneCall,
  PhoneOff,
  Play,
  Sparkles,
  Square,
  User,
  Volume2,
} from "lucide-react";

type CallState = "idle" | "dialing" | "in-progress" | "completed";
type Role = "agent" | "customer" | "system";

type Message = {
  id: string;
  role: Role;
  text: string;
  timestamp: number;
  meta?: string;
};

type ScriptStep = {
  agent: string;
  customer?: string;
  coaching: string;
};

type Scenario = {
  agentName: string;
  customerName: string;
  companyName: string;
  goal: string;
};

const AGENT_NAME = "Quin";

export default function Home() {
  const [customerName, setCustomerName] = useState("Jordan Wells");
  const [companyName, setCompanyName] = useState("HelioGrid Energy");
  const [goal, setGoal] = useState(
    "Verify power output dips on a rooftop solar array, offer a remote diagnostic, and book a technician if production is below target."
  );
  const [callState, setCallState] = useState<CallState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [autoRespond, setAutoRespond] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [customerDraft, setCustomerDraft] = useState("");
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callEndedAt, setCallEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const agentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scenario = useMemo<Scenario>(
    () => ({
      agentName: AGENT_NAME,
      customerName,
      companyName,
      goal,
    }),
    [customerName, companyName, goal]
  );

  const script = useMemo<ScriptStep[]>(() => buildScript(scenario), [scenario]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis;
    }
    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (agentTimer.current) clearTimeout(agentTimer.current);
      if (customerTimer.current) clearTimeout(customerTimer.current);
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!voiceEnabled || typeof window === "undefined") return;
      const synth = synthRef.current;
      if (!synth) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.04;
      utterance.pitch = 1.05;
      utterance.volume = 0.92;
      utterance.lang = "en-US";
      synth.speak(utterance);
    },
    [voiceEnabled]
  );

  const clearTimers = useCallback(() => {
    if (agentTimer.current) {
      clearTimeout(agentTimer.current);
      agentTimer.current = null;
    }
    if (customerTimer.current) {
      clearTimeout(customerTimer.current);
      customerTimer.current = null;
    }
  }, []);

  const resetCall = useCallback(() => {
    clearTimers();
    synthRef.current?.cancel();
    setMessages([]);
    setCurrentStep(0);
    setCallState("idle");
    setAwaitingResponse(false);
    setCallStartedAt(null);
    setCallEndedAt(null);
    setCustomerDraft("");
  }, [clearTimers]);

  const endCall = useCallback(
    (reason?: string) => {
      if (callState === "completed") return;
      clearTimers();
      const closing =
        reason ??
        `Thanks for your time today, ${scenario.customerName}. I'll send a quick summary by email right after this.`;
      setMessages((prev) => [
        ...prev,
        createMessage("agent", closing, "Wrap-up"),
      ]);
      speak(closing);
      setCallState("completed");
      setAwaitingResponse(false);
      setCallEndedAt(Date.now());
    },
    [callState, clearTimers, scenario.customerName, speak]
  );

  const deliverAgentLine = useCallback(
    function run(stepIndex: number) {
      const step = script[stepIndex];
      if (!step) {
        endCall();
        return;
      }
      const agentLine = personalise(step.agent, scenario);
      setMessages((prev) => [
        ...prev,
        createMessage("agent", agentLine, `Stage ${stepIndex + 1}`),
      ]);
      setCurrentStep(stepIndex);

      const expectsResponse = Boolean(step.customer && step.customer.trim());
      setAwaitingResponse(expectsResponse && !autoRespond);
      speak(agentLine);

      if (!expectsResponse) {
        agentTimer.current = setTimeout(() => {
          endCall();
        }, 1600);
        return;
      }

      if (autoRespond) {
        customerTimer.current = setTimeout(() => {
          const customerLine = personalise(step.customer ?? "", scenario);
          setMessages((prev) => [
            ...prev,
            createMessage("customer", customerLine),
          ]);
          setAwaitingResponse(false);
          agentTimer.current = setTimeout(() => {
            run(stepIndex + 1);
          }, randomBetween(1300, 2200));
        }, randomBetween(900, 1500));
      }
    },
    [autoRespond, endCall, scenario, script, speak]
  );

  const handleStartCall = useCallback(() => {
    resetCall();
    const startTimestamp = Date.now();
    setCallStartedAt(startTimestamp);
    setCallState("dialing");
    setMessages([
      createMessage("system", `Dialing ${scenario.customerName}...`, "Status"),
    ]);

    agentTimer.current = setTimeout(() => {
      setCallState("in-progress");
      setMessages((prev) => [
        ...prev,
        createMessage("system", "Call connected", "Status"),
      ]);
      deliverAgentLine(0);
    }, randomBetween(900, 1400));
  }, [deliverAgentLine, resetCall, scenario.customerName]);

  const handleManualWrapUp = useCallback(() => {
    endCall("Understood. I'll send over the follow-up details right away.");
  }, [endCall]);

  const handleCustomerSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!customerDraft.trim() || callState !== "in-progress") return;
      const text = customerDraft.trim();
      setCustomerDraft("");
      setMessages((prev) => [
        ...prev,
        createMessage("customer", text),
      ]);
      setAwaitingResponse(false);
      agentTimer.current = setTimeout(() => {
        deliverAgentLine(currentStep + 1);
      }, randomBetween(1000, 1800));
    },
    [callState, customerDraft, currentStep, deliverAgentLine]
  );

  useEffect(() => {
    if (callState !== "in-progress") {
      setNow(Date.now());
      return;
    }
    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(intervalId);
  }, [callState]);

  const callDuration = useMemo(() => {
    if (!callStartedAt) return null;
    const end = callEndedAt ?? now;
    return formatDuration(end - callStartedAt);
  }, [callStartedAt, callEndedAt, now]);

  const highlights = useMemo(
    () => deriveHighlights(messages, scenario),
    [messages, scenario]
  );

  const progressPercent = useMemo(() => {
    if (!script.length) return 0;
    const cappedIndex = Math.min(currentStep + 1, script.length);
    return Math.round((cappedIndex / script.length) * 100);
  }, [currentStep, script.length]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-24 pt-16">
        <header className="flex flex-col gap-4">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-medium uppercase tracking-wide text-slate-200 backdrop-blur">
            <Sparkles className="h-4 w-4 text-amber-300" />
            AI Calling Agent
          </span>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Launch a fully-scripted voice agent that qualifies, diagnoses, and
            books follow-ups automatically.
          </h1>
          <p className="max-w-2xl text-base text-slate-300 sm:text-lg">
            Configure the persona, set the outcome you need, and press call.
            Quin handles the conversation, adapts to customer responses, and
            leaves you with clean notes and next steps.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          <section className="flex flex-col gap-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/30 backdrop-blur">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/90 text-slate-900 shadow-lg shadow-emerald-500/30">
                    <Bot className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-wide text-slate-300">
                      {callState === "in-progress"
                        ? "Live Call"
                        : callState === "dialing"
                          ? "Dialing"
                          : callState === "completed"
                            ? "Completed"
                            : "Ready"}
                    </p>
                    <h2 className="text-2xl font-semibold text-white">
                      {callState === "idle"
                        ? "Ready to dial"
                        : callState === "dialing"
                          ? "Connecting…"
                          : callState === "in-progress"
                            ? `${scenario.agentName} ↔ ${scenario.customerName}`
                            : "Call summary"}
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setVoiceEnabled((prev) => !prev)}
                    className={`inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm transition ${
                      voiceEnabled
                        ? "bg-white/10 text-emerald-200"
                        : "bg-white/5 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    <Volume2 className="h-4 w-4" />
                    Voice {voiceEnabled ? "On" : "Off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoRespond((prev) => !prev)}
                    className={`inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm transition ${
                      autoRespond
                        ? "bg-white/10 text-emerald-200"
                        : "bg-white/5 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    <Mic className="h-4 w-4" />
                    {autoRespond ? "Auto-pilot" : "Manual"}
                  </button>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-6 rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-sm">
                <div className="flex items-center gap-3">
                  <PhoneCall className="h-4 w-4 text-emerald-300" />
                  <span className="text-slate-200">
                    Progress ·{" "}
                    <strong className="font-semibold text-white">
                      {progressPercent}%
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
                  <span className="text-slate-200">
                    {callDuration ? `${callDuration} elapsed` : "00:00 elapsed"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  <span className="text-slate-200">
                    Goal · {summariseGoal(goal)}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleStartCall}
                  disabled={callState === "dialing" || callState === "in-progress"}
                  className="inline-flex items-center gap-3 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                >
                  {callState === "idle" ? (
                    <Play className="h-4 w-4" />
                  ) : callState === "completed" ? (
                    <Play className="h-4 w-4" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {callState === "idle"
                    ? "Launch Call"
                    : callState === "completed"
                      ? "Restart Call"
                      : "Connecting"}
                </button>
                {callState === "in-progress" && (
                  <button
                    type="button"
                    onClick={handleManualWrapUp}
                    className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    <Square className="h-4 w-4" />
                    Wrap up
                  </button>
                )}
                {callState === "in-progress" && (
                  <button
                    type="button"
                    onClick={() => {
                      clearTimers();
                      setCallState("completed");
                      setCallEndedAt(Date.now());
                      setMessages((prev) => [
                        ...prev,
                        createMessage(
                          "system",
                          "Call ended manually",
                          "Disconnected"
                        ),
                      ]);
                    }}
                    className="inline-flex items-center gap-3 rounded-2xl border border-red-400/40 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/20"
                  >
                    <PhoneOff className="h-4 w-4" />
                    Hang up
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-6 shadow-lg shadow-black/30 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Live transcript
                  </h3>
                  <p className="text-sm text-slate-300">
                    Every utterance, tagged with stage guidance for coaching.
                  </p>
                </div>
                {callState === "in-progress" && awaitingResponse && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
                    <User className="h-3.5 w-3.5" />
                    Waiting for customer
                  </span>
                )}
              </div>

              <div className="grid gap-3">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 py-12 text-center text-sm text-slate-300">
                    <Phone className="h-6 w-6 text-slate-500" />
                    <p>
                      Transcript will appear here once you launch the call.
                    </p>
                  </div>
                )}

                {messages.map((message) => (
                  <TranscriptRow key={message.id} message={message} />
                ))}
              </div>

              {!autoRespond && callState === "in-progress" && (
                <form
                  className="mt-2 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
                  onSubmit={handleCustomerSubmit}
                >
                  <label
                    htmlFor="customer-reply"
                    className="text-sm font-medium text-slate-200"
                  >
                    Customer reply
                  </label>
                  <textarea
                    id="customer-reply"
                    value={customerDraft}
                    onChange={(event) => setCustomerDraft(event.target.value)}
                    placeholder="Type how the customer responds…"
                    rows={3}
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 self-end rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300"
                  >
                    <SendIcon />
                    Send reply
                  </button>
                </form>
              )}
            </div>
          </section>

          <aside className="flex flex-col gap-6">
            <div className="rounded-3xl border border-white/10 bg-black/40 p-6 shadow-lg shadow-black/30 backdrop-blur">
              <h3 className="text-lg font-semibold text-white">
                Call configuration
              </h3>
              <p className="text-sm text-slate-300">
                Personalise the agent, goal, and success criteria. The script
                updates instantly.
              </p>

              <div className="mt-4 flex flex-col gap-4 text-sm">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Customer name
                  </span>
                  <input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Company / product
                  </span>
                  <input
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Call objective
                  </span>
                  <textarea
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-white/10 bg-black/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/20"
                  />
                </label>
              </div>

              <div className="mt-6 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                <p className="font-semibold">Script preview</p>
                <p className="mt-2 text-emerald-100/80">
                  {script.length} stages with targeted prompts and expected
                  signals. Toggle manual mode to role-play the customer.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/30 backdrop-blur">
              <h3 className="text-lg font-semibold text-white">Highlights</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-200">
                {highlights.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-3"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/40 p-6 shadow-lg shadow-black/30 backdrop-blur">
              <h3 className="text-lg font-semibold text-white">Playbook</h3>
              <div className="mt-4 space-y-4 text-sm text-slate-200">
                {script.map((step, index) => (
                  <div
                    key={index}
                    className={`rounded-2xl border px-3 py-3 ${
                      index <= currentStep
                        ? "border-emerald-400/50 bg-emerald-500/10"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-300">
                      Stage {index + 1}
                    </p>
                    <p className="mt-1 font-medium text-white">
                      {personalise(step.agent, scenario)}
                    </p>
                    {step.customer && (
                      <p className="mt-2 text-xs text-slate-300">
                        Expected signal: {personalise(step.customer, scenario)}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-slate-400">
                      Coaching: {step.coaching}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TranscriptRow({ message }: { message: Message }) {
  const icon =
    message.role === "agent" ? (
      <Bot className="h-4 w-4 text-emerald-300" />
    ) : message.role === "customer" ? (
      <User className="h-4 w-4 text-sky-300" />
    ) : (
      <Phone className="h-4 w-4 text-slate-300" />
    );

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 ${
        message.role === "agent"
          ? "border-emerald-400/30 bg-emerald-500/10"
          : message.role === "customer"
            ? "border-sky-400/25 bg-sky-500/10"
            : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-200">
        {icon}
        <span>
          {message.role === "agent"
            ? "Agent"
            : message.role === "customer"
              ? "Customer"
              : "System"}
        </span>
        <span className="text-slate-400">
          · {new Date(message.timestamp).toLocaleTimeString()}
        </span>
        {message.meta && (
          <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-slate-200">
            {message.meta}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-slate-100">{message.text}</p>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
    >
      <path
        d="M1.333 14.667 14.667 8 1.333 1.333l1.334 5.334L10 8 2.667 9.333l-1.334 5.334Z"
        fill="currentColor"
      />
    </svg>
  );
}

function createMessage(role: Role, text: string, meta?: string): Message {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    role,
    text,
    timestamp: Date.now(),
    meta,
  };
}

function personalise(input: string, scenario: Scenario): string {
  return input
    .replaceAll("{agent}", scenario.agentName)
    .replaceAll("{customer}", scenario.customerName)
    .replaceAll("{company}", scenario.companyName)
    .replaceAll("{goal}", scenario.goal);
}

function buildScript(scenario: Scenario): ScriptStep[] {
  const focus = deriveFocusPoints(scenario.goal);
  return [
    {
      agent: `Hi {customer}, it's {agent} with {company}. Thanks for picking up — I wanted to talk through ${focus[0]}.`,
      customer:
        "Hey {agent}, sure. What's going on with the system?",
      coaching: "Build trust quickly, reassure it's a value-driven call.",
    },
    {
      agent: `We've been tracking yesterday's production and saw a dip across two strings. Before I run a remote diagnostic, were there any weather or shading changes on your end?`,
      customer: "Not that I noticed. It's been clear skies all week.",
      coaching: "Surface the problem statement and invite context from the customer.",
    },
    {
      agent: `Perfect, that lines up. I can run a health check right now — it'll confirm if the inverter needs a firmware patch or just a reset. It'll only take a moment.`,
      customer: "Sounds good, let's run it.",
      coaching:
        "Explain the workflow in plain language and secure implicit permission.",
    },
    {
      agent: `Results are in. Two panels on the south array are under-producing by about 18%. That usually ties back to the optimizer. I'd like to get a technician on site to swap it so we don't lose more output.`,
      customer: "Yeah, let's book the technician. The sooner the better.",
      coaching: "Translate technical insight into a simple recommendation and drive toward the CTA.",
    },
    {
      agent: `Soonest slot is Thursday at 10am, or we can do Friday afternoon. Which one works better for you?`,
      customer: "Thursday morning works.",
      coaching: "Offer two anchored options so the customer picks a slot.",
    },
    {
      agent: `Locked in for Thursday at 10am. You'll get a confirmation email with the work order and prep checklist. Anything else I can make easier while I have you?`,
      customer: "Nope, that covers it. Thanks for the heads-up.",
      coaching: "Confirm logistics and invite final questions.",
    },
    {
      agent: `Great — I'll send over the summary and keep an eye on production after the visit. Appreciate your time, {customer}!`,
      coaching: "Close with confidence and signal ongoing support.",
    },
  ];
}

function deriveFocusPoints(goal: string): string[] {
  const sentences = goal
    .split(/[.?!]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 8);

  if (sentences.length >= 2) return sentences.slice(0, 3);

  const phrases = goal.split(/,|;|\band\b/gi).map((part) => part.trim());
  const cleaned = phrases.filter((part) => part.length > 8);

  const defaults = [
    "your recent solar production",
    "the array's health check",
    "booking the next technician slot",
  ];

  const merged = [...sentences, ...cleaned, ...defaults];
  return merged.slice(0, 3);
}

function deriveHighlights(messages: Message[], scenario: Scenario): string[] {
  if (!messages.length) {
    return [
      `Personalised ready-to-dial script for ${scenario.customerName}.`,
      "Auto-generated coaching cues for every stage.",
      "Toggle between auto-pilot and manual customer role-play.",
    ];
  }

  const agentLines = messages.filter((msg) => msg.role === "agent");
  const customerLines = messages.filter((msg) => msg.role === "customer");
  const highlights = new Set<string>();

  const bookingConfirmed = agentLines.some((msg) =>
    /locked in|scheduled|confirmed/i.test(msg.text)
  );
  if (bookingConfirmed) {
    highlights.add("Follow-up appointment locked with customer approval.");
  }

  const diagnostics =
    agentLines.find((msg) =>
      /diagnostic|health check|results are in/i.test(msg.text)
    )?.text ?? "";
  if (diagnostics) {
    highlights.add("Agent communicated diagnostic results with clarity.");
  }

  const lastCustomer = customerLines.at(-1);
  if (lastCustomer) {
    highlights.add(
      `Customer responded: “${lastCustomer.text.slice(0, 70)}${
        lastCustomer.text.length > 70 ? "…" : ""
      }”`
    );
  }

  if (!highlights.size) {
    highlights.add("Conversation in progress — transcript capturing live context.");
  }

  return Array.from(highlights);
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function summariseGoal(goal: string): string {
  if (goal.length < 60) return goal;
  return `${goal.slice(0, 57)}…`;
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
