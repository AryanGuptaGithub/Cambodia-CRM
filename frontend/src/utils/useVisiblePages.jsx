// src/hooks/useVisiblePages.js

import { useMemo } from 'react';

export function getVisiblePages(currentPage, totalPages) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, '...', totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, '...', totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, '...', currentPage, '...', totalPages];
}

// Optional: a custom hook that uses useMemo and the above function
export function useVisiblePages(currentPage, totalPages) {
  return useMemo(() => {
    return getVisiblePages(currentPage, totalPages);
  }, [currentPage, totalPages]);
}
