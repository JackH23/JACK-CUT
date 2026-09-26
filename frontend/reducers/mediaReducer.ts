import type { MediaFile } from "@/lib/media";

type MediaState = {
  files: MediaFile[];
  uploading: boolean;
  error: string | null;
};

export const initialMediaState: MediaState = {
  files: [],
  uploading: false,
  error: null,
};

type MediaAction =
  | { type: "LOAD_MEDIA"; payload: MediaFile[] }
  | { type: "UPLOAD_START" }
  | { type: "UPLOAD_SUCCESS"; payload: MediaFile[] }
  | { type: "UPLOAD_ERROR"; payload: string }
  | { type: "REMOVE_MEDIA"; payload: string };

export function mediaReducer(
  state: MediaState,
  action: MediaAction,
): MediaState {
  switch (action.type) {
    case "LOAD_MEDIA":
      return {
        ...state,
        files: action.payload,
      };
    case "UPLOAD_START":
      return { ...state, uploading: true, error: null };

    case "UPLOAD_SUCCESS":
      return {
        ...state,
        uploading: false,
        files: [...state.files, ...action.payload],
      };

    case "UPLOAD_ERROR":
      return {
        ...state,
        uploading: false,
        error: action.payload,
      };

    case "REMOVE_MEDIA":
      return {
        ...state,
        files: state.files.filter((file) => file.id !== action.payload),
      };

    default:
      return state;
  }
}
