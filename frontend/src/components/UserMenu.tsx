"use client";

import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export default function UserMenu() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  if (status === "loading") return <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200"></div>;
  if (!session?.user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white p-1 hover:shadow-md focus:outline-none"
      >
        <img
          src={session.user.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(session.user.name || "User")}`}
          alt="Avatar"
          className="h-8 w-8 rounded-full"
        />
        <span className="hidden pr-2 text-sm font-medium sm:block">{session.user.name}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 z-50">
          <div className="px-4 py-2 text-sm text-gray-700 border-b">
            <div>Signed in as</div>
            <div className="font-medium truncate">{session.user.email}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
