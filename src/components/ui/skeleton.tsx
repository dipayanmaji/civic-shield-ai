import { cn } from "@/lib/utils";

// A neutral placeholder block shown in place of content that is still loading. It is decorative, so wrap
// a group of them in <SkeletonGroup>: assistive technology then hears one "Loading ..." message instead
// of a set of empty shapes. The shimmer stops for people who ask for reduced motion.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-[#e3efea] motion-reduce:animate-none", className)} />;
}

export function SkeletonGroup({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  return (
    <div aria-busy="true" className={className} role="status">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
