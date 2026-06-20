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

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>Crowd Trivia</h2>
        {question && <small style={{ color: "#888" }}>Round {question.roundNo}</small>}
      </header>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button onClick={() => void host("start")}>Start</button>
        <button onClick={() => void host("next")}>Next</button>
        <button onClick={() => void host("reveal")}>Reveal</button>
        <button onClick={() => void host("end")}>End</button>
      </div>

      {!question && (
        <p style={{ color: "#888" }}>No round running. The host can start one.</p>
      )}

      {question && (
        <div style={card}>
          <p style={{ fontWeight: 600, fontSize: 18, marginTop: 0 }}>{question.prompt}</p>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {question.options.map((opt, i) => {
              const isAnswer = revealed && reveal?.answerIndex === i;
              const isMine = picked === i;
              const background = isAnswer
                ? "#dcfce7"
                : isMine
                  ? "#e0e7ff"
                  : "#fff";
              const border = isAnswer
                ? "2px solid #16a34a"
                : isMine
                  ? "2px solid #4f46e5"
                  : "1px solid #ccc";
              return (
                <button
                  key={i}
                  onClick={() => void answer(i)}
                  disabled={answered || revealed}
                  style={{
                    textAlign: "left",
                    padding: "0.6rem 0.8rem",
                    borderRadius: 8,
                    border,
                    background,
                    cursor: answered || revealed ? "default" : "pointer",
                  }}
                >
                  {opt}
                  {isAnswer && " ✓"}
                </button>
              );
            })}
          </div>
          {answered && !revealed && result === null && (
            <p style={{ color: "#888", marginBottom: 0 }}>Answer locked in. Waiting for the reveal.</p>
          )}
          {result === "correct" && (
            <p style={{ color: "#16a34a", marginBottom: 0 }}>Correct. You earned Zaps.</p>
          )}
          {result === "wrong" && (
            <p style={{ color: "#888", marginBottom: 0 }}>Not this time. Hang on for the next round.</p>
          )}
        </div>
      )}

      {revealed && scores.length > 0 && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Scoreboard</h3>
          <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {scores.map((s) => (
              <li key={s.userId} style={{ color: s.userId === userId ? "#4f46e5" : "inherit" }}>
                {s.userId === userId ? "You" : s.userId.slice(0, 8)} · {s.points}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "1rem",
};
