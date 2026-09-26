"use client";

import NavbarLeft from "@/components/layout/NavbarLeft";
import NavbarRight from "@/components/layout/NavbarRight";
import ProfileModal from "@/components/layout/ProfileModal";
import { useNavbar } from "@/composables/useNavbar";

const navigationItems = ["Edit", "Color", "Audio", "Effects", "Deliver"];

type NavbarProps = {
  onExport: () => void;
  exporting: boolean;
};

export default function Navbar({ onExport, exporting }: NavbarProps) {
  const {
    user,
    profileOpen,
    openProfile,
    closeProfile,
    handleLoggedOut,
  } = useNavbar();

  return (
    <header className="h-16 border-b border-white/10 bg-[#090a0f] px-3 text-white">
      <nav className="flex h-full items-center justify-between gap-4">
        <NavbarLeft />

        <div className="hidden h-full items-center xl:flex">
          {navigationItems.map((item) => {
            const isActive = item === "Edit";

            return (
              <button
                key={item}
                type="button"
                className={`relative flex h-full items-center px-4 text-sm font-semibold transition ${
                  isActive
                    ? "bg-white/[0.06] text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {item}

                {isActive && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-purple-400" />
                )}
              </button>
            );
          })}
        </div>

        <NavbarRight
          user={user}
          onExport={onExport}
          exporting={exporting}
          onOpenProfile={openProfile}
        />
      </nav>

      {profileOpen && (
        <ProfileModal
          user={user}
          onClose={closeProfile}
          onLoggedOut={handleLoggedOut}
        />
      )}
    </header>
  );
}