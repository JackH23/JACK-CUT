type PaginationProps = {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
};

export default function Pagination({
  page,
  totalPages,
  onPrevious,
  onNext,
  className = "",
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <div
      className={`flex items-center justify-between ${className}`}
    >
      <button
        type="button"
        onClick={onPrevious}
        disabled={isFirstPage}
        className="
          rounded
          px-2
          py-1
          text-xs
          text-zinc-300
          transition
          hover:bg-white/10
          disabled:cursor-not-allowed
          disabled:opacity-40
        "
      >
        Previous
      </button>

      <span className="text-xs text-zinc-400">
        {page} / {totalPages}
      </span>

      <button
        type="button"
        onClick={onNext}
        disabled={isLastPage}
        className="
          rounded
          px-2
          py-1
          text-xs
          text-zinc-300
          transition
          hover:bg-white/10
          disabled:cursor-not-allowed
          disabled:opacity-40
        "
      >
        Next
      </button>
    </div>
  );
}