
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

type SignUpPageProps = {
  name: string;
  setName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  loading: boolean;
  success: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function SignUpPage({
  name,
  setName,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  loading,
  success,
  onSubmit,
}: SignUpPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const disabled = loading || success;

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d0f15] p-0 sm:p-6 lg:p-10">
      <div className="grid w-full max-w-5xl overflow-hidden bg-white shadow-2xl sm:rounded-2xl md:min-h-[650px] md:grid-cols-2 lg:min-h-[720px]">
        {/* Left image panel */}
        <div className="relative hidden min-h-full overflow-hidden bg-slate-900 md:block">
          <Image
            src="/images/auth/login-vr.png"
            alt="Futuristic virtual reality experience"
            fill
            priority
            sizes="(max-width: 768px) 0px, 50vw"
            className="object-cover object-center"
          />
        </div>

        {/* Right registration panel */}
        <div className="flex min-h-screen items-center justify-center bg-white px-6 py-10 text-gray-900 sm:min-h-[650px] sm:px-10 md:min-h-0 lg:px-14">
          <div className="w-full max-w-md">
            <div className="mb-7">

              <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">
                Create Account
              </h1>

              <p className="text-sm text-gray-600">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-blue-600 hover:text-blue-700"
                >
                  Sign in
                </Link>
              </p>
            </div>

            <form
              onSubmit={onSubmit}
              aria-busy={loading}
              className="space-y-5"
            >
              {/* Full name */}
              <div>
                <label
                  htmlFor="register-name"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Full Name
                </label>

                <input
                  id="register-name"
                  type="text"
                  name="name"
                  autoComplete="name"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  disabled={disabled}
                  required
                  className={inputClass}
                />
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="register-email"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Email Address
                </label>

                <input
                  id="register-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  disabled={disabled}
                  required
                  className={inputClass}
                />
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="register-password"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Password
                </label>

                <div className="relative">
                  <input
                    id="register-password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="new-password"
                    placeholder="Create a password"
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    minLength={8}
                    disabled={disabled}
                    required
                    className={`${inputClass} pr-12`}
                  />

                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    aria-pressed={showPassword}
                    onClick={() =>
                      setShowPassword((prev) => !prev)
                    }
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff size={19} />
                    ) : (
                      <Eye size={19} />
                    )}
                  </button>
                </div>

                <p className="mt-1.5 text-xs text-gray-500">
                  Must be at least 8 characters.
                </p>
              </div>

              {/* Confirm password */}
              <div>
                <label
                  htmlFor="register-confirm-password"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Confirm Password
                </label>

                <div className="relative">
                  <input
                    id="register-confirm-password"
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    name="confirmPassword"
                    autoComplete="new-password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    minLength={8}
                    disabled={disabled}
                    required
                    className={`${inputClass} pr-12`}
                  />

                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirmation password"
                        : "Show confirmation password"
                    }
                    aria-pressed={showConfirmPassword}
                    onClick={() =>
                      setShowConfirmPassword((prev) => !prev)
                    }
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 disabled:opacity-50"
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={19} />
                    ) : (
                      <Eye size={19} />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={disabled}
                className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "Creating Account..."
                  : "Create Account"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs leading-relaxed text-gray-500">
              By creating an account, you agree to
              JackCut&apos;s terms and privacy policies.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
