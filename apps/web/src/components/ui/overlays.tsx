/**
 * Overlays système — UI/UX Master Spec §36, §73-76.
 * Règle : Modal = décision · Sheet = action contextuelle mobile ·
 * Drawer = détail contextuel desktop · Toast = confirmation légère.
 * Z-index via tokens (§25). Accessibles : Escape, backdrop, dialog a11y.
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function useDismiss(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Focus management (§109) : capture l'élément focalisé avant ouverture et le
 * restaure à la fermeture ; donne le focus au panneau à l'ouverture.
 */
function useFocusScope(open: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => ref.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, ref]);
}

function Shell({ onBackdrop }: { onBackdrop: () => void }) {
  return (
    <div
      aria-hidden
      onClick={onBackdrop}
      className="absolute inset-0 bg-black/55 backdrop-blur-sm"
    />
  );
}

function Overlay({ open, children }: { open: boolean; children: ReactNode }) {
  const mounted = useMounted();
  if (!mounted) return null;
  if (!open) return null;
  return createPortal(children, document.body);
}

/* ═══════════════ Modal (§33, §73) ═══════════════ */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 440,
  destructive,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  destructive?: boolean;
}) {
  const close = useCallback(() => onClose(), [onClose]);
  useDismiss(close);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusScope(open, dialogRef);
  return (
    <Overlay open={open}>
      <div className="fixed inset-0 z-modal flex items-end justify-center p-4 sm:items-center">
        <Shell onBackdrop={close} />
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "relative z-10 w-full rounded-2xl border border-border bg-surface-elevated p-6 shadow-elevated",
            "backdrop-blur-xl motion-safe:animate-[fadeUp_0.3s_var(--ease-out)]",
            "sm:max-w-[440px]"
          )}
          style={{ maxWidth: width }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className={cn("text-lg font-bold", destructive ? "text-error" : "text-text1")}>
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm text-text2">{description}</p> : null}
            </div>
            <button
              type="button"
              aria-label="Fermer"
              onClick={close}
              className="focus-visible -m-1 rounded-full p-2 text-text-muted hover:bg-surface-hover hover:text-text1"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          {children ? <div className="mt-4">{children}</div> : null}
          {footer ? <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div> : null}
        </div>
      </div>
    </Overlay>
  );
}

/* ═══════════════ BottomSheet (§34, §74) — mobile ═══════════════ */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const close = useCallback(() => onClose(), [onClose]);
  useDismiss(close);
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusScope(open, sheetRef);
  return (
    <Overlay open={open}>
      <div className="fixed inset-0 z-sheet flex items-end sm:hidden">
        <Shell onBackdrop={close} />
        <div
          ref={sheetRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title ?? "Options"}
          className="relative z-10 max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-surface-elevated p-5 pb-[max(env(safe-area-inset-bottom),16px)] shadow-elevated motion-safe:animate-[fadeUp_0.3s_var(--ease-out)]"
        >
          <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong" />
          {title ? <h2 className="mb-3 text-lg font-bold text-text1">{title}</h2> : null}
          {children}
        </div>
      </div>
    </Overlay>
  );
}

/* ═══════════════ Drawer (§35, §75) — desktop ═══════════════ */
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 400,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: number;
}) {
  const close = useCallback(() => onClose(), [onClose]);
  useDismiss(close);
  const drawerRef = useRef<HTMLElement>(null);
  useFocusScope(open, drawerRef);
  return (
    <Overlay open={open}>
      <div className="fixed inset-0 z-drawer hidden sm:block">
        <Shell onBackdrop={close} />
        <aside
          ref={drawerRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title ?? "Détails"}
          className="absolute inset-y-0 right-0 z-10 flex flex-col border-l border-border bg-surface-elevated shadow-elevated motion-safe:animate-[slideIn_0.3s_var(--ease-out)]"
          style={{ width }}
        >
          {title ? (
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-bold text-text1">{title}</h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={close}
                className="focus-visible rounded-full p-2 text-text-muted hover:bg-surface-hover hover:text-text1"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
        </aside>
      </div>
    </Overlay>
  );
}

/* ═══════════════ Toast (§76) ═══════════════ */
export type ToastTone = "success" | "error" | "info" | "neutral";
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

const ToastContext = createContext<{ toast: (t: Omit<ToastItem, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }, 3500);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-toast flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:pr-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex max-w-sm items-start gap-3 rounded-lg border bg-surface-elevated px-4 py-3 shadow-elevated backdrop-blur-xl",
              t.tone === "error" ? "border-error/30" : "border-border"
            )}
          >
            <span aria-hidden className="mt-0.5 text-base">
              {t.tone === "success" ? (
                <CheckIcon className="h-4 w-4 text-success" />
              ) : t.tone === "error" ? (
                <AlertIcon className="h-4 w-4 text-error" />
              ) : (
                <InfoIcon className="h-4 w-4 text-accent-ai" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text1">{t.title}</span>
              {t.description ? <span className="mt-0.5 block text-sm text-text2">{t.description}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé sous <ToastProvider>");
  return ctx;
}