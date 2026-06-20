/**
 * Crowd Trivia question bank + pure helpers (§16).
 *
 * SERVER-ONLY answer key. Import this only from server code (routes, repo).
 * The `answerIndex` on each question is the secret the server checks against;
 * clients receive prompts and options, never the index, until the host reveals.
 */

import type { TriviaQuestion } from "./types";

/** The bank. Each question has exactly four options. */
export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    id: "q1",
    prompt: "Which planet is the closest to the Sun?",
    options: ["Venus", "Mercury", "Mars", "Earth"],
    answerIndex: 1,
  },
  {
    id: "q2",
    prompt: "What is the largest ocean on Earth?",
    options: ["Atlantic", "Indian", "Arctic", "Pacific"],
    answerIndex: 3,
  },
  {
    id: "q3",
    prompt: "How many strings does a standard guitar have?",
    options: ["Four", "Five", "Six", "Seven"],
    answerIndex: 2,
  },
  {
    id: "q4",
    prompt: "Which gas do plants take in for photosynthesis?",
    options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"],
    answerIndex: 1,
  },
  {
    id: "q5",
    prompt: "What is the capital of Japan?",
    options: ["Seoul", "Beijing", "Tokyo", "Bangkok"],
    answerIndex: 2,
  },
  {
    id: "q6",
    prompt: "Which metal is liquid at room temperature?",
    options: ["Mercury", "Lead", "Iron", "Tin"],
    answerIndex: 0,
  },
  {
    id: "q7",
    prompt: "How many sides does a hexagon have?",
    options: ["Five", "Six", "Seven", "Eight"],
    answerIndex: 1,
  },
  {
    id: "q8",
    prompt: "Which artist painted the Mona Lisa?",
    options: ["Van Gogh", "Picasso", "Da Vinci", "Rembrandt"],
    answerIndex: 2,
  },
  {
    id: "q9",
    prompt: "What is the chemical symbol for gold?",
    options: ["Gd", "Au", "Ag", "Go"],
    answerIndex: 1,
  },
  {
    id: "q10",
    prompt: "How many minutes are in a full day?",
    options: ["1200", "1440", "2400", "960"],
    answerIndex: 1,
  },
];

/** Look up a question by id (server-side). */
export function questionById(id: string): TriviaQuestion | undefined {
  return TRIVIA_QUESTIONS.find((q) => q.id === id);
}

/**
 * Pick the question that follows `currentId` in the bank, wrapping to the start.
 * With no current question (a fresh start), returns the first one.
 */
export function nextQuestion(currentId: string | null): TriviaQuestion {
  if (!currentId) return TRIVIA_QUESTIONS[0];
  const i = TRIVIA_QUESTIONS.findIndex((q) => q.id === currentId);
  if (i < 0) return TRIVIA_QUESTIONS[0];
  return TRIVIA_QUESTIONS[(i + 1) % TRIVIA_QUESTIONS.length];
}

/** True when `choice` is the correct option for `questionId`. Server-only. */
export function isCorrect(questionId: string, choice: number): boolean {
  const q = questionById(questionId);
  return !!q && q.answerIndex === choice;
}

/** Strip the answer for safe broadcast: prompt + options, no index. */
export function publicQuestion(q: TriviaQuestion): {
  questionId: string;
  prompt: string;
  options: string[];
} {
  return { questionId: q.id, prompt: q.prompt, options: q.options };
}
