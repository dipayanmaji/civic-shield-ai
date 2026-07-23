import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  PhoneCall,
  Radar,
  Route,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Venus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CivicSenseFab } from "@/components/landing/civic-sense-fab";
import { FeedbackSection } from "@/components/landing/feedback-section";
import { LocationSafetySnapshot } from "@/components/landing/location-safety-snapshot";
import { QuickIncidentRecordSlot } from "@/components/landing/quick-incident-record-slot";
import { PwaInstallButton } from "@/components/shared/pwa-install-button";

const civicSteps = [
  {
    number: "01",
    title: "Describe what happened",
    detail: "Use your own words. We turn the details into a structured civic report.",
  },
  {
    number: "02",
    title: "Understand the risk",
    detail: "See issue category, urgency, and practical safety-first next steps.",
  },
  {
    number: "03",
    title: "Create accountable action",
    detail: "Review a department-ready complaint and follow the report’s resolution status.",
  },
];

export default function Home() {
  return (
    <main className="overflow-hidden bg-canvas text-ink">
      <div className="border-b border-[#d9e6e1] bg-[#eff7f4] px-4 py-2.5 text-center text-xs font-medium text-[#31544b] sm:text-sm">
        In immediate danger? Call India&apos;s unified emergency number
        <a className="ml-1.5 font-bold text-brand underline underline-offset-4" href="tel:112">
          112
        </a>
      </div>

      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <Link className="flex items-center gap-2.5" href="/" aria-label="CivicShield AI home">
          <span className="grid size-10 place-items-center rounded-xl bg-brand text-white shadow-sm">
            <ShieldCheck aria-hidden="true" size={21} strokeWidth={2.4} />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">CivicShield AI</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium text-muted md:flex" aria-label="Main navigation">
          <a className="transition-colors hover:text-brand" href="#services">
            Services
          </a>
          <a className="transition-colors hover:text-brand" href="#how-it-works">
            How it works
          </a>
          <a className="transition-colors hover:text-brand" href="#trust">
            Why CivicShield
          </a>
          <Link className="transition-colors hover:text-brand" href="/dashboard">Public dashboard</Link>
          <Link className="transition-colors hover:text-brand" href="/moderator" target="_blank" rel="noreferrer">Moderator sign in</Link>
        </nav>

        <div className="flex items-center gap-2">
          <PwaInstallButton />
          <Button asChild className="hidden sm:inline-flex" size="sm">
            <Link href="/report">Start a report</Link>
          </Button>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-8 px-5 pb-16 pt-8 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:pb-20 lg:pt-12">
        <div className="grid gap-4 lg:col-span-2 lg:grid-cols-[1.05fr_.55fr] lg:items-stretch">
          <QuickIncidentRecordSlot />
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 lg:grid-rows-3">
            <Button asChild className="h-full min-h-20 px-5 text-base sm:text-lg" size="lg"><Link href="/report">Report a civic issue <ArrowRight aria-hidden="true" size={19} /></Link></Button>
            <Button asChild className="h-full min-h-20 px-5 text-base sm:text-lg" size="lg" variant="outline"><Link href="/emergency"><Siren aria-hidden="true" size={19} /> I need emergency help</Link></Button>
            <Link className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-[#f0c6d8] bg-[#fff7fb] px-5 text-center text-base font-bold text-[#9b2755] transition hover:bg-[#ffeaf3] sm:text-lg" href="/emergency?type=women"><Venus aria-hidden="true" size={19} /> Women safety</Link>
          </div>
        </div>
        <div className="relative z-10 max-w-3xl lg:pl-4">
          <Badge className="gap-1.5" tone="safe">
            <Sparkles aria-hidden="true" size={13} />
            AI-assisted civic action
          </Badge>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-[-0.04em] text-ink sm:text-5xl lg:text-6xl">
            Feel safer when you <span className="text-brand">enter a new place.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted sm:text-xl">
            CivicShield checks nearby civic complaints and emergency signals, then helps citizens, women, and minors act quickly with location-aware safety support.
          </p>
          <div className="mt-5 rounded-2xl border border-[#cfe6dd] bg-[#f8fdfb] p-4 text-sm leading-6 text-[#31544b]">
            <p className="font-bold">At home or somewhere new, you can always reach CivicShield.</p>
            <p className="mt-1">
              We help you understand nearby risks, find the right emergency support, and raise a clear complaint without wasting time.
            </p>
          </div>

          <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-muted">
            <CheckCircle2 aria-hidden="true" className="text-brand" size={16} />
            Clear guidance. Citizen-approved action. No false closure claims.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-lg lg:pt-0">
          <div className="absolute -right-16 top-14 -z-10 size-56 rounded-full bg-[#d9f1e8] blur-3xl" />
          <LocationSafetySnapshot />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8 lg:pb-28">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-stretch">
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8">
            <p className="eyebrow">Your city safety layer</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">A quiet safety check before you move.</h2>
            <p className="mt-4 leading-7 text-muted">
              CivicShield reads nearby reports like a local pulse: civic hazards, urgent incidents, women-safety signals, and safer public places.
            </p>
            <div className="mt-6 grid gap-3">
              <StoryPoint icon={<MapPin aria-hidden="true" size={17} />} title="Detect where you are" detail="Current area appears first, not raw coordinates." />
              <StoryPoint icon={<Radar aria-hidden="true" size={17} />} title="Scan recent signals" detail="Last 24 hours of nearby reports shape the warning." />
              <StoryPoint icon={<Venus aria-hidden="true" size={17} />} title="Protect vulnerable users" detail="Women and minors get quick access to police, safer public places, and emergency logging." />
            </div>
          </div>

          <div className="relative min-h-96 overflow-hidden rounded-3xl border border-[#cfe6dd] bg-[#eef8f4] p-5 shadow-surface sm:p-7">
            <div className="absolute inset-0 opacity-70 bg-[linear-gradient(#cfe2dc_1px,transparent_1px),linear-gradient(90deg,#cfe2dc_1px,transparent_1px)] bg-size-[42px_42px]" />
            <div className="absolute left-8 top-8 rounded-2xl border border-[#cfe6dd] bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand">Current location</p>
              <p className="mt-1 text-sm font-bold">New area detected</p>
            </div>
            <div className="absolute right-8 top-10 rounded-2xl border border-[#f0c6d8] bg-[#fff7fb] px-4 py-3 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9b2755]">Women safety</p>
              <p className="mt-1 text-sm font-bold">Police nearby</p>
            </div>
            <div className="absolute bottom-8 left-8 rounded-2xl border border-[#efc7bf] bg-[#fff8f6] px-4 py-3 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-danger">Recent alert</p>
              <p className="mt-1 text-sm font-bold">Unsafe area report</p>
            </div>
            <div className="absolute bottom-10 right-10 rounded-2xl border border-[#ead9b8] bg-[#fffaf0] px-4 py-3 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-warning">Civic risk</p>
              <p className="mt-1 text-sm font-bold">Waterlogging</p>
            </div>

            <div className="absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/20" />
            <div className="absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/30" />
            <div className="absolute left-1/2 top-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-3xl bg-brand text-white shadow-surface">
              <ShieldCheck aria-hidden="true" size={34} />
            </div>

            <div className="absolute left-[31%] top-[38%] h-1 w-24 -rotate-12 rounded-full bg-brand/30" />
            <div className="absolute right-[30%] top-[42%] h-1 w-28 rotate-12 rounded-full bg-[#a22a58]/25" />
            <div className="absolute bottom-[36%] left-[32%] h-1 w-28 rotate-28 rounded-full bg-danger/25" />
            <div className="absolute bottom-[38%] right-[31%] h-1 w-24 rotate-[-28deg] rounded-full bg-warning/30" />

            <div className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-xs font-bold text-muted shadow-sm">
              <Route aria-hidden="true" size={14} /> Route-aware safety check
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="border-y border-line bg-surface/70 px-5 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="eyebrow">Choose the right path</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Three services. One safety-first principle.</h2>
            <p className="mt-4 text-lg leading-8 text-muted">
              Select the path that matches your situation. CivicShield makes the difference clear from the first screen.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            <ServiceCard
              href="/report"
              icon={<MapPin aria-hidden="true" size={25} />}
              label="For a civic issue"
              title="Report a problem that needs attention"
              description="For sanitation, roads, drainage, streetlights, water leakage, unsafe public spaces, and infrastructure concerns."
              action="Start a civic report"
              points={["AI-assisted issue classification", "Formal complaint draft", "Transparent resolution tracking"]}
              tone="civic"
            />
            <ServiceCard
              href="/emergency"
              icon={<ShieldAlert aria-hidden="true" size={25} />}
              label="For immediate danger"
              title="Get emergency help without delay"
              description="For fire, serious injury, exposed live wiring, collapse, violence, or any situation where safety is at immediate risk."
              action="Open emergency help"
              points={["Call 112 is always the first action", "Instant safety checklist", "Optional follow-up hazard report"]}
              tone="emergency"
            />
            <ServiceCard
              href="/emergency?type=women"
              icon={<Venus aria-hidden="true" size={25} />}
              label="For women safety"
              title="Find nearby police and safer public places"
              description="For harassment, stalking, unsafe travel, suspicious surroundings, or when a woman needs fast location-aware help."
              action="Open women safety"
              points={["Nearby police stations", "Crowded safer public places", "Quick women safety incident note"]}
              tone="women"
            />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">From observation to accountable action.</h2>
          </div>
          <p className="max-w-xl text-lg leading-8 text-muted">
            No complicated department forms. Begin with what you saw, then review every important action before it happens.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {civicSteps.map((step) => (
            <article key={step.number} className="rounded-2xl border border-line bg-surface p-6">
              <span className="font-display text-sm font-bold text-brand">{step.number}</span>
              <h3 className="mt-9 font-display text-xl font-bold tracking-tight">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{step.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="trust" className="mx-5 mb-20 rounded-4xl bg-[#133a33] px-6 py-10 text-white sm:mx-8 sm:px-10 lg:mx-auto lg:max-w-7xl lg:px-14 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9ed8c6]">Built for honest accountability</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">A case is not “solved” just because someone says it is.</h2>
            <p className="mt-4 text-base leading-7 text-[#c6ddd6]">
              CivicShield separates an authority&apos;s closure update from community verification—so citizens can confirm, dispute, or reopen a report based on what actually happened on the ground.
            </p>
          </div>
          <div className="flex min-w-52 items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-[#a7e4d1] text-[#0a4c40]">
              <CheckCircle2 aria-hidden="true" size={21} />
            </span>
            <div>
              <p className="text-sm font-semibold">Community verified</p>
              <p className="mt-0.5 text-xs text-[#c6ddd6]">The standard for resolution</p>
            </div>
          </div>
        </div>
      </section>
      <FeedbackSection />
      <CivicSenseFab />
    </main>
  );
}

function StoryPoint({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-line bg-[#fbfdfc] p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">{icon}</span>
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{detail}</p>
      </div>
    </div>
  );
}

function ServiceCard({
  href,
  icon,
  label,
  title,
  description,
  action,
  points,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  title: string;
  description: string;
  action: string;
  points: string[];
  tone: "civic" | "emergency" | "women";
}) {
  const isEmergency = tone === "emergency";
  const isWomenSafety = tone === "women";

  return (
    <article
      className={`group relative overflow-hidden rounded-3xl border p-7 transition duration-300 hover:-translate-y-1 hover:shadow-surface sm:p-8 ${
        isEmergency
          ? "border-[#efd5cf] bg-[#fffaf8]"
          : isWomenSafety
            ? "border-[#f0c6d8] bg-[#fff7fb]"
            : "border-[#cfe6dd] bg-[#f8fdfb]"
      }`}
    >
      <div className={`grid size-12 place-items-center rounded-2xl ${
        isEmergency ? "bg-[#ffe5de] text-danger" : isWomenSafety ? "bg-[#ffe4f0] text-[#a22a58]" : "bg-brand-soft text-brand"
      }`}>
        {icon}
      </div>
      <p className={`mt-7 text-xs font-bold uppercase tracking-[0.12em] ${isEmergency ? "text-danger" : isWomenSafety ? "text-[#a22a58]" : "text-brand"}`}>{label}</p>
      <h3 className="mt-2 max-w-md font-display text-2xl font-bold tracking-tight">{title}</h3>
      <p className="mt-3 max-w-xl leading-7 text-muted">{description}</p>
      <ul className="mt-6 space-y-2.5 text-sm text-[#426058]">
        {points.map((point) => (
          <li key={point} className="flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" className={isEmergency ? "text-danger" : "text-brand"} size={16} />
            {point}
          </li>
        ))}
      </ul>
      <Button asChild className={`mt-8 ${isWomenSafety ? "bg-[#a22a58] hover:bg-[#872047]" : ""}`} variant={isEmergency ? "danger" : "primary"}>
        <Link href={href}>
          {isEmergency && <PhoneCall aria-hidden="true" size={16} />}
          {action} <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </Button>
    </article>
  );
}
