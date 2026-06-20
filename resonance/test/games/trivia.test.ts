import { describe, it, expect } from "vitest";
import {
  TRIVIA_QUESTIONS,
  questionById,
  nextQuestion,
  isCorrect,
  publicQuestion,
} from "@/lib/games/trivia";

describe("the question bank", () => {
  it("gives every question a valid, present answer key", () => {
    for (const q of TRIVIA_QUESTIONS) {
      expect(q.answerIndex).not.toBeUndefined();
      expect(q.options).toHaveLength(4);
      expect(q.answerIndex).toBeGreaterThanOrEqual(0);
      expect(q.answerIndex).toBeLessThan(q.options.length);
      expect(q.options[q.answerIndex]).toBeTypeOf("string");
    }
  });

  it("uses unique question ids", () => {
    const ids = TRIVIA_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("questionById", () => {
  it("finds a listed question", () => {
    expect(questionById("q1")?.prompt).toMatch(/closest to the Sun/);
  });
  it("returns undefined for an unknown id", () => {
    expect(questionById("nope")).toBeUndefined();
  });
});

describe("isCorrect", () => {
  it("judges the keyed option correct", () => {
    // q1's answer is index 1 ("Mercury").
    expect(isCorrect("q1", 1)).toBe(true);
  });
  it("rejects a wrong option", () => {
    expect(isCorrect("q1", 0)).toBe(false);
    expect(isCorrect("q1", 3)).toBe(false);
  });
  it("rejects an out-of-range choice", () => {
    expect(isCorrect("q1", 99)).toBe(false);
    expect(isCorrect("q1", -1)).toBe(false);
  });
  it("is false for an unknown question", () => {
    expect(isCorrect("nope", 0)).toBe(false);
  });
});

describe("nextQuestion", () => {
  it("returns the first question on a fresh start", () => {
    expect(nextQuestion(null).id).toBe(TRIVIA_QUESTIONS[0].id);
  });
  it("advances to the following question", () => {
    expect(nextQuestion("q1").id).toBe("q2");
    expect(nextQuestion("q2").id).toBe("q3");
  });
  it("wraps from the last question back to the first", () => {
    const last = TRIVIA_QUESTIONS[TRIVIA_QUESTIONS.length - 1];
    expect(nextQuestion(last.id).id).toBe(TRIVIA_QUESTIONS[0].id);
  });
  it("falls back to the first question for an unknown current id", () => {
    expect(nextQuestion("nope").id).toBe(TRIVIA_QUESTIONS[0].id);
  });
});

describe("publicQuestion", () => {
  it("strips the answer key from the broadcast payload", () => {
    const pub = publicQuestion(TRIVIA_QUESTIONS[0]);
    expect(pub).toEqual({
      questionId: "q1",
      prompt: TRIVIA_QUESTIONS[0].prompt,
      options: TRIVIA_QUESTIONS[0].options,
    });
    expect(pub).not.toHaveProperty("answerIndex");
  });
});
