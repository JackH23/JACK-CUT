"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { authService } from "@/services/authService";
import {
  initialNavbarState,
  navbarReducer,
} from "@/reducers/navbarReducer";

export function useNavbar() {
  const [state, dispatch] = useReducer(navbarReducer, initialNavbarState);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let active = true;

    dispatch({ type: "USER_LOAD_START" });

    authService
      .me()
      .then((user) => {
        if (active) {
          dispatch({ type: "USER_LOAD_SUCCESS", payload: user });
        }
      })
      .catch(() => {
        if (active) {
          dispatch({
            type: "USER_LOAD_ERROR",
            payload: "Could not load your profile.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const openProfile = useCallback(() => {
    setProfileOpen(true);
  }, []);

  const closeProfile = useCallback(() => {
    setProfileOpen(false);
  }, []);

  const handleLoggedOut = useCallback(() => {
    dispatch({ type: "USER_LOGGED_OUT" });
    setProfileOpen(false);
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    profileOpen,
    openProfile,
    closeProfile,
    handleLoggedOut,
  };
}