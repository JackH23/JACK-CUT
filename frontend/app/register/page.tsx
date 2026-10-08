
"use client";

import { useRegister } from "@/composables/useRegister";

import SignUpPage from "@/components/ui/sign-up-page";
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
    <>
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

      {/* Registration UI */}
      <SignUpPage
        name={name}
        setName={setName}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        loading={loading}
        success={success}
        onSubmit={handleSubmit}
      />
    </>
  );
}
