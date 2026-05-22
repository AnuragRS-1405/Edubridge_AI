"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ArrowLeft, Loader2, Target, Code, CheckCircle } from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { syncUser, startAssessment } from "../../lib/api";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const INTERESTS = [
  "Data Science", "Web Development", "Machine Learning", "Cloud/DevOps",
  "Business Analysis", "Cybersecurity", "Mobile Development", "Data Engineering"
];

const SKILLS = [
  "Python", "SQL", "JavaScript", "TypeScript", "React", "Machine Learning",
  "Statistics", "Excel", "Docker", "Linux", "Cloud Platforms", "HTML/CSS", "Java", "Rust"
];

const EDUCATION_LEVELS = [
  "High School", "Undergraduate", "Postgraduate", "Professional"
];

function getAuthProvider(user: any) {
  return user.provider || "github";
}

function getOAuthId(user: any) {
  return user.providerAccountId || user.id || user.email || "";
}

function AssessPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRetake = searchParams.get("retake") === "1";

  const [step, setStep] = useState(1);
  const [education, setEducation] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email || isRetake) return;

    const user = session.user;

    async function redirectExistingUser() {
      try {
        const syncRes = await syncUser({
          name: user.name || "Unknown",
          email: user.email || "",
          oauthId: getOAuthId(user),
          provider: getAuthProvider(user)
        });

        sessionStorage.setItem("userId", syncRes.userId);

        if (syncRes.hasSkillProfile) {
          router.replace("/dashboard");
        }
      } catch (err: any) {
        setError(err.message || "Unable to check your saved profile.");
      }
    }

    redirectExistingUser();
  }, [isRetake, router, session, status]);

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const toggleInterest = (interest: string) => {
    setInterests((prev: string[]) => prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]);
  };

  const toggleSkill = (skill: string) => {
    setSkills((prev: string[]) => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);
  };

  const handleBegin = async () => {
    if (!session?.user?.email) return;
    setIsStarting(true);
    setError("");

    try {
      // 1. Sync User
      const syncRes = await syncUser({
        name: session.user.name || "Unknown",
        email: session.user.email,
        oauthId: getOAuthId(session.user),
        provider: getAuthProvider(session.user),
        interests,
        education
      });

      // 2. Start Assessment
      const assessRes = await startAssessment({
        userId: syncRes.userId,
        interests,
        skills
      });

      // 3. Store in sessionStorage
      sessionStorage.setItem("assessmentSessionId", assessRes.sessionId);
      sessionStorage.setItem("assessmentQuestions", JSON.stringify(assessRes.questions));
      sessionStorage.setItem("userId", syncRes.userId);

      // 4. Navigate to Questions
      router.push("/questions");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to start assessment. Please try again.");
      setIsStarting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex flex-col items-center flex-1">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors",
                  step >= s ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
                )}>
                  {s}
                </div>
                <div className="text-xs font-medium text-slate-500 mt-2">
                  {s === 1 && "Background"}
                  {s === 2 && "Skills"}
                  {s === 3 && "Review"}
                </div>
              </div>
            ))}
          </div>
          <div className="relative mt-4">
            <div className="absolute top-1/2 -translate-y-1/2 left-0 h-1 bg-slate-200 w-full rounded-full z-0"></div>
            <div 
              className="absolute top-1/2 -translate-y-1/2 left-0 h-1 bg-blue-600 rounded-full z-10 transition-all duration-300"
              style={{ width: `${((step - 1) / 2) * 100}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-12">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-8 animate-in fade-in">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-2">
                  <Target className="text-blue-600" /> Education & Interests
                </h2>
                <p className="text-slate-500">Tell us about your background to tailor your assessment.</p>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700">Current Education Level</label>
                <select 
                  className="w-full p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                >
                  <option value="" disabled>Select your education level...</option>
                  {EDUCATION_LEVELS.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700">Career Interests (Select at least one)</label>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map(interest => (
                    <button
                      key={interest}
                      onClick={() => toggleInterest(interest)}
                      className={cn(
                        "px-4 py-2 rounded-full border text-sm font-medium transition-all",
                        interests.includes(interest) 
                          ? "bg-blue-600 border-blue-600 text-white shadow-md" 
                          : "bg-white border-slate-300 text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                      )}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in fade-in">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-2">
                  <Code className="text-blue-600" /> Skills You Know
                </h2>
                <p className="text-slate-500">Select the tools and technologies you are familiar with.</p>
              </div>

              <div className="flex flex-wrap gap-3">
                {SKILLS.map(skill => (
                  <button
                    key={skill}
                    onClick={() => toggleSkill(skill)}
                    className={cn(
                      "px-5 py-3 rounded-xl border-2 text-sm font-semibold transition-all",
                      skills.includes(skill) 
                        ? "bg-blue-50 border-blue-600 text-blue-700" 
                        : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"
                    )}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in fade-in">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-2">
                  <CheckCircle className="text-blue-600" /> Ready to Begin
                </h2>
                <p className="text-slate-500">Review your profile before starting the assessment.</p>
              </div>

              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Education</span>
                  <span className="text-slate-900 font-semibold">{education || "Not specified"}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Interests</span>
                  <span className="text-slate-900 font-semibold">{interests.length > 0 ? interests.join(", ") : "None"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Skills</span>
                  <span className="text-slate-900 font-semibold">{skills.length} selected</span>
                </div>
              </div>

              <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 flex gap-4">
                <div className="text-blue-600 shrink-0">
                  <Target className="w-8 h-8" />
                </div>
                <p className="text-sm text-blue-800 leading-relaxed">
                  You will answer <strong>18 questions</strong> — 6 beginner, 6 intermediate, and 6 expert — shuffled randomly. Your overall skill level will be calculated automatically from your performance across these tiers.
                </p>
              </div>
            </div>
          )}

          <div className="mt-12 flex justify-between items-center border-t border-slate-100 pt-6">
            {step > 1 ? (
              <button 
                onClick={() => setStep((s: number) => s - 1)}
                className="px-6 py-3 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-2"
                disabled={isStarting}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            ) : <div></div>}

            {step < 3 ? (
              <button 
                onClick={() => setStep((s: number) => s + 1)}
                disabled={step === 1 && interests.length === 0}
                className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next Step <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button 
                onClick={handleBegin}
                disabled={isStarting}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isStarting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Preparing...</>
                ) : (
                  <>Begin Assessment <ChevronRight className="w-5 h-5" /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    }>
      <AssessPageContent />
    </Suspense>
  );
}
