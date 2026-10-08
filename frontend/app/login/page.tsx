"use client";

import { useLogin } from "@/composables/useLogin";

import SignInPage from "@/components/ui/sign-in-page";
import ErrorModal from "@/components/shared/ErrorModal";
import SuccessModal from "@/components/shared/SuccessModal";
import LoadingState from "@/components/shared/LoadingState";

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
    continueToHome,
  } = useLogin();

  return (
    <>
      {loading && !success && (
        <LoadingState
          message="Logging in..."
          size="lg"
          overlay
        />
      )}

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
          onClose={continueToHome}
        />
      )}

      <SignInPage
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        loading={loading}
        success={success}
        onSubmit={handleSubmit}
      />
    </>
  );
}