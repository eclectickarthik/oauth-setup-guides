import Link from "next/link";
import BrowseGuidesLink from "@/components/BrowseGuidesLink";

export default function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
        <Link
          href="/"
          aria-label="Home"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 transition-colors hover:border-zinc-500 hover:text-black dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
            <path d="M9 21v-6h6v6" />
          </svg>
        </Link>
        <BrowseGuidesLink />
        <span className="hidden text-sm font-medium text-zinc-600 sm:inline dark:text-zinc-400">
          OAuth Setup Guides
        </span>
        <Link
          href="/compare"
          className="ml-auto text-sm text-zinc-500 underline-offset-2 hover:text-black hover:underline dark:text-zinc-500 dark:hover:text-zinc-50"
        >
          Agent vs. hand-checked
        </Link>
      </div>
    </header>
  );
}
