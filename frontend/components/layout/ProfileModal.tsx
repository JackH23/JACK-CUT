"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/services/authService";

type ProfileModalProps = {
  user: User | null;
  onClose: () => void;
  onLoggedOut: () => void;
};

export default function ProfileModal({
  user,
  onClose,
  onLoggedOut,
}: ProfileModalProps) {
  const router = useRouter();
  const [confirmLogout, setConfirmLogout] = useState(false);

  function handleLogout() {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");

    onLoggedOut();
    onClose();
    router.replace("/login");
  }

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#191b25] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="profile-title" className="text-lg font-semibold">
              Your profile
            </h2>
            <p className="mt-1 text-sm text-zinc-400">Signed in to JackCut</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="rounded-md px-2 py-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 rounded-xl bg-white/5 p-4">
          <p className="font-medium">{user?.name ?? "User"}</p>
          <p className="mt-1 break-all text-sm text-zinc-400">
            {user?.email ?? ""}
          </p>
        </div>

        {confirmLogout ? (
          <div className="mt-6">
            <p className="text-sm text-zinc-300">
              Are you sure you want to log out?
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="flex-1 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold hover:bg-red-500"
              >
                Confirm logout
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="mt-6 w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold hover:bg-red-500"
          >
            Log out
          </button>
        )}
      </div>
    </div>
  );
}
