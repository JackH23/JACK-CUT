type AudioClipProps = {
  name: string;
  className: string;
  purple?: boolean;
};

const waveformBars = Array.from({ length: 80 }, (_, index) => {
  // Create a stable demo waveform pattern.
  return 20 + ((index * 37) % 80);
});

export default function AudioClip({
  name,
  className,
  purple = false,
}: AudioClipProps) {
  const waveformColor = purple
    ? "bg-purple-300"
    : "bg-cyan-300";

  return (
    <div
      className={`absolute inset-y-1 overflow-hidden rounded border px-2 py-1 ${
        purple
          ? "border-purple-600 bg-purple-950"
          : "border-cyan-700 bg-cyan-950"
      } ${className}`}
    >
      <p
        className={`truncate text-[11px] font-semibold leading-3 ${
          purple ? "text-purple-200" : "text-cyan-200"
        }`}
      >
        {name}
      </p>

      {/* Demo audio waveform */}
      <div className="mt-1 flex h-5 items-center gap-px overflow-hidden">
        {waveformBars.map((height, index) => (
          <span
            key={index}
            className={`min-w-px flex-1 rounded-full opacity-80 ${waveformColor}`}
            style={{
              height: `${height}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}