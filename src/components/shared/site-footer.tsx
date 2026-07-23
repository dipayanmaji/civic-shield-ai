import { BriefcaseBusiness, Code2, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";

function InstagramIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current"><path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.5-3.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" /></svg>;
}

function FacebookIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current"><path d="M13.5 22v-8h2.75l.41-3.19H13.5V8.78c0-.92.26-1.55 1.58-1.55h1.69V4.38A22.6 22.6 0 0 0 14.3 4c-2.45 0-4.13 1.5-4.13 4.23v2.58H7.4V14h2.77v8h3.33Z" /></svg>;
}

const team = [
  {
    name: "Dipayan Maji",
    email: "thedipayanmaji@gmail.com",
    github: "https://github.com/dipayanmaji",
    linkedin: "https://www.linkedin.com/in/dipayanmaji/",
  },
  {
    name: "Kusal Laik",
    email: "kushalkg0000@gmail.com",
    github: "https://github.com/kusal002",
    linkedin: "https://www.linkedin.com/in/kusal-laik-16742928a/",
  },
];

export function SiteFooter() {
  return <footer className="border-t border-line bg-[#f7fbf9] px-5 py-10 text-ink lg:px-8">
    <div className="mx-auto grid max-w-7xl gap-8 sm:grid-cols-[1fr_auto]">
      <div>
        <Link href="/" className="inline-flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-white"><ShieldCheck size={17} /></span>
          CivicShield AI
        </Link>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted">A hackathon project for clearer civic reporting, transparent follow-up, and safety-first action.</p>
        <Link href="/moderator" target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-lg text-sm font-bold text-brand underline underline-offset-4 hover:text-[#045548]">Moderator / admin sign in</Link>
        <section className="mt-5">
          <p className="font-display font-bold">Follow CivicShield</p>
          <div className="mt-3 flex gap-2">
            <a className="grid size-9 place-items-center rounded-lg border border-line text-muted transition hover:border-brand hover:text-brand" href="https://www.instagram.com/civicshieldai/" target="_blank" rel="noreferrer" aria-label="CivicShield AI on Instagram" title="CivicShield AI on Instagram"><InstagramIcon /></a>
            <a className="grid size-9 place-items-center rounded-lg border border-line text-muted transition hover:border-brand hover:text-brand" href="https://www.facebook.com/civicshieldai/" target="_blank" rel="noreferrer" aria-label="CivicShield AI on Facebook" title="CivicShield AI on Facebook"><FacebookIcon /></a>
          </div>
        </section>
      </div>
      <div className="space-y-5">
        {team.map((member) => <section key={member.email}>
          <p className="font-display font-bold">{member.name.split(" ")[0]}</p>
          <div className="mt-3 flex gap-2">
            <a className="grid size-9 place-items-center rounded-lg border border-line text-muted transition hover:border-brand hover:text-brand" href={`mailto:${member.email}`} aria-label={`Email ${member.name}`} title={`Email ${member.name}`}><Mail size={16} /></a>
            <a className="grid size-9 place-items-center rounded-lg border border-line text-muted transition hover:border-brand hover:text-brand" href={member.github} target="_blank" rel="noreferrer" aria-label={`${member.name} on GitHub`} title={`${member.name} on GitHub`}><Code2 size={16} /></a>
            <a className="grid size-9 place-items-center rounded-lg border border-line text-muted transition hover:border-brand hover:text-brand" href={member.linkedin} target="_blank" rel="noreferrer" aria-label={`${member.name} on LinkedIn`} title={`${member.name} on LinkedIn`}><BriefcaseBusiness size={16} /></a>
          </div>
        </section>)}
      </div>
    </div>
    <p className="mx-auto mt-8 max-w-7xl border-t border-line pt-5 text-center text-xs text-muted">© {new Date().getFullYear()} CivicShield AI. Built for the hackathon. Demo purpose only, and not a replacement for emergency services or government authorities.</p>
  </footer>;
}
