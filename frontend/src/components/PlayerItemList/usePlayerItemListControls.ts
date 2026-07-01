import { useMemo, useState } from "react";

import type { FilterOption, SortOption } from "./PlayerItemList";

interface UsePlayerItemListControlsProps<T> {
  items: T[];
  itemLabel: string;
  filterOptions?: FilterOption<T>[];
  sortOptions?: SortOption<T>[];
  controls?: React.ReactNode;
}

export function usePlayerItemListControls<T>({
  items,
  itemLabel,
  filterOptions,
  sortOptions,
  controls,
}: UsePlayerItemListControlsProps<T>) {
  const [activeFilterKey, setActiveFilterKey] = useState<string | null>(
    () => filterOptions?.[0]?.key ?? null,
  );

  const [activeSortKey, setActiveSortKey] = useState<string | null>(
    () => sortOptions?.[0]?.key ?? null,
  );

  const itemLabelLower = useMemo(
    () => itemLabel.toLowerCase(),
    [itemLabel],
  );

  const modalIdPrefix = useMemo(
    () => itemLabelLower.replace(/\s+/g, "-"),
    [itemLabelLower],
  );

  const displayItems = useMemo(() => {
    let result = items;

    const activeFilter = filterOptions?.find(
      (option) => option.key === activeFilterKey,
    );

    if (activeFilter) {
      result = result.filter(activeFilter.predicate);
    }

    const activeSort = sortOptions?.find(
      (option) => option.key === activeSortKey,
    );

    if (activeSort) {
      result = [...result].sort(activeSort.compareFn);
    }

    return result;
  }, [
    items,
    filterOptions,
    activeFilterKey,
    sortOptions,
    activeSortKey,
  ]);

  const hasControls = useMemo(
    () => Boolean(filterOptions?.length || sortOptions?.length || controls),
    [filterOptions, sortOptions, controls],
  );

  return {
    activeFilterKey,
    setActiveFilterKey,

    activeSortKey,
    setActiveSortKey,

    itemLabelLower,
    modalIdPrefix,
    displayItems,
    hasControls,
  };
}
