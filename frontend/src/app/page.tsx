"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Target, Brain, LineChart } from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  const handleStart = () => {
    if (status === "authenticated") {
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 flex flex-col items-center justify-center p-6 sm:p-12">
      <div className="max-w-4xl w-full text-center space-y-8 mt-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-700 font-medium text-sm border border-blue-200 shadow-sm">
          <Brain className="w-4 h-4" />
          <span>Powered by Ollama AI</span>
        </div>
        
        <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Discover Your Career Path with <span className="text-blue-600">AI-Powered Assessment</span>
        </h1>
        
        <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
          Answer 18 questions across 3 difficulty levels. Get your exact skill level and top career matches — automatically.
        </p>
        
        <button
          onClick={handleStart}
          className={cn(
            "mt-8 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 inline-flex items-center gap-2",
            status === "loading" && "opacity-70 cursor-not-allowed hover:translate-y-0"
          )}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Loading..." : "Start Your Assessment"}
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-5xl w-full mt-32 mb-16">
        <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">How it works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: CheckCircle2,
              title: "Step 1: Sign in",
              description: "Create an account using your preferred provider to save your results securely."
            },
            {
              icon: Target,
              title: "Step 2: Take Assessment",
              description: "Complete an adaptive 18-question test covering beginner to expert concepts."
            },
            {
              icon: LineChart,
              title: "Step 3: Get Results",
              description: "Receive your exact skill level breakdown and personalized career recommendations."
            }
          ].map((step, idx) => (
            <div key={idx} className="bg-white p-8 rounded-2xl shadow-md border border-slate-100 flex flex-col items-center text-center space-y-4 hover:border-blue-200 hover:shadow-lg transition-all">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                <step.icon className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">{step.title}</h3>
              <p className="text-slate-600">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
