import { ChevronLeft, ChevronRight } from "react-bootstrap-icons";

const WINDOW_SIZE = 4;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

// Generic "Showing X - Y of Z" + rows-per-page + windowed page numbers
// (e.g. "‹ 3 4 5 6 … 10 ›") — reusable anywhere a list needs paging, not
// just Users. Fully controlled: the parent owns page/pageSize state.
export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  const windowStart = Math.max(1, Math.min(safePage - 2, totalPages - WINDOW_SIZE + 1));
  let windowEnd = Math.min(totalPages, windowStart + WINDOW_SIZE - 1);

  // A "…" only earns its place if it's actually hiding more than one page —
  // collapsing a single page takes as much space as just showing it, so
  // fold it into the window instead of ellipsis-ing it away.
  const hiddenBeforeLastPage = totalPages - windowEnd - 1;
  const showEllipsis = hiddenBeforeLastPage >= 2;
  if (!showEllipsis) {
    windowEnd = totalPages;
  }

  const windowPages = Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);

  return (
    <div className="pagination-bar">
      <div className="pagination-info">
        {totalItems === 0 ? "No results" : `Showing ${start} - ${end} of ${totalItems}`}
      </div>

      <div className="pagination-controls">
        <select
          className="pagination-size-select"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>

        <button
          type="button"
          className="btn btn-ghost btn-icon"
          disabled={safePage === 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        {windowPages.map((p) => (
          <button
            key={p}
            type="button"
            className={`deploy-page-btn${p === safePage ? " deploy-page-btn--active" : ""}`}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}

        {showEllipsis && (
          <>
            <span className="pagination-ellipsis">…</span>
            <button type="button" className="deploy-page-btn" onClick={() => onPageChange(totalPages)}>
              {totalPages}
            </button>
          </>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-icon"
          disabled={safePage === totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
