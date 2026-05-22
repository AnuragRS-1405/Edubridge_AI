"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ArrowLeft, Loader2, BrainCircuit } from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { Question, Answer } from "../../types/assessment";
import { submitAssessment } from "../../lib/api";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const SKIPPED_ANSWER = "__SKIPPED__";
const OPTION_KEYS = ["A", "B", "C", "D"] as const;

function normalizeStoredQuestions(value: string): Question[] {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item: any) => {
    const options = item?.options;
    const correctAnswer = String(item?.correct_answer || item?.correctAnswer || "").toUpperCase();

    if (
      typeof item?.question !== "string" ||
      !options ||
      !OPTION_KEYS.every((key) => typeof options[key] === "string" && options[key].trim()) ||
      !OPTION_KEYS.includes(correctAnswer as any)
    ) {
      return [];
    }

    return [{
      question: item.question,
      options: {
        A: options.A,
        B: options.B,
        C: options.C,
        D: options.D,
      },
      skill: String(item.skill || "General"),
      difficulty: (["beginner", "intermediate", "expert"].includes(item.difficulty) ? item.difficulty : "beginner") as Question["difficulty"],
      correct_answer: correctAnswer,
      explanation: item.explanation,
    } as Question];
  });
}

function renderTextWithCode(text: string) {
  const parts = text.split(/```([\s\S]*?)```/g);

  return parts.map((part, index) => {
    if (index % 2 === 1) {
      const code = part.replace(/^\w+\n/, "").trim();

      return (
        <pre key={index} className="my-4 overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-sm text-slate-100">
          <code>{code}</code>
        </pre>
      );
    }

    return part ? <span key={index} className="whitespace-pre-wrap">{part}</span> : null;
  });
}

export default function QuestionsPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedQuestions = sessionStorage.getItem("assessmentQuestions");
    if (!storedQuestions) {
      router.replace("/assess");
      return;
    }
    try {
      const normalizedQuestions = normalizeStoredQuestions(storedQuestions);
      if (normalizedQuestions.length === 0) {
        throw new Error("No valid questions were found.");
      }
      setQuestions(normalizedQuestions);
    } catch (err) {
      console.error("Invalid assessment questions payload:", err);
      setError("Question data was invalid. Please start the assessment again.");
    }
  }, [router]);

  if (questions.length === 0) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        {error ? (
          <>
            <p className="max-w-md text-sm font-medium text-red-700">{error}</p>
            <button
              onClick={() => router.replace("/assess")}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700"
            >
              Restart Assessment
            </button>
          </>
        ) : (
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        )}
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const progressPct = ((currentIndex + 1) / questions.length) * 100;
  const isLast = currentIndex === questions.length - 1;
  const hasRespondedCurrent = answers[currentIndex] !== undefined;
  const hasSkippedCurrent = answers[currentIndex] === SKIPPED_ANSWER;

  const handleSelect = (optionKey: string) => {
    setAnswers((prev: Record<number, string>) => ({ ...prev, [currentIndex]: optionKey }));
  };

  const handleNext = async () => {
    if (!hasRespondedCurrent) return;

    if (isLast) {
      await finishAssessment();
    } else {
      setCurrentIndex((i: number) => i + 1);
    }
  };

  const handleSkip = async () => {
    const nextAnswers = { ...answers, [currentIndex]: SKIPPED_ANSWER };
    setAnswers(nextAnswers);

    if (isLast) {
      await finishAssessment(nextAnswers);
    } else {
      setCurrentIndex((i: number) => i + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i: number) => i - 1);
    }
  };

  const finishAssessment = async (finalAnswers = answers) => {
    setIsSubmitting(true);
    setError("");

    try {
      const sessionId = sessionStorage.getItem("assessmentSessionId");
      const userId = sessionStorage.getItem("userId");

      if (!sessionId || !userId) {
        throw new Error("Session expired. Please start over.");
      }

      // Build Answer payload
      const payloadAnswers: Answer[] = questions.map((q: Question, idx: number) => ({
        question: q.question,
        skill: q.skill,
        difficulty: q.difficulty,
        correct_answer: q.correct_answer,
        user_answer: finalAnswers[idx] || SKIPPED_ANSWER
      }));

      const results = await submitAssessment({
        userId,
        sessionId,
        answers: payloadAnswers
      });

      // Save results
      sessionStorage.setItem("assessmentResults", JSON.stringify(results));
      router.push("/results");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to submit assessment.");
      setIsSubmitting(false);
    }
  };

  if (isSubmitting) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center bg-slate-50 space-y-6">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center animate-pulse">
          <BrainCircuit className="w-10 h-10 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Analyzing Your Results</h2>
        <p className="text-slate-500 max-w-sm text-center">
          Our AI is evaluating your answers across beginner, intermediate, and expert tiers...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 py-12 px-4 sm:px-6 flex flex-col items-center">
      <div className="w-full max-w-3xl mb-8">
        <div className="flex justify-between items-end mb-2">
          <span className="text-sm font-bold text-blue-600 tracking-wide uppercase">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-md border">
            {currentQ.skill} / <span className="capitalize">{currentQ.difficulty}</span>
          </span>
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 transition-all duration-300 rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 leading-snug mb-8">
          {renderTextWithCode(currentQ.question)}
        </h2>

        {hasSkippedCurrent && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
            You skipped this question. Select an option to answer it before submitting, or leave it skipped.
          </div>
        )}

        <div className="space-y-3">
          {OPTION_KEYS.map((key) => {
            const value = currentQ.options[key];
            const isSelected = answers[currentIndex] === key;
            return (
              <button
                key={key}
                onClick={() => handleSelect(key)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border-2 transition-all flex items-start gap-4",
                  isSelected 
                    ? "bg-blue-50 border-blue-600 shadow-sm" 
                    : "bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                )}
              >
                <div className={cn(
                  "w-6 h-6 shrink-0 rounded flex items-center justify-center text-sm font-bold mt-0.5",
                  isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {key}
                </div>
                <div className={cn("text-base", isSelected ? "text-blue-900 font-medium" : "text-slate-700")}>
                  {renderTextWithCode(String(value)) as ReactNode}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="px-6 py-3 text-slate-500 font-medium hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" /> Previous
          </button>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleSkip}
              className="px-6 py-3 rounded-xl border border-slate-300 bg-white text-slate-600 font-bold transition-colors hover:bg-slate-50"
            >
              {isLast ? "Skip & Submit" : "Skip Question"}
            </button>

            <button
              onClick={handleNext}
              disabled={!hasRespondedCurrent}
              className={cn(
                "px-8 py-3 rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2",
                hasRespondedCurrent
                  ? "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-lg"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
              )}
            >
              {isLast ? "Submit Answers" : "Next Question"}
              {!isLast && <ChevronRight className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
