"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sits next to the Home icon so a guide page (especially one just
// generated) has a one-click way back to the library, instead of Home
// dropping you on the landing page. Hidden where it'd be redundant: the
// landing page has its own "Browse guides" button, and /guides is the
// library itself.
export default function BrowseGuidesLink() {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/guides" || pathname.startsWith("/unlock")) {
    return null;
  }

  return (
    <Link
      href="/guides"
      className="flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-500 hover:text-black dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Browse guides
    </Link>
  );
}
