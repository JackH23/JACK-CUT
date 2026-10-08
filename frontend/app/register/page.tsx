
"use client";

import Link from "next/link";

import { useRegister } from "@/composables/useRegister";

import ErrorModal from "@/components/shared/ErrorModal";
import SuccessModal from "@/components/shared/SuccessModal";
import LoadingState from "@/components/shared/LoadingState";

export default function RegisterPage() {
  const {
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    loading,
    success,
    handleSubmit,
    closeError,
    continueToProjects,
  } = useRegister();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d0f15] p-4 text-white">
      {/* Loading overlay */}
      {loading && !success && (
        <LoadingState
          message="Creating account..."
          size="lg"
          overlay
        />
      )}

      {/* Error modal */}
      {error && (
        <ErrorModal
          message={error}
          onClose={closeError}
        />
      )}

      {/* Success modal */}
      {success && (
        <SuccessModal
          title="Account created"
          message="Your JackCut account is ready."
          onClose={continueToProjects}
        />
      )}

      <form
        onSubmit={handleSubmit}
        aria-busy={loading}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-white/10 bg-[#1c1f27] p-6"
      >
        <h1 className="text-xl font-semibold">
          Create your JackCut account
        </h1>

        <input
          type="text"
          placeholder="Name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={loading || success}
          required
          className="rounded border border-white/20 bg-[#111319] p-3 disabled:opacity-60"
        />

        <input
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={loading || success}
          required
          className="rounded border border-white/20 bg-[#111319] p-3 disabled:opacity-60"
        />

        <input
          type="password"
          placeholder="Password (at least 8 characters)"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          disabled={loading || success}
          required
          className="rounded border border-white/20 bg-[#111319] p-3 disabled:opacity-60"
        />

        <input
          type="password"
          placeholder="Confirm password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) =>
            setConfirmPassword(event.target.value)
          }
          disabled={loading || success}
          required
          className="rounded border border-white/20 bg-[#111319] p-3 disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={loading || success}
          className="rounded bg-purple-700 p-3 font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create account
        </button>

        <Link
          href="/login"
          className="text-sm text-purple-300"
        >
          Already have an account? Log in
        </Link>
      </form>
    </main>
  );
}
