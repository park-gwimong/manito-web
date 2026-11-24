import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

// 화면 공통 기본 요소. 상태가 없어 서버·클라이언트 컴포넌트 어디서든 쓸 수 있다.

type ButtonVariant = "primary" | "soft" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-berry text-white shadow-[0_3px_0_0_var(--color-berry-deep)] active:translate-y-[2px] active:shadow-none",
  soft: "bg-berry-tint text-berry-deep active:bg-paper-deep",
  ghost: "text-ink-soft underline underline-offset-4 active:text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`min-h-12 rounded-pill px-6 text-base font-semibold transition disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <input
        {...props}
        className={`min-h-12 rounded-field border-2 border-line bg-card px-4 text-base text-ink placeholder:text-ink-soft/60 focus:border-berry focus:outline-none ${className}`}
      />
      {hint && <span className="text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

/** 4자리 숫자 PIN. 모바일에서 숫자 키패드가 뜨고 화면에는 가려진다. */
export function PinField(props: { label?: string; name: string; hint?: string; autoFocus?: boolean }) {
  return (
    <Field
      label={props.label ?? "PIN (숫자 4자리)"}
      name={props.name}
      hint={props.hint}
      autoFocus={props.autoFocus}
      type="password"
      inputMode="numeric"
      pattern="\d{4}"
      maxLength={4}
      minLength={4}
      autoComplete="off"
      required
      className="tracking-[0.5em]"
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border-2 border-line bg-card p-5 shadow-lift ${className}`}>{children}</section>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-field bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
      {children}
    </p>
  );
}

/** 모바일 한 손 조작용 화면 틀. 가운데 좁은 기둥, 본문은 왼쪽 정렬. */
export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-8 pb-28 ${className}`}>{children}</main>;
}
