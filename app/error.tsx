"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-lg font-semibold text-zinc-900">Something broke loading tickets.</h1>
      <p className="mt-2 font-mono text-sm text-zinc-600">{error.message}</p>
      <button
        onClick={() => reset()}
        className="mt-4 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100"
      >
        Retry
      </button>
    </div>
  );
}
