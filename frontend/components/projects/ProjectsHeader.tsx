
import Link from "next/link";
import {
  ArrowLeft,
  Clapperboard,
  FolderOpen,
} from "lucide-react";

type ProjectsHeaderProps = {
  totalProjects: number;
  loading?: boolean;
};

export default function ProjectsHeader({
  totalProjects,
  loading = false,
}: ProjectsHeaderProps) {
  return (
    <>
      <Link
        href="/home"
        className="sticky top-4 z-20 mb-8 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-[#191b25] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft size={17} aria-hidden="true" />
        Back to Home
      </Link>

      <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-purple-400">
            <Clapperboard size={18} />
            JACKCUT WORKSPACE
          </div>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Your Projects
          </h1>

          <p className="mt-3 text-sm text-zinc-400 sm:text-base">
            Create a new video project or continue editing
            your existing work.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#191b25] px-5 py-3">
          <FolderOpen
            size={21}
            className="text-purple-400"
          />

          <div>
            <p className="text-xs text-zinc-400">
              Total Projects
            </p>

            <p className="text-xl font-bold">
              {loading ? "—" : totalProjects}
            </p>
          </div>
        </div>
      </header>
    </>
  );
}
