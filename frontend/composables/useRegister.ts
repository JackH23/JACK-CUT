"use client";

import { useReducer, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

import { authService } from "@/services/authService";
import {
  initialRegisterState,
  registerReducer,
} from "@/reducers/registerReducer";

export function useRegister() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [state, dispatch] = useReducer(
    registerReducer,
    initialRegisterState,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.loading || state.success) return;

    if (password !== confirmPassword) {
      dispatch({
        type: "REGISTER_ERROR",
        payload: "Passwords do not match.",
      });
      return;
    }

    dispatch({ type: "REGISTER_START" });

    try {
      await authService.register({ name, email, password });
      dispatch({ type: "REGISTER_SUCCESS" });
    } catch (cause) {
      dispatch({
        type: "REGISTER_ERROR",
        payload: axios.isAxiosError(cause)
          ? cause.response?.data?.message || "Registration failed."
          : "Registration failed.",
      });
    }
  }

  function closeError() {
    dispatch({ type: "CLEAR_ERROR" });
  }

  function continueToHome() {
    router.replace("/home");
  }

  return {
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    error: state.error,
    loading: state.loading,
    success: state.success,
    handleSubmit,
    closeError,
    continueToHome,
  };
}