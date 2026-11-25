import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

// 화면 공통 기본 요소. 상태가 없어 서버·클라이언트 컴포넌트 어디서든 쓸 수 있다.

type ButtonVariant = "primary" | "soft" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-berry text-white shadow-glow transition hover:brightness-110 active:scale-[0.97]",
  soft: "bg-berry-tint text-berry-deep hover:brightness-95 active:scale-[0.97]",
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
        className={`min-h-13 rounded-field border border-line bg-card px-4 text-base text-ink transition placeholder:text-ink-soft/60 focus:border-berry focus:ring-4 focus:ring-berry/15 focus:outline-none ${className}`}
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
    <section className={`rounded-card border border-line bg-card p-5 shadow-lift ${className}`}>{children}</section>
  );
}

/** 고칠 곳이 여러 개일 때 한 번에 보여 주는 목록. */
export function ProblemList({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <ul role="alert" className="flex list-disc flex-col gap-1 rounded-field bg-danger-tint py-3 pr-4 pl-8 text-sm font-medium text-danger">
      {problems.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
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
  return <main className={`mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(7rem+env(safe-area-inset-bottom))] lg:max-w-xl lg:pt-12 lg:pb-16 ${className}`}>{children}</main>;
}

// 사람마다 다른 색 스티커. 이름으로 정해지므로 어느 화면에서나 같은 색이다.
const STICKER_COLORS = [
  { bg: "#f6e4ef", fg: "#6d2357" },
  { bg: "#fff3c9", fg: "#6b4e00" },
  { bg: "#dff3ea", fg: "#1f5c45" },
  { bg: "#e1eefb", fg: "#1f4a7a" },
  { bg: "#ffe3d3", fg: "#8a3b12" },
  { bg: "#e9e4fb", fg: "#44358a" },
];

/** 이름 첫 글자를 담은 동그란 스티커. 장식이라 스크린리더에는 읽히지 않는다(옆에 이름이 있다). */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 997;
  const color = STICKER_COLORS[hash % STICKER_COLORS.length];
  const box = size === "lg" ? "h-14 w-14 text-2xl" : size === "sm" ? "h-8 w-8 text-sm" : "h-10 w-10 text-lg";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-display ${box}`}
      style={{ backgroundColor: color.bg, color: color.fg }}
    >
      {Array.from(name.trim())[0] ?? "?"}
    </span>
  );
}

/** 화면 맨 위에 두는 돌아가기 링크. 메뉴가 없는 화면이 막다른 길이 되지 않게 한다. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2 flex min-h-11 items-center gap-1 self-start rounded-field px-2 text-sm font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink"
    >
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  );
}

/** 화면 안의 구역 제목. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-xl text-ink">{children}</h2>;
}
