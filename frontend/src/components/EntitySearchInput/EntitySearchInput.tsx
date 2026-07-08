import type { CSSProperties } from "react";
import classNames from "classnames";

import {
  useEntitySearchInput,
  type SearchEntity,
} from "./useEntitySearchInput";
import styles from "./EntitySearchInput.module.scss";

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
  /** Shown in place of Fuse results when the query is blank. */
  defaultResults?: SearchEntity[];
  /** Keep the dropdown open regardless of focus (persistent list mode). */
  alwaysOpen?: boolean;
  /** Cap the combined (task + activity) rows rendered, regardless of source. */
  maxVisibleRows?: number;
  /** Shown instead of the list when alwaysOpen is set and there are no rows. */
  emptyMessage?: string;
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
  defaultResults,
  alwaysOpen = false,
  maxVisibleRows,
  emptyMessage,
}: EntitySearchInputProps) {
  const {
    rootRef,
    canSearch,
    results,
    taskItems,
    activityItems,
    showGroupLabels,
    isDropdownOpen,
    activeHighlightedIndex,
    handleInputFocus,
    handleInputChange,
    handleKeyDown,
    commitSelection,
  } = useEntitySearchInput({
    type,
    value,
    onChange,
    onSelect,
    onCreate,
    disabled,
    searchEnabled,
    defaultResults,
    alwaysOpen,
    maxVisibleRows,
  });

  // Persistent mode reserves room for maxVisibleRows (worst case: both group
  // labels shown) so the list settling to fewer rows, or falling back to
  // emptyMessage, doesn't reflow whatever sits below it.
  const persistentMinHeightStyle =
    alwaysOpen && typeof maxVisibleRows === "number"
      ? ({
          "--entity-search-persistent-min-height": `calc(${maxVisibleRows} * 2.75rem + 2 * 1.75rem)`,
        } as CSSProperties)
      : undefined;

  return (
    <div ref={rootRef} className={classNames(styles.root, className)}>
      <input
        type="text"
        role="combobox"
        value={value}
        onChange={(event) => handleInputChange(event.target.value)}
        onFocus={handleInputFocus}
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
          className={classNames(styles.dropdown, { [styles.dropdownPersistent]: alwaysOpen })}
          role="listbox"
          aria-label={`${type} suggestions`}
          style={persistentMinHeightStyle}
        >
          {(() => {
            const renderItem = (entity: SearchEntity, index: number) => {
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

      {alwaysOpen && !isDropdownOpen && emptyMessage && (
        <p className={styles.emptyMessage} style={persistentMinHeightStyle}>
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
