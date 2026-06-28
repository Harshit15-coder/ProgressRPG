import React, { useCallback, useMemo, useState } from "react";
import classNames from "classnames";

import Button from "../Button/Button";
import List from "../List/List";
import Modal from "../Modal/Modal";
import styles from "./PlayerItemList.module.scss";

export interface SortOption<T> {
  key: string;
  label: string;
  compareFn: (a: T, b: T) => number;
}

export interface FilterOption<T> {
  key: string;
  label: string;
  predicate: (item: T) => boolean;
}

interface PlayerItemListProps<T extends { id?: string | number; name?: string; [key: string]: unknown }> {
  items?: T[];
  itemLabel?: string;
  ariaLabel?: string;
  getItemName?: (item: T) => string;
  isItemComplete?: (item: T) => boolean;
  onToggleComplete?: (item: T) => void;
  getItemKey?: (item: T, index: number) => string | number;
  renderItemMeta?: (item: T) => React.ReactNode;
  renderEditSummary?: (item: T) => React.ReactNode;
  onEdit?: (item: T, name: string) => void;
  onDelete?: (item: T) => void;
  hoverEdit?: boolean;
  renderRowActions?: (item: T) => React.ReactNode;
  listClassName?: string;
  sectionClassName?: string;
  sortOptions?: SortOption<T>[];
  filterOptions?: FilterOption<T>[];
  controls?: React.ReactNode;
}

export default function PlayerItemList<T extends { id?: string | number; name?: string; [key: string]: unknown }>({
  items = [],
  itemLabel = "item",
  ariaLabel,
  getItemName = (item) => (item?.name ?? "") as string,
  isItemComplete,
  onToggleComplete,
  getItemKey,
  renderItemMeta,
  renderEditSummary,
  onEdit,
  onDelete,
  hoverEdit = false,
  renderRowActions,
  listClassName,
  sectionClassName,
  sortOptions,
  filterOptions,
  controls,
}: PlayerItemListProps<T>) {
  const [activeItem, setActiveItem] = useState<T | null>(null);
  const [activeFilterKey, setActiveFilterKey] = useState<string | null>(
    () => filterOptions?.[0]?.key ?? null,
  );
  const [activeSortKey, setActiveSortKey] = useState<string | null>(
    () => sortOptions?.[0]?.key ?? null,
  );
  const [editingName, setEditingName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const itemLabelLower = itemLabel.toLowerCase();
  const canToggleComplete = typeof onToggleComplete === "function";
  const canEdit = typeof onEdit === "function";
  const canDelete = typeof onDelete === "function";

  const activeItemName = activeItem ? getItemName(activeItem) : "";
  const modalSummary = activeItem
    ? (renderEditSummary?.(activeItem) ?? renderItemMeta?.(activeItem) ?? null)
    : null;

  const handleOpenItem = useCallback(
    (item: T) => {
      setActiveItem(item);
      setEditingName(getItemName(item));
    },
    [getItemName],
  );

  const handleModalClose = useCallback(() => {
    setActiveItem(null);
    setEditingName("");
    setConfirmingDelete(false);
  }, []);

  const handleEditSave = useCallback(() => {
    if (!activeItem || !canEdit) {
      return;
    }

    const trimmedName = editingName.trim();
    if (!trimmedName) {
      return;
    }

    onEdit!(activeItem, trimmedName);
    handleModalClose();
  }, [activeItem, canEdit, editingName, handleModalClose, onEdit]);

  const handleDeleteRequest = useCallback(() => {
    setConfirmingDelete(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!activeItem || !canDelete) {
      return;
    }
    onDelete!(activeItem);
    handleModalClose();
  }, [activeItem, canDelete, handleModalClose, onDelete]);

  const modalIdPrefix = useMemo(
    () => itemLabelLower.replace(/\s+/g, "-"),
    [itemLabelLower],
  );

  const displayItems = useMemo(() => {
    let result = items;
    const activeFilter = filterOptions?.find((o) => o.key === activeFilterKey);
    if (activeFilter) result = result.filter(activeFilter.predicate);
    const activeSort = sortOptions?.find((o) => o.key === activeSortKey);
    if (activeSort) result = [...result].sort(activeSort.compareFn);
    return result;
  }, [items, filterOptions, activeFilterKey, sortOptions, activeSortKey]);

  const hasControls = Boolean(filterOptions?.length || sortOptions?.length || controls);

  return (
    <div className={styles.wrapper}>
      {hasControls ? (
        <div className={styles.controls}>
          {controls ?? null}
          {filterOptions?.length ? (
            <div className={styles.controlGroup} role="group" aria-label={`Filter ${itemLabelLower}s`}>
              {filterOptions.map((opt) => (
                <Button
                  key={opt.key}
                  variant={activeFilterKey === opt.key ? "primary" : "secondary"}
                  onClick={() => setActiveFilterKey(opt.key)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          ) : null}
          {sortOptions?.length ? (
            <div className={styles.controlGroup}>
              <label className={styles.controlLabel} htmlFor={`${modalIdPrefix}-sort`}>
                Sort:
              </label>
              <select
                id={`${modalIdPrefix}-sort`}
                className={styles.sortSelect}
                value={activeSortKey ?? ""}
                onChange={(e) => setActiveSortKey(e.target.value)}
              >
                {sortOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={styles.listScroll}>
      <List
        items={displayItems}
        ariaLabel={ariaLabel}
        canHover
        className={classNames(styles.list, listClassName)}
        sectionClass={classNames(styles.section, sectionClassName)}
        getKey={getItemKey}
        getItemClassName={(item) =>
          classNames(styles.item, {
            [styles.itemCompleted]: isItemComplete?.(item),
          })
        }
        renderItem={(item) => (
          <>
            {canToggleComplete ? (
              <label className={styles.completeCheckboxLabel}>
                <input
                  className={styles.completeCheckbox}
                  type="checkbox"
                  checked={Boolean(isItemComplete?.(item))}
                  onChange={() => onToggleComplete!(item)}
                  aria-label={`Mark ${getItemName(item) || itemLabelLower} as complete`}
                />
              </label>
            ) : null}
            {hoverEdit ? (
              <div className={styles.itemContent}>
                <div className={styles.itemDetails}>
                  <div className={styles.itemName}>{getItemName(item)}</div>
                  {renderItemMeta ? (
                    <div className={styles.itemMeta}>{renderItemMeta(item)}</div>
                  ) : null}
                </div>
                <div className={styles.rowActions}>
                  {renderRowActions?.(item)}
                  {canEdit ? (
                    <button
                      type="button"
                      className={styles.editHoverButton}
                      aria-label={`Edit ${itemLabelLower} ${getItemName(item)}`}
                      onClick={() => handleOpenItem(item)}
                    >
                      📝
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={styles.itemButton}
                aria-label={`Open ${itemLabelLower} ${getItemName(item)}`}
                onClick={() => handleOpenItem(item)}
              >
                <div className={styles.itemDetails}>
                  <div className={styles.itemName}>{getItemName(item)}</div>
                  {renderItemMeta ? (
                    <div className={styles.itemMeta}>{renderItemMeta(item)}</div>
                  ) : null}
                </div>
              </button>
            )}
          </>
        )}
      />
      </div>

      {activeItem ? (
        <Modal
          id={`edit-${modalIdPrefix}-modal`}
          title={
            confirmingDelete
              ? `Delete ${itemLabelLower}?`
              : `Edit ${itemLabelLower}`
          }
          onClose={handleModalClose}
          onBack={confirmingDelete ? () => setConfirmingDelete(false) : undefined}
          backLabel="Back"
        >
          {confirmingDelete ? (
            <div className={styles.deleteConfirmContent}>
              <p>
                Are you sure you want to delete
                {activeItemName ? ` "${activeItemName}"` : ` this ${itemLabelLower}`}?
              </p>
              <div className={styles.deleteConfirmActions}>
                <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={handleDeleteConfirm}>
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.editConfirmContent}>
              {canEdit ? (
                <input
                  type="text"
                  className={styles.editInput}
                  aria-label={`${itemLabel} name`}
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleEditSave();
                    if (event.key === "Escape") handleModalClose();
                  }}
                />
              ) : null}
              {modalSummary ? (
                <p className={styles.editConfirmMeta}>{modalSummary}</p>
              ) : null}
              <div className={styles.editConfirmActions}>
                {canEdit ? (
                  <Button variant="primary" onClick={handleEditSave}>
                    Save
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={handleModalClose}>
                  {canEdit ? "Cancel" : "Close"}
                </Button>
                {canDelete ? (
                  <Button variant="secondaryDanger" onClick={handleDeleteRequest}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
