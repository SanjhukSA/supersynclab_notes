import { useState } from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type { Quiz } from "@/types";

interface QuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  quiz: Quiz | null;
  isLoading: boolean;
  noteTitle: string;
}

export function QuizModal({
  isOpen,
  onClose,
  quiz,
  isLoading,
  noteTitle,
}: QuizModalProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});

  if (!isOpen) return null;

  const questions = quiz?.questions || [];
  const totalQuestions = questions.length;

  const handleSelectOption = (questionIndex: number, optionIndex: number) => {
    if (selectedAnswers[questionIndex] !== undefined) return; // already answered
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionIndex]: optionIndex,
    }));
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const correctCount = questions.reduce((acc, q, idx) => {
    return selectedAnswers[idx] === q.correct_index ? acc + 1 : acc;
  }, 0);

  const handleReset = () => {
    setSelectedAnswers({});
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl border border-border bg-bg-paper p-6 shadow-2xl transition-all max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-text-primary">
                Active-Recall Practice Quiz
              </h3>
              <p className="text-xs text-text-muted">{noteTitle}</p>
              {quiz?.source_note_titles && quiz.source_note_titles.length > 1 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="text-[10px] font-mono text-accent-highlight bg-accent-highlight/10 px-1.5 py-0.5 rounded border border-accent-highlight/20">
                    Synthesized across {quiz.source_note_titles.length} notes: {quiz.source_note_titles.join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {answeredCount > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-raised px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-hover transition-colors"
                title="Restart Quiz"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Restart</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted hover:bg-bg-raised hover:text-text-primary transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
              <p className="font-serif text-sm text-text-secondary">
                Generating active-recall questions from your notes...
              </p>
            </div>
          ) : totalQuestions === 0 ? (
            <div className="py-12 text-center text-sm text-text-muted">
              No questions generated.
            </div>
          ) : (
            <>
              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-text-secondary">
                  <span>
                    Answered: {answeredCount} / {totalQuestions}
                  </span>
                  <span>
                    Score: {correctCount} correct
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full bg-brand-primary transition-all duration-300"
                    style={{
                      width: `${(answeredCount / totalQuestions) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-6">
                {questions.map((q, qIdx) => {
                  const userAnswer = selectedAnswers[qIdx];
                  const isAnswered = userAnswer !== undefined;
                  const isCorrect = userAnswer === q.correct_index;

                  return (
                    <div
                      key={qIdx}
                      className="rounded-xl border border-border bg-bg-surface/60 p-4 shadow-2xs space-y-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 font-serif text-xs font-bold text-brand-primary">
                          {qIdx + 1}
                        </span>
                        <h4 className="font-serif text-sm font-semibold text-text-primary leading-snug">
                          {q.question}
                        </h4>
                      </div>

                      {/* Options */}
                      <div className="grid gap-2 pl-8">
                        {q.options.map((opt, optIdx) => {
                          const isOptionSelected = userAnswer === optIdx;
                          const isOptionCorrect = q.correct_index === optIdx;

                          let btnStyle =
                            "border-border bg-bg-raised text-text-secondary hover:border-brand-primary/60 hover:text-text-primary";

                          if (isAnswered) {
                            if (isOptionCorrect) {
                              btnStyle =
                                "border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-medium";
                            } else if (isOptionSelected) {
                              btnStyle =
                                "border-crimson bg-crimson/15 text-crimson dark:text-rose-300";
                            } else {
                              btnStyle = "opacity-50 border-border bg-bg-paper text-text-muted";
                            }
                          }

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              disabled={isAnswered}
                              onClick={() => handleSelectOption(qIdx, optIdx)}
                              className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left text-xs transition-all ${btnStyle}`}
                            >
                              <span>{opt}</span>
                              {isAnswered && isOptionCorrect && (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                              )}
                              {isAnswered && isOptionSelected && !isOptionCorrect && (
                                <AlertCircle className="h-4 w-4 shrink-0 text-crimson" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation Feedback */}
                      {isAnswered && (
                        <div
                          className={`mt-2 ml-8 rounded-lg border p-3 text-xs leading-relaxed ${
                            isCorrect
                              ? "border-emerald-300/40 bg-emerald-500/5 text-emerald-950 dark:text-emerald-200"
                              : "border-crimson/30 bg-crimson/5 text-stone-900 dark:text-stone-200"
                          }`}
                        >
                          <p className="font-semibold mb-1">
                            {isCorrect ? "✓ Correct!" : "✗ Incorrect"}
                          </p>
                          <p>{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Completion Banner */}
              {answeredCount === totalQuestions && (
                <div className="rounded-xl border border-brand-primary/40 bg-brand-primary/10 p-5 text-center space-y-2">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/20 text-brand-primary mb-1">
                    <Award className="h-6 w-6" />
                  </div>
                  <h4 className="font-serif text-base font-bold text-text-primary">
                    Quiz Completed!
                  </h4>
                  <p className="text-xs text-text-secondary">
                    You scored <strong className="text-brand-primary">{correctCount}</strong> out of {totalQuestions} (
                    {Math.round((correctCount / totalQuestions) * 100)}%).
                  </p>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-secondary transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Try Again</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
