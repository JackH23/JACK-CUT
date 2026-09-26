"use client";

import { useReducer, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

import { authService } from "@/services/authService";
import {
  initialLoginState,
  loginReducer,
} from "@/reducers/loginReducer";

export function useLogin() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, dispatch] = useReducer(loginReducer, initialLoginState);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.loading || state.success) return;

    dispatch({ type: "LOGIN_START" });

    try {
      await authService.login({ email, password });
      dispatch({ type: "LOGIN_SUCCESS" });
    } catch (cause) {
      dispatch({
        type: "LOGIN_ERROR",
        payload: axios.isAxiosError(cause)
          ? cause.response?.data?.message || "Login failed."
          : "Login failed.",
      });
    }
  }

  function closeError() {
    dispatch({ type: "CLEAR_ERROR" });
  }

  function continueToProjects() {
    router.replace("/projects");
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    error: state.error,
    loading: state.loading,
    success: state.success,
    handleSubmit,
    closeError,
    continueToProjects,
  };
}