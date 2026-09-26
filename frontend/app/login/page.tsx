"use client";

import Link from "next/link";

import { useLogin } from "@/composables/useLogin";
import ErrorModal from "@/components/shared/ErrorModal";
import SuccessModal from "@/components/shared/SuccessModal";

export default function LoginPage() {
  const {
    email,
    setEmail,
    password,
    setPassword,
    error,
    loading,
    success,
    handleSubmit,
    closeError,
    continueToProjects,
  } = useLogin();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d0f15] p-4 text-white">
      {error && (
        <ErrorModal
          message={error}
          onClose={closeError}
        />
      )}

      {success && (
        <SuccessModal
          title="Login successful"
          message="Welcome to JackCut. Your projects are ready."
          onClose={continueToProjects}
        />
      )}

      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-white/10 bg-[#1c1f27] p-6"
      >
        <h1 className="text-xl font-semibold">Log in to JackCut</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="rounded border border-white/20 bg-[#111319] p-3"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="rounded border border-white/20 bg-[#111319] p-3"
        />

        <button
          type="submit"
          disabled={loading || success}
          className="rounded bg-purple-700 p-3 font-medium disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>

        <Link href="/register" className="text-sm text-purple-300">
          Create an account
        </Link>
      </form>
    </main>
  );
}