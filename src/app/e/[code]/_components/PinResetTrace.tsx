/**
 * 본인 홈에 늘 보이는 한 줄. 개설자가 PIN을 초기화한 적이 있으면 닫을 수 없게 남겨,
 * 본인 모르게 다른 사람이 새 PIN으로 들어온 경우를 알아챌 수 있게 한다.
 */
export function PinResetTrace({ resetAtLabel }: { resetAtLabel: string }) {
  return (
    <p className="rounded-field border border-dashed border-line px-4 py-3 text-xs leading-relaxed text-ink-soft">
      이 계정의 PIN은 {resetAtLabel}에 개설자가 초기화했어요. 본인이 요청한 게 아니라면 모임에 알려 주세요.
    </p>
  );
}
