
import Link from "next/link";

import { ArrowUpRight, Clapperboard, Play } from "lucide-react";

export default function ProjectsHero() {
  return (
    <section className="projects-hero relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#08080b] text-white">
      {/* Cinematic background */}
      <div
        aria-hidden="true" className="absolute inset-0 -z-20 bg-cover bg-[center_65%]"
        style={{
          backgroundImage:
            "url('/images/projects/hero-horizon.svg')",
        }}
      />

      {/* Keep the horizon visible; shade the text and soften the bottom edge. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(8,8,11,0.2)_0%,rgba(8,8,11,0.12)_45%,transparent_70%)]" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-[30%] bg-gradient-to-b from-transparent via-[#0d0f15]/60 to-[#0d0f15]" />

      {/* Navigation */}
      <nav
        aria-label="Workspace navigation"
        className="absolute left-1/2 top-6 z-20 flex w-[calc(100%_-_2rem)] max-w-5xl -translate-x-1/2 items-center justify-between rounded-full border border-white/15 bg-black/30 px-4 py-3 shadow-2xl backdrop-blur-xl sm:px-6"
      >
        <div className="flex items-center gap-2 text-sm font-bold sm:text-base tracking-wide">
          <Clapperboard className="text-orange-400" size={20} />
          <span>JACKCUT</span>
        </div>

        <div className="hidden items-center gap-7 text-sm text-zinc-200 md:flex">
          <Link href="/projects?focus=create" className="hover:text-white">
            Create
          </Link>
          <Link href="/projects" className="hover:text-white">
            My Projects
          </Link>
        </div>

        <Link href="/projects"
          className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 sm:text-sm"
        >
          Start Editing
          <ArrowUpRight size={16} />
        </Link>
      </nav>

      {/* Hero content */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-5 pb-20 pt-32 text-center sm:px-8 sm:pb-24 sm:pt-36 lg:pb-28">
        <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs text-zinc-100 backdrop-blur-md sm:text-sm">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black">
            JACKCUT
          </span>
          Your Creative Workspace
        </div>

        <h1 className=" max-w-5xl text-balance font-serif text-[clamp(2.5rem,6vw,6rem)] font-normal leading-[1.1] tracking-tight [text-shadow:0_2px_24px_rgba(0,0,0,0.65)]">
          Create Beyond Limits.
          <span className="mt-3 block">
            Edit With Freedom.
          </span>
        </h1>

        <p className="mt-9 max-w-xl text-pretty text-base leading-7 text-zinc-100 [text-shadow:0_2px_12px_rgba(0,0,0,0.8)] sm:mt-10 sm:text-lg sm:leading-8">
          Turn your ideas into extraordinary videos.
          Create, edit, and bring every story to life
          with JackCut.
        </p>

        <div className="mt-10 flex w-full flex-col items-center justify-center gap-4 sm:mt-12 sm:w-auto sm:flex-row">
          <Link href="/projects?focus=create"
            className="flex w-full items-center justify-center gap-3 rounded-full sm:w-auto bg-white px-7 py-4 text-sm font-semibold text-black transition motion-safe:hover:-translate-y-0.5 hover:bg-zinc-200"
          >
            Create New Project
            <ArrowUpRight size={17} />
          </Link>

          <Link href="/projects"
            className="flex w-full items-center justify-center gap-3 rounded-full sm:w-auto border border-white/20 bg-black/30 px-7 py-4 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/10"
          >
            <Play size={16} />
            Explore Projects
          </Link>
        </div>
      </div>

    </section>
  );
}
