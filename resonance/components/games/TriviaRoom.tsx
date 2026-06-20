"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/api/fetch";
import { createSupabaseTransport } from "@/lib/realtime/supabase-transport";
import type { RealtimeChannel } from "@/lib/realtime/transport";
import { venueTopic } from "@/lib/sync/channels";
import {
  GAME_QUESTION_EVENT,
  GAME_REVEAL_EVENT,
  GAME_END_EVENT,
  type QuestionPayload,
  type RevealPayload,
  type GameScore,
} from "@/lib/games/types";
import { Badge, Button, Card, EmptyState, LiveBadge } from "@/components/ui";
import { cn } from "@/components/ui/cn";

interface Props {
  venueId: string;
  userId: string;
  displayName: string;
}

/**
 * Crowd Trivia surface (§16). Joins the venue's realtime topic and mirrors the
 * server: it shows the open question, takes one answer, then on reveal lights
 * the correct option and renders the scoreboard. The server holds the answer
 * key and decides correctness; this component only displays what it's sent.
 *
 * Host controls show to everyone in dev (real host-gating is a follow-up).
 */
export function TriviaRoom({ venueId, userId, displayName }: Props) {
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [scores, setScores] = useState<GameScore[]>([]);
  // The option this player picked for the current round (null until they answer).
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;
    const transport = createSupabaseTransport();
    void transport
      .join(venueTopic(venueId), {
        onEvent: (e) => {
          if (e.type === GAME_QUESTION_EVENT) {
            setQuestion(e.payload as QuestionPayload);
            setReveal(null);
            setPicked(null);
            setResult(null);
          } else if (e.type === GAME_REVEAL_EVENT) {
            const r = e.payload as RevealPayload;
            setReveal(r);
            setScores(r.scores);
          } else if (e.type === GAME_END_EVENT) {
            setQuestion(null);
            setReveal(null);
            setPicked(null);
            setResult(null);
          }
        },
      })
      .then((ch) => {
        if (cancelled) {
          void ch.leave();
          return;
        }
        channelRef.current = ch;
        void ch.track({ userId, name: displayName, avatar: null });
      })
      .catch(() => {
        /* the next host action will resync everyone */
      });
    return () => {
      cancelled = true;
      void channelRef.current?.leave();
      channelRef.current = null;
    };
  }, [venueId, userId, displayName]);

  const host = useCallback(
    (action: "start" | "next" | "reveal" | "end") =>
      authedFetch(`/api/games/${venueId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    [venueId],
  );

  const answer = useCallback(
    async (choice: number) => {
      if (!question || picked !== null || reveal) return;
      setPicked(choice);
      try {
        const res = await authedFetch(`/api/games/${venueId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: question.questionId, choice }),
        });
        const j = (await res.json()) as { correct?: boolean };
        setResult(j.correct ? "correct" : "wrong");
      } catch {
        setResult(null);
      }
    },
    [venueId, question, picked, reveal],
  );

  const answered = picked !== null;
  const revealed = !!reveal;

  // Round state for the status badge, carried in words as well as color.
  const roundState = !question
    ? "waiting"
    : revealed
      ? "reveal"
      : "open";

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl text-text">Crowd Trivia</h1>
          {question && (
            <p className="text-sm text-mute">Round {question.roundNo}</p>
          )}
        </div>
        {roundState === "open" ? (
          <LiveBadge state="live" />
        ) : roundState === "reveal" ? (
          <Badge tone="signal">Answer revealed</Badge>
        ) : (
          <LiveBadge state="quiet" />
        )}
      </header>

      <Card as="section" padding="md" className="space-y-2">
        <h2 className="text-2xs font-medium uppercase tracking-wide text-mute">
          Host controls
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => void host("start")}>
            Start
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void host("next")}>
            Next
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void host("reveal")}>
            Reveal
          </Button>
          <Button variant="danger" size="sm" onClick={() => void host("end")}>
            End
          </Button>
        </div>
      </Card>

      {!question && (
        <Card padding="none">
          <EmptyState
            icon="?"
            title="No round running"
            description="The host can start one to get the crowd answering."
          />
        </Card>
      )}

      {question && (
        <Card as="section" padding="lg" glow={!revealed} className="space-y-4">
          <p className="font-display text-xl text-text">{question.prompt}</p>
          <ul className="grid gap-2" role="list">
            {question.options.map((opt, i) => {
              const isAnswer = revealed && reveal?.answerIndex === i;
              const isMine = picked === i;
              const locked = answered || revealed;
              // State word, so meaning never rides on color alone (DESIGN.md §8).
              const tag = isAnswer
                ? "Correct answer"
                : isMine && revealed
                  ? "Your pick"
                  : isMine
                    ? "Your answer"
                    : null;
              const letter = String.fromCharCode(65 + i);
              const label = `Option ${letter}: ${opt}${tag ? `. ${tag}` : ""}`;
              return (
                <li key={i}>
                  <button
                    onClick={() => void answer(i)}
                    disabled={locked}
                    aria-pressed={isMine}
                    aria-label={label}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-sm border px-4 py-3 text-left",
                      "min-h-12 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
                      "disabled:cursor-default",
                      isAnswer
                        ? "border-signal bg-signal/15 text-text"
                        : isMine
                          ? "border-pulse bg-pulse/15 text-text"
                          : "bg-raised text-soft hover:bg-hover hover:text-text",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-sm font-medium",
                        isAnswer
                          ? "bg-signal text-base"
                          : isMine
                            ? "bg-pulse text-text"
                            : "bg-surface text-mute",
                      )}
                    >
                      {letter}
                    </span>
                    <span className="min-w-0 flex-1 text-base">{opt}</span>
                    {isAnswer && (
                      <Badge tone="signal" aria-hidden="true">
                        Correct
                      </Badge>
                    )}
                    {isMine && !isAnswer && (
                      <Badge tone="pulse" aria-hidden="true">
                        Your pick
                      </Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {answered && !revealed && result === null && (
            <p className="text-sm text-mute">Answer locked in. Waiting for the reveal.</p>
          )}
          {result === "correct" && (
            <p className="text-sm font-medium text-signal">Correct. You earned Zaps.</p>
          )}
          {result === "wrong" && (
            <p className="text-sm text-mute">Not this time. Hang on for the next round.</p>
          )}
        </Card>
      )}

      {revealed && scores.length > 0 && (
        <Card as="section" padding="lg" className="space-y-3">
          <h2 className="font-display text-lg text-text">Scoreboard</h2>
          <ol className="space-y-1" role="list">
            {scores.map((s, i) => {
              const isYou = s.userId === userId;
              return (
                <li
                  key={s.userId}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm",
                    isYou ? "bg-pulse/15 text-text" : "text-soft",
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className="w-5 shrink-0 tabular-nums text-mute">{i + 1}</span>
                    <span className="truncate">
                      {isYou ? "You" : s.userId.slice(0, 8)}
                    </span>
                  </span>
                  <Badge tone="spark">{s.points} Zaps</Badge>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </section>
  );
}
