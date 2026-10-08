import LoadingState from "@/components/shared/LoadingState";

type LoadingSkeletonProps = {
  variant?: "editor" | "page" | "card" | "projects";
  className?: string;
  count?: number;
  withOverlay?: boolean;
  message?: string;
};

function SkeletonBlock({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`motion-safe:animate-pulse rounded bg-white/10 ${className}`}
    />
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0d0f15]">
      {/* Navbar */}
      <div className="h-14 shrink-0 border-b border-white/10 bg-[#101117] px-4">
        <div className="flex h-full items-center justify-between">
          <SkeletonBlock className="h-6 w-36" />
          <SkeletonBlock className="h-8 w-28" />
        </div>
      </div>

      {/* Project header */}
      <div className="flex h-10 shrink-0 items-center bg-[#15171e] px-4">
        <SkeletonBlock className="h-4 w-48" />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Toolbar */}
        <div className="flex w-10 shrink-0 flex-col gap-4 border-r border-white/10 bg-[#101117] p-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock
              key={index}
              className="h-6 w-6"
            />
          ))}
        </div>

        {/* Media sidebar */}
        <div className="w-60 shrink-0 border-r border-white/10 bg-[#15171e] p-3">
          <SkeletonBlock className="h-8 w-full" />
          <SkeletonBlock className="mt-4 h-8 w-full" />

          <div className="mt-4 grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonBlock
                key={index}
                className="aspect-square"
              />
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {/* Preview */}
            <div className="flex min-w-0 flex-1 items-center justify-center bg-[#0d0f15] p-8">
              <div className="aspect-video w-full max-w-2xl bg-black" />
            </div>

            {/* Settings */}
            <div className="w-60 shrink-0 border-l border-white/10 bg-[#15171e] p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="mb-5 space-y-2">
                  <SkeletonBlock className="h-3 w-20" />
                  <SkeletonBlock className="h-8 w-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="h-56 shrink-0 border-t border-white/10 bg-[#101117] p-4">
            <SkeletonBlock className="mb-4 h-5 w-40" />

            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="mb-3 flex h-10 gap-2"
              >
                <SkeletonBlock className="w-24" />
                <SkeletonBlock className="w-48 bg-purple-500/20" />
                <SkeletonBlock className="w-32 bg-purple-500/20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PageSkeleton({ count }: { count: number }) {
  return (
    <div className="min-h-screen bg-[#0d0f15] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <SkeletonBlock className="h-8 w-52" />
        <SkeletonBlock className="mt-3 h-4 w-80 max-w-full" />

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: count }).map((_, index) => (
            <div
              key={index}
              className="rounded-xl border border-white/10 bg-[#191b25] p-4"
            >
              <SkeletonBlock className="aspect-video w-full" />
              <SkeletonBlock className="mt-4 h-4 w-3/4" />
              <SkeletonBlock className="mt-2 h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CardSkeleton({ count }: { count: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#191b25]"
        >
          <SkeletonBlock className="aspect-video w-full rounded-none" />

          <div className="p-4">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="mt-3 h-3 w-1/2" />

            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-9 w-9" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectsSkeleton({ count }: { count: number }) {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12"
    >
      {/* Back navigation */}
      <SkeletonBlock className="mb-8 h-9 w-32 rounded-full" />

      {/* Heading */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-3 w-40 bg-purple-500/20" />
          <SkeletonBlock className="mt-4 h-8 w-52" />
          <SkeletonBlock className="mt-3 h-4 w-full max-w-sm" />
        </div>

        <SkeletonBlock className="h-14 w-28 shrink-0 rounded-xl" />
      </div>

      {/* Create new project */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#191b25]">
        <div className="flex items-center gap-3 border-b border-white/10 p-5">
          <SkeletonBlock className="h-11 w-11 rounded-xl bg-purple-500/20" />

          <div className="flex-1">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
          </div>
        </div>

        <div className="p-5">
          <SkeletonBlock className="mb-3 h-3 w-28" />

          <div className="flex flex-col gap-3 sm:flex-row">
            <SkeletonBlock className="h-11 flex-1 rounded-lg bg-[#101117]" />
            <SkeletonBlock className="h-11 w-full rounded-lg bg-purple-600/30 sm:w-36" />
          </div>
        </div>
      </div>

      {/* Existing projects */}
      <div className="mt-10">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <SkeletonBlock className="h-6 w-44" />
            <SkeletonBlock className="mt-2 h-3 w-36" />
          </div>

          <SkeletonBlock className="h-7 w-24 rounded-full" />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: count }, (_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-2xl border border-white/10 bg-[#191b25]"
            >
              <SkeletonBlock className="aspect-video w-full rounded-none bg-purple-500/10" />

              <div className="p-4">
                <SkeletonBlock className="h-4 w-3/4" />
                <SkeletonBlock className="mt-3 h-3 w-1/2" />

                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                  <SkeletonBlock className="h-4 w-24 bg-purple-500/20" />
                  <SkeletonBlock className="h-8 w-8 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoadingSkeleton({
  variant = "page",
  className = "",
  count = 6,
  withOverlay = false,
  message = "Loading...",
}: LoadingSkeletonProps) {
  return (
    <>
      <div
        role="status"
        aria-label="Loading content"
        className={className}
      >
        {variant === "editor" && <EditorSkeleton />}

        {variant === "page" && (
          <PageSkeleton count={count} />
        )}

        {variant === "card" && (
          <CardSkeleton count={count} />
        )}

        {variant === "projects" && (
          <ProjectsSkeleton count={count} />
        )}
      </div>

      {withOverlay && (
        <LoadingState
          message={message}
          size="lg"
          overlay
        />
      )}
    </>
  );
}