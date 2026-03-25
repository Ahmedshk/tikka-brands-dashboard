import { useState, useEffect, FormEvent } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Spinner } from "../../components/common/Spinner";
import MainLogo from "@assets/logos/main_logo.svg?react";
import { reviewService } from "../../services/review.service";
import type { QuestionResponse } from "../../types/review.types";
import { getResponseMessageFromError } from "../../utils/apiErrorHelpers";
import { ReviewQuestionAttachmentLinks } from "../../components/ReviewSettings/ReviewQuestionAttachmentLinks";

type QuestionnaireItem = {
  id: string;
  text: string;
  type: string;
  required: boolean;
  order: number;
  options?: string[];
  attachments?: Array<{
    publicId: string;
    resourceType: "image" | "raw";
    filename?: string;
    format?: string;
    url?: string;
  }>;
};

type PageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | { status: "ready"; questionnaire: QuestionnaireItem[]; employeeName: string; alreadySubmitted: boolean }
  | { status: "submitted" };

export const SelfReviewByToken = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<PageState>({ status: "idle" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token?.trim()) {
      setState({ status: "invalid", message: "This link is invalid or missing." });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    reviewService
      .getSelfReviewByToken(token)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setState({ status: "invalid", message: "This link is invalid or has expired." });
          return;
        }
        if (data.alreadySubmitted) {
          setState({
            status: "ready",
            questionnaire: data.questionnaire,
            employeeName: data.employeeName,
            alreadySubmitted: true,
          });
        } else {
          setState({
            status: "ready",
            questionnaire: data.questionnaire,
            employeeName: data.employeeName,
            alreadySubmitted: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "invalid", message: "This link is invalid or has expired." });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (state.status !== "ready" || state.alreadySubmitted || !token) return;
    const questions = state.questionnaire;
    const missing = questions.filter((q) => q.required && !answers[q.id]?.trim());
    if (missing.length > 0) {
      setSubmitError(`Please answer all required questions (${missing.length} remaining).`);
      return;
    }
    setSubmitError("");
    setSubmitting(true);
    try {
      const responses: QuestionResponse[] = questions.map((q) => ({
        questionId: q.id,
        questionText: q.text,
        answer: answers[q.id] ?? "",
      }));
      await reviewService.submitSelfReviewByToken(token, responses);
      setState({ status: "submitted" });
    } catch (err) {
      setSubmitError(getResponseMessageFromError(err) ?? "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-6 max-w-md w-full">
          <Spinner size="lg" className="text-button-primary" />
          <p className="text-primary text-sm">Loading your self-review form…</p>
        </div>
      </div>
    );
  }

  if (state.status === "invalid") {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow border border-gray-200 w-full max-w-md p-6 text-center">
          <p className="text-primary mb-4">{state.message}</p>
          <Link to="/login" className="text-button-primary font-medium hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  if (state.status === "submitted") {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow border border-gray-200 w-full max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold text-primary mb-2">Thank you</h1>
          <p className="text-primary text-sm">Your self-review has been submitted successfully.</p>
        </div>
      </div>
    );
  }

  const { questionnaire, employeeName, alreadySubmitted } = state;
  const sortedQuestions = [...questionnaire].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow border border-gray-200 w-full max-w-2xl overflow-hidden">
        <div className="bg-[#5B6B79] text-white px-6 py-4 text-center">
          <MainLogo className="h-10 w-auto mx-auto mb-2 text-white" aria-hidden />
          <h1 className="text-lg font-semibold">Tikka Brands Dashboard</h1>
          <p className="text-sm opacity-90 mt-1">Self-Review</p>
        </div>
        <div className="p-6">
          <p className="text-primary text-sm mb-4">
            Hi {employeeName}. Please complete your self-review below.
          </p>

          {alreadySubmitted ? (
            <p className="text-primary text-sm text-green-700 bg-green-50 p-3 rounded-lg">
              You have already submitted this self-review. Thank you.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {submitError && (
                <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{submitError}</div>
              )}
              {sortedQuestions.map((q) => (
                <div key={q.id} className="space-y-1">
                  <label className="text-sm font-medium text-primary block">
                    {q.text} {q.required && <span className="text-red-500">*</span>}
                  </label>
                  <ReviewQuestionAttachmentLinks attachments={q.attachments} selfReviewToken={token ?? undefined} />
                  {q.type === "text" && (
                    <textarea
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20"
                    />
                  )}
                  {q.type === "rating" && (
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAnswers({ ...answers, [q.id]: String(v) })}
                          className={`w-10 h-10 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                            answers[q.id] === String(v)
                              ? "bg-button-primary text-white border-button-primary"
                              : "bg-white border-gray-200 hover:border-gray-400"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                  {q.type === "multiple_choice" && (
                    <div className="space-y-1">
                      {(q.options ?? []).map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name={q.id}
                            value={opt}
                            checked={answers[q.id] === opt}
                            onChange={() => setAnswers({ ...answers, [q.id]: opt })}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  )}
                  {q.type === "yes_no" && (
                    <div className="flex gap-3">
                      {["Yes", "No"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setAnswers({ ...answers, [q.id]: v })}
                          className={`px-4 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                            answers[q.id] === v
                              ? "bg-button-primary text-white border-button-primary"
                              : "bg-white border-gray-200 hover:border-gray-400"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-button-primary text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit Self-Review"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
