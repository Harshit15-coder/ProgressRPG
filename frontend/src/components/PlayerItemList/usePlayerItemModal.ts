import { useCallback, useMemo, useState } from "react";

interface UsePlayerItemModalProps<
  T extends { id?: string | number; name?: string; [key: string]: unknown },
> {
  items: T[];
  getItemName: (item: T) => string;
  renderItemMeta?: (item: T) => React.ReactNode;
  renderEditSummary?: (item: T) => React.ReactNode;
  onEdit?: (item: T, name: string) => void;
  onDelete?: (item: T) => void;
}

export function usePlayerItemModal<
  T extends { id?: string | number; name?: string; [key: string]: unknown },
>({
  items,
  getItemName,
  renderItemMeta,
  renderEditSummary,
  onEdit,
  onDelete,
}: UsePlayerItemModalProps<T>) {
  const [activeItem, setActiveItem] = useState<T | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    if (!activeItem || !onEdit) {
      return;
    }

    const trimmedName = editingName.trim();
    if (!trimmedName) {
      return;
    }

    onEdit(activeItem, trimmedName);
    handleModalClose();
  }, [activeItem, editingName, onEdit, handleModalClose]);

  const handleDeleteRequest = useCallback(() => {
    setConfirmingDelete(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!activeItem || !onDelete) {
      return;
    }

    onDelete(activeItem);
    handleModalClose();
  }, [activeItem, onDelete, handleModalClose]);

  // Keep dialog state in sync with the live items array so toggling
  // complete outside the dialog is reflected immediately.
  const liveActiveItem = useMemo(
    () =>
      activeItem
        ? (
            items.find(
              (item) =>
                item.id !== undefined && item.id === activeItem.id,
            ) ?? activeItem
          )
        : null,
    [activeItem, items],
  );

  const activeItemName = useMemo(
    () => (liveActiveItem ? getItemName(liveActiveItem) : ""),
    [liveActiveItem, getItemName],
  );

  const modalSummary = useMemo(() => {
    if (!liveActiveItem) {
      return null;
    }

    return (
      renderEditSummary?.(liveActiveItem) ??
      renderItemMeta?.(liveActiveItem) ??
      null
    );
  }, [liveActiveItem, renderEditSummary, renderItemMeta]);

  return {
    activeItem,
    liveActiveItem,
    editingName,
    confirmingDelete,

    activeItemName,
    modalSummary,

    setEditingName,
    setConfirmingDelete,

    handleOpenItem,
    handleModalClose,
    handleEditSave,
    handleDeleteRequest,
    handleDeleteConfirm,
  };
}
