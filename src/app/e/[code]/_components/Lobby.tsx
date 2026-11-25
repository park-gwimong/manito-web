"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Button, Card, GuideLink, Screen } from "../../../_components/ui";
import { StartNowButton } from "./OrganizerControls";
import { PinResetTrace } from "./PinResetTrace";

type Props = {
  code: string;
  eventName: string;
  startsAtLabel: string;
  participants: { id: string; name: string; isOrganizer: boolean }[];
  meId: string;
  isOrganizer: boolean;
  startMissed: boolean;
  minParticipants: number;
  /** 개설자가 내 PIN을 초기화한 적 있으면 그 시각(KST 표기), 없으면 null. */
  pinResetAtLabel: string | null;
};

export function Lobby(props: Props) {
  const count = props.participants.length;
  const short = count < props.minParticipants;

  return (
    <Screen>
      <header className="flex flex-col gap-2">
        <p className="text-sm text-ink-soft">{props.startsAtLabel}에 시작해요</p>
        <h1 className="font-display text-4xl leading-tight text-ink">{props.eventName}</h1>
      </header>

      {props.pinResetAtLabel && <PinResetTrace resetAtLabel={props.pinResetAtLabel} />}

      {props.startMissed ? (
        <p role="status" className="rounded-field bg-danger-tint px-4 py-3 text-sm leading-relaxed text-danger">
          시작 시각에 인원이 모자라 아직 시작하지 못했어요.{" "}
          {props.isOrganizer ? (
            <>
              시작 일시를 다시 정해 주세요.{" "}
              <Link href={`/e/${props.code}/settings`} className="font-semibold underline underline-offset-4">
                설정으로 가기
              </Link>
            </>
          ) : (
            "개설자가 시작 일시를 다시 정할 때까지 기다려 주세요."
          )}
        </p>
      ) : (
        <p className="leading-relaxed text-ink-soft">
          시작 시각이 되면 마니또가 자동으로 정해져요. 그때까지 친구들을 불러 주세요.
        </p>
      )}

      <InviteTicket code={props.code} />

      {props.isOrganizer && !props.startMissed && (
        <Link
          href={`/e/${props.code}/settings`}
          className="flex min-h-12 items-center justify-between rounded-field border border-line bg-card px-4 font-semibold text-ink shadow-lift"
        >
          일정과 미션 고치기
          <span className="text-sm font-medium text-ink-soft">설정으로 가기</span>
        </Link>
      )}

      {props.isOrganizer && <StartNowButton code={props.code} count={count} min={props.minParticipants} />}

      <Card className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl">입장한 사람</h2>
          <span className="text-sm font-semibold text-ink-soft">{count}명</span>
        </div>
        <ul className="flex flex-wrap gap-2">
          {props.participants.map((p) => (
            <li
              key={p.id}
              className={`rounded-pill border px-3.5 py-1.5 text-sm font-medium ${
                p.id === props.meId ? "border-sun bg-sun-tint" : "border-line bg-paper"
              }`}
            >
              {p.name}
              {p.isOrganizer && <span className="ml-1.5 text-xs text-berry">개설자</span>}
              {p.id === props.meId && <span className="ml-1.5 text-xs text-ink-soft">나</span>}
            </li>
          ))}
        </ul>
        {short && (
          <p className="text-sm text-ink-soft">
            {props.minParticipants}명부터 시작할 수 있어요. {props.minParticipants - count}명 더 필요해요.
          </p>
        )}
      </Card>
      <GuideLink />
    </Screen>
  );
}

/** 초대장. 이벤트 코드를 크게 보여 주고 링크를 복사한다. */
const noSubscribe = () => () => {};

function InviteTicket({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  // 휴대폰에는 공유 시트(메신저로 바로 보내기)가 있다. 서버에서는 알 수 없으니 화면에 붙은 뒤에 확인한다.
  const canShare = useSyncExternalStore(
    noSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );

  async function share() {
    try {
      await navigator.share({
        title: "마니또 초대",
        text: "마니또에 초대할게요. 링크로 들어와 이름과 PIN을 정해 주세요.",
        url: `${window.location.origin}/e/${code}`,
      });
    } catch {
      // 공유를 취소한 경우. 아무것도 하지 않는다.
    }
  }

  async function copy() {
    const url = `${window.location.origin}/e/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("이 링크를 복사해 친구들에게 보내 주세요.", url);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-card bg-berry p-5 text-white">
      {/* 초대장 가장자리의 뜯는 선 */}
      <span aria-hidden="true" className="absolute top-1/2 -left-3 h-6 w-6 -translate-y-1/2 rounded-full bg-paper" />
      <span aria-hidden="true" className="absolute top-1/2 -right-3 h-6 w-6 -translate-y-1/2 rounded-full bg-paper" />
      <p className="text-sm text-white/80">초대 코드</p>
      <p className="font-display text-4xl tracking-[0.15em] text-sun">{code}</p>
      <div className="my-4 border-t border-dashed border-white/30" />
      <div className="flex flex-col gap-2">
        {canShare && (
          <button
            type="button"
            onClick={share}
            className="min-h-12 w-full rounded-pill bg-sun px-6 font-semibold text-sun-ink transition active:scale-[0.97]"
          >
            초대 링크 보내기
          </button>
        )}
        <Button type="button" variant="soft" onClick={copy} className="w-full" aria-live="polite">
          {copied ? "링크를 복사했어요" : "초대 링크 복사하기"}
        </Button>
      </div>
    </section>
  );
}
