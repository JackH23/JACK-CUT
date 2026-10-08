
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "JackCut",
    template: "%s | JackCut",
  },
  description:
    "JackCut - Create, edit, and export professional videos with ease.",
  applicationName: "JackCut",
  icons: {
    icon: [
      {
        url: "/icon/Cinematic%20Neon%20J%20Film%20Logo.png",
        type: "image/png",
      },
    ],
    shortcut: "/icon/Cinematic%20Neon%20J%20Film%20Logo.png",
    apple: "/icon/Cinematic%20Neon%20J%20Film%20Logo.png",
  },
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
