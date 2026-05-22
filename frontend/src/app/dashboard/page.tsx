"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { BarChart3, Loader2, RefreshCw, Trophy } from "lucide-react";
import { syncUser } from "../../lib/api";
import { SkillProfile } from "../../types/assessment";

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-blue-100 text-blue-800 border-blue-200",
  intermediate: "bg-amber-100 text-amber-800 border-amber-200",
  advanced: "bg-emerald-100 text-emerald-800 border-emerald-200",
  professional: "bg-purple-100 text-purple-800 border-purple-200"
};

function mapToRecord<T>(value: Record<string, T> | Map<string, T> | undefined): Record<string, T> {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return value;
}

function getAuthProvider(user: any) {
  return user.provider || "github";
}

function getOAuthId(user: any) {
  return user.providerAccountId || user.id || user.email || "";
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<SkillProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (status !== "authenticated" || !session?.user?.email) return;

    const user = session.user;

    async function loadProfile() {
      try {
        const syncRes = await syncUser({
          name: user.name || "Unknown",
          email: user.email || "",
          oauthId: getOAuthId(user),
          provider: getAuthProvider(user)
        });

        sessionStorage.setItem("userId", syncRes.userId);

        if (!syncRes.latestProfile) {
          router.replace("/assess");
          return;
        }

        setProfile(syncRes.latestProfile);
      } catch (err: any) {
        setError(err.message || "Unable to load dashboard.");
      }
    }

    loadProfile();
  }, [router, session, status]);

  if (status === "loading" || (!profile && !error)) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const skillScores = mapToRecord(profile?.skillScores);
  const levelPerSkill = mapToRecord(profile?.levelPerSkill);
  const overallLevel = profile?.overallLevel || "beginner";
  const assessedAt = profile?.assessedAt ? new Date(profile.assessedAt).toLocaleDateString() : "Recently";

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {profile && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Trophy className="h-6 w-6" />
                  </div>
                  <h1 className="text-3xl font-extrabold text-slate-900">Your Proficiency Dashboard</h1>
                  <p className="mt-2 text-slate-600">Latest assessment from {assessedAt}</p>
                </div>
                <div className="text-left sm:text-right">
                  <div className={`inline-flex rounded-full border px-5 py-2 text-sm font-bold uppercase ${LEVEL_COLORS[overallLevel.toLowerCase()] || LEVEL_COLORS.beginner}`}>
                    {overallLevel}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-slate-900">
                <BarChart3 className="h-5 w-5 text-blue-600" /> Skill Proficiency
              </h2>
              <div className="space-y-5">
                {Object.entries(skillScores).map(([skill, score]) => (
                  <div key={skill}>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">{skill}</div>
                        <div className="text-xs font-medium uppercase text-slate-500">{levelPerSkill[skill] || overallLevel}</div>
                      </div>
                      <div className="font-bold text-slate-900">{score}%</div>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => router.push("/assess?retake=1")}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 font-bold text-white shadow-md transition-colors hover:bg-slate-800"
            >
              <RefreshCw className="h-5 w-5" /> Retake Assessment
            </button>
          </>
        )}
      </div>
    </div>
  );
}
