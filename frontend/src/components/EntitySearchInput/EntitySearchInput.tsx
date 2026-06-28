import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import classNames from "classnames";

import { useEntitySearchCache } from "../../hooks/useEntitySearchCache";
import styles from "./EntitySearchInput.module.scss";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 90;
const MAX_RESULTS = 8;

// Entity type returned from the search cache hook
interface SearchEntity {
  id: number | string;
  name: string;
  nameKey?: string;
  taskId?: number | null;
  source?: string;
  [key: string]: unknown;
}

interface EntitySearchInputProps {
  type: "activity" | "task";
  value: string;
  onChange?: (value: string) => void;
  onSelect?: (entity: SearchEntity) => void;
  onCreate?: (name: string) => void | Promise<void>;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  searchEnabled?: boolean;
}

function normalizeQuery(value: string | undefined): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function getEntityNameKey(name: string): string {
  return normalizeQuery(name).toLowerCase();
}

export default function EntitySearchInput({
  type,
  value,
  onChange,
  onSelect,
  onCreate,
  placeholder = "",
  ariaLabel,
  className,
  inputClassName,
  disabled = false,
  searchEnabled = true,
}: EntitySearchInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [debouncedQuery, setDebouncedQuery] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);

  const { entities, addEntityToCache } = useEntitySearchCache(type);
  const normalizedValue = normalizeQuery(value);
  const canSearch = searchEnabled && !disabled;

  const searchableEntities = useMemo(
    () => entities.map((entity) => ({ ...entity, nameKey: getEntityNameKey(entity.name) })),
    [entities]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(value);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsFocused(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(searchableEntities, {
        keys: ["name"],
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: MIN_QUERY_LENGTH,
      }),
    [searchableEntities]
  );

  const rawResults = useMemo(() => {
    if (!canSearch) return [];

    const query = normalizeQuery(debouncedQuery);
    if (query.length < MIN_QUERY_LENGTH) return [];

    const queryKey = getEntityNameKey(query);
    const currentValueKey = getEntityNameKey(normalizedValue);

    const directPrefixMatches: typeof searchableEntities = [];
    const directIncludesMatches: typeof searchableEntities = [];

    for (const entity of searchableEntities) {
      if (entity.source !== "task" && entity.nameKey === currentValueKey) continue;

      if (entity.nameKey.startsWith(queryKey)) {
        directPrefixMatches.push(entity);
      } else if (entity.nameKey.includes(queryKey)) {
        directIncludesMatches.push(entity);
      }

      if (directPrefixMatches.length + directIncludesMatches.length >= MAX_RESULTS) {
        break;
      }
    }

    const directMatches = [...directPrefixMatches, ...directIncludesMatches].slice(0, MAX_RESULTS);
    if (directMatches.length >= MAX_RESULTS) {
      return directMatches;
    }

    const uniqueResults: typeof searchableEntities = [];
    const seenNames = new Set(directMatches.map((entity) => entity.nameKey));

    uniqueResults.push(...directMatches);

    fuse
      .search(query, { limit: MAX_RESULTS })
      .map((result) => result.item)
      .filter((entity) => entity.source === "task" || entity.nameKey !== currentValueKey)
      .forEach((entity) => {
        const key = entity.nameKey;
        if (!seenNames.has(key)) {
          seenNames.add(key);
          uniqueResults.push(entity);
        }
      });

    return uniqueResults.slice(0, MAX_RESULTS);
  }, [canSearch, debouncedQuery, fuse, normalizedValue, searchableEntities]);

  const results = useMemo(() => {
    const taskResults = rawResults.filter((r) => r.source === "task");
    const taskNames = new Set(taskResults.map((r) => r.nameKey));
    const activityResults = rawResults.filter(
      (r) => r.source !== "task" && !taskNames.has(r.nameKey ?? "")
    );
    return [...taskResults, ...activityResults];
  }, [rawResults]);

  const isDropdownOpen = isFocused && results.length > 0;

  const activeHighlightedIndex =
    highlightedIndex >= 0 && highlightedIndex < results.length ? highlightedIndex : -1;

  const commitSelection = (entity: typeof searchableEntities[number]) => {
    onChange?.(entity.name);
    onSelect?.(entity);
    setIsFocused(false);
    setHighlightedIndex(-1);
  };

  const commitCreate = async () => {
    const nextName = normalizeQuery(value);
    if (!nextName) return;

    addEntityToCache(nextName);
    onChange?.(nextName);
    await onCreate?.(nextName);
    setIsFocused(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (event.key === "ArrowDown" && isDropdownOpen) {
      event.preventDefault();
      setHighlightedIndex(
        activeHighlightedIndex < results.length - 1 ? activeHighlightedIndex + 1 : 0
      );
      return;
    }

    if (event.key === "ArrowUp" && isDropdownOpen) {
      event.preventDefault();
      setHighlightedIndex(
        activeHighlightedIndex > 0 ? activeHighlightedIndex - 1 : results.length - 1
      );
      return;
    }

    if (event.key === "Escape") {
      if (isDropdownOpen) {
        event.preventDefault();
      }
      setIsFocused(false);
      setHighlightedIndex(-1);
      return;
    }

    if (event.key !== "Enter") return;

    if (!canSearch) {
      return;
    }

    const hasHighlightedResult =
      isDropdownOpen &&
      activeHighlightedIndex >= 0 &&
      activeHighlightedIndex < results.length;

    if (hasHighlightedResult) {
      event.preventDefault();
      commitSelection(results[activeHighlightedIndex]);
      return;
    }

    if (normalizeQuery(value)) {
      event.preventDefault();
      await commitCreate();
    }
  };

  return (
    <div ref={rootRef} className={classNames(styles.root, className)}>
      <input
        type="text"
        role="combobox"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete={canSearch ? "list" : "none"}
        aria-expanded={isDropdownOpen}
        aria-controls={isDropdownOpen ? `${type}-entity-search-results` : undefined}
        className={classNames(styles.input, inputClassName)}
        disabled={disabled}
      />

      {isDropdownOpen && (
        <ul
          id={`${type}-entity-search-results`}
          className={styles.dropdown}
          role="listbox"
          aria-label={`${type} suggestions`}
        >
          {(() => {
            const taskItems = results.filter((r) => r.source === "task");
            const activityItems = results.filter((r) => r.source !== "task");
            const showGroupLabels = taskItems.length > 0 && activityItems.length > 0;

            const renderItem = (entity: typeof results[number], index: number) => {
              const isHighlighted = index === activeHighlightedIndex;
              return (
                <li key={`${entity.id}-${entity.name}`} className={styles.optionItem}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isHighlighted}
                    className={classNames(styles.optionButton, {
                      [styles.optionButtonActive]: isHighlighted,
                    })}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commitSelection(entity)}
                  >
                    {entity.name}
                  </button>
                </li>
              );
            };

            return (
              <>
                {taskItems.length > 0 && (
                  <>
                    {showGroupLabels && (
                      <li role="presentation" className={styles.groupLabel}>Tasks</li>
                    )}
                    {taskItems.map((entity) => renderItem(entity, results.indexOf(entity)))}
                  </>
                )}
                {activityItems.length > 0 && (
                  <>
                    {showGroupLabels && (
                      <li role="presentation" className={styles.groupLabel}>Activities</li>
                    )}
                    {activityItems.map((entity) => renderItem(entity, results.indexOf(entity)))}
                  </>
                )}
              </>
            );
          })()}
        </ul>
      )}
    </div>
  );
}
