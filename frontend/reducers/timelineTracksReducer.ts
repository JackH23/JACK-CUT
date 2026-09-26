import type { SavedTimelineTrack } from "@/lib/timeline";

export type TimelineTracksState = {
  tracks: SavedTimelineTrack[];
  loading: boolean;
  error: string | null;
};

export const initialTimelineTracksState: TimelineTracksState = {
  tracks: [],
  loading: true,
  error: null,
};

type TimelineTracksAction =
  | { type: "TRACKS_LOAD_START" }
  | { type: "TRACKS_LOAD_SUCCESS"; payload: SavedTimelineTrack[] }
  | { type: "TRACKS_LOAD_ERROR"; payload: string };

export function timelineTracksReducer(
  state: TimelineTracksState,
  action: TimelineTracksAction,
): TimelineTracksState {
  switch (action.type) {
    case "TRACKS_LOAD_START":
      return { ...state, loading: true, error: null };

    case "TRACKS_LOAD_SUCCESS":
      return {
        tracks: action.payload,
        loading: false,
        error: null,
      };

    case "TRACKS_LOAD_ERROR":
      return {
        ...state,
        loading: false,
        error: action.payload,
      };

    default:
      return state;
  }
}