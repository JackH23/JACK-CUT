"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

type SignInPageProps = {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  loading: boolean;
  success: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function SignInPage({
  email,
  setEmail,
  password,
  setPassword,
  loading,
  success,
  onSubmit,
}: SignInPageProps) {
  const [showPassword, setShowPassword] = useState(false);

  const disabled = loading || success;

  const inputClassName =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d0f15] p-0 sm:p-6 lg:p-10">
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

        {/* Right form panel */}
        <div className="flex min-h-screen items-center justify-center bg-white px-6 py-12 text-gray-900 sm:min-h-[650px] sm:px-10 md:min-h-0 lg:px-14">
          <div className="w-full max-w-md">
            <div className="mb-9">

              <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">
                Welcome Back
              </h1>

              <p className="text-sm text-gray-600">
                Don&apos;t have an account?{" "}
                <Link
                  href="/register"
                  className="font-medium text-blue-600 hover:text-blue-700"
                >
                  Sign up
                </Link>
              </p>
            </div>

            <form
              onSubmit={onSubmit}
              aria-busy={loading}
              className="space-y-6"
            >
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Email Address
                </label>

                <input
                  id="login-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={disabled}
                  required
                  className={inputClassName}
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Password
                </label>

                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    disabled={disabled}
                    required
                    className={`${inputClassName} pr-12`}
                  />

                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-pressed={showPassword}
                    disabled={disabled}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff size={19} />
                    ) : (
                      <Eye size={19} />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={disabled}
                className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing In..." : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}