"use client";

type ExportSuccessModalProps = {
  downloadUrl: string;
  onClose: () => void;
};

export default function ExportSuccessModal({
  downloadUrl,
  onClose,
}: ExportSuccessModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-success-title"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#191b25] p-6 text-center text-white shadow-2xl"
      >
        <h2 id="export-success-title" className="text-xl font-semibold">
          Video export complete
        </h2>

        <p className="mt-2 text-sm text-zinc-400">
          Your MP4 is ready to download.
        </p>

        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-4 py-2"
          >
            Close
          </button>

          <a
            href={downloadUrl}
            download
            className="rounded-lg bg-purple-600 px-4 py-2 font-semibold"
          >
            Download MP4
          </a>
        </div>
      </div>
    </div>
  );
}