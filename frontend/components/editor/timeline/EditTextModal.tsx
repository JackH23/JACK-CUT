"use client";

import { useState } from "react";
import { X } from "lucide-react";

type EditTextModalProps = {
  open: boolean;
  initialText: string;
  onClose: () => void;
  onSave: (text: string) => void;
};

export default function EditTextModal(props: EditTextModalProps) {
  if (!props.open) return null;
  return <EditTextForm key={props.initialText} {...props} />;
}

function EditTextForm({
  initialText,
  onClose,
  onSave,
}: EditTextModalProps) {
  const [text, setText] = useState(initialText);

  const handleSave = () => {
    const normalizedText = text.trim();

    if (!normalizedText) return;

    onSave(normalizedText);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#17181f] p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">
              Edit Text
            </h2>

            <p className="mt-1 text-xs text-zinc-400">
              Change the text displayed in your video.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <input
          autoFocus
          value={text}
          onChange={(event) =>
            setText(event.target.value)
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSave();
            }

            if (event.key === "Escape") {
              onClose();
            }
          }}
          className="w-full rounded-lg border border-white/10 bg-[#0f1015] px-3 py-2.5 text-sm text-white outline-none transition focus:border-purple-500"
          placeholder="Enter text"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/10"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!text.trim()}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}