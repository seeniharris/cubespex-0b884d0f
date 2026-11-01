import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "primary" | "ghost" | "danger" | "chip" | "chipActive";
const variants: Record<Variant, string> = {
  default: "border border-border bg-secondary text-secondary-foreground hover:bg-accent",
  primary: "bg-primary text-primary-foreground hover:opacity-90 font-semibold",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-accent",
  danger: "border border-destructive/50 text-destructive hover:bg-destructive/10",
  chip: "border border-border text-muted-foreground hover:text-foreground",
  chipActive: "border border-primary bg-primary/15 text-primary",
};

export function Btn({ variant = "default", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-40", variants[variant], className)}
    />
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,button,select,textarea")?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-modal>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl sm:max-w-lg sm:rounded-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Btn variant="ghost" aria-label="Close" onClick={onClose}>✕</Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full border border-border transition-colors", checked ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-0.5 h-4.5 w-4.5 rounded-full bg-foreground transition-all", checked ? "left-5.5 bg-primary-foreground" : "left-0.5")} />
      </button>
    </label>
  );
}

export const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono";
