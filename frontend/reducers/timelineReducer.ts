import type { SetStateAction } from "react";
import type { TimelineItem } from "@/types/timeline";

export type TimelineState = {
  items: TimelineItem[];
  removedIds: string[];
  loading: boolean;
  loaded: boolean;
  adding: boolean;
  error: string | null;
  lastAddedItem: TimelineItem | null;
};

export const initialTimelineState: TimelineState = {
  items: [],
  removedIds: [],
  loading: true,
  loaded: false,
  adding: false,
  error: null,
  lastAddedItem: null,
};

type TimelineAction =
  | { type: "LOAD_ITEMS_START" }
  | { type: "LOAD_ITEMS_SUCCESS"; payload: TimelineItem[] }
  | { type: "REMOVE_ITEM"; payload: string }
  | { type: "REMOVE_ITEM_ERROR"; payload: string }
  | { type: "LOAD_ITEMS_ERROR"; payload: string }
  | { type: "ADD_ITEM_START" }
  | { type: "ADD_ITEM_SUCCESS"; payload: TimelineItem }
  | { type: "ADD_ITEM_ERROR"; payload: string }
  | { type: "SET_ITEMS"; payload: SetStateAction<TimelineItem[]> }
  | { type: "REMOVE_MEDIA"; payload: string };

export function timelineReducer(
  state: TimelineState,
  action: TimelineAction,
): TimelineState {
  switch (action.type) {
    case "LOAD_ITEMS_START":
      return {
        ...state,
        loading: true,
        loaded: false,
        items: [],
        removedIds: [],
        error: null,
      };

    case "LOAD_ITEMS_SUCCESS": {
      // Keep clips added while the initial GET request was in progress.
      const loadedIds = new Set(action.payload.map((item) => item.id));

      return {
        ...state,
        loading: false,
        loaded: true,
        items: [
          ...action.payload.filter(item => !state.removedIds.includes(item.id)),
          ...state.items.filter((item) => !loadedIds.has(item.id)),
        ],
      };
    }

    case "LOAD_ITEMS_ERROR":
      return {
        ...state,
        loading: false,
        error: action.payload,
      };

    case "ADD_ITEM_START":
      return {
        ...state,
        adding: true,
        error: null,
      };

    case "ADD_ITEM_SUCCESS":
      return {
        ...state,
        adding: false,
        items: [...state.items.filter(item => item.id !== action.payload.id), action.payload],
        lastAddedItem: action.payload,
      };

    case "ADD_ITEM_ERROR":
      return {
        ...state,
        adding: false,
        error: action.payload,
      };

    case "SET_ITEMS":
      return {
        ...state,
        items:
          typeof action.payload === "function"
            ? action.payload(state.items)
            : action.payload,
      };

    case "REMOVE_MEDIA":
      return {
        ...state,
        items: state.items.filter(
          (item) =>
            item.type !== "media" ||
            item.file?.id !== action.payload,
        ),
      };

    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.payload),
        removedIds: [...state.removedIds, action.payload],
        error: null,
      };

    case "REMOVE_ITEM_ERROR":
      return {
        ...state,
        error: action.payload,
      };

    default:
      return state;
  }
}
