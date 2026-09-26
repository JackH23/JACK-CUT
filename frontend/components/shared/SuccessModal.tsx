"use client";

type SuccessModalProps = {
  title: string;
  message: string;
  onClose: () => void;
  action?: {
    label: string;
    href: string;
    download?: boolean;
  };
};

export default function SuccessModal({
  title,
  message,
  onClose,
  action,
}: SuccessModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-modal-title"
        aria-describedby="success-modal-message"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#191b25] p-6 text-center text-white shadow-2xl"
      >
        <h2 id="success-modal-title" className="text-xl font-semibold">
          {title}
        </h2>

        <p id="success-modal-message" className="mt-2 text-sm text-zinc-400">
          {message}
        </p>

        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-4 py-2"
          >
            Close
          </button>

          {action && (
            <a
              href={action.href}
              download={action.download}
              className="rounded-lg bg-purple-600 px-4 py-2 font-semibold"
            >
              {action.label}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}