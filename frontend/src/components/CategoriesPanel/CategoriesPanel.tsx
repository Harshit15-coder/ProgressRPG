import React, { useCallback, useState } from "react";

import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "../../hooks/useCategories";
import type { Category } from "../../types";
import Input from "../Input/Input";
import Button from "../Button/Button";
import PlayerItemList from "../PlayerItemList/PlayerItemList";
import styles from "./CategoriesPanel.module.scss";

export default function CategoriesPanel(): React.ReactElement | null {
  const { data: categories, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [newName, setNewName] = useState("");
  const safeCategories = Array.isArray(categories) ? categories : [];

  const handleCreateCategory = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createCategory.mutate({ name: newName.trim() });
    setNewName("");
  };

  // Cast to satisfy PlayerItemList's generic index-signature constraint
  type ItemRecord = Category & { [key: string]: unknown };

  const handleEdit = useCallback(
    (category: ItemRecord, name: string) => {
      updateCategory.mutate({ id: category.id, data: { name } });
    },
    [updateCategory],
  );

  const handleDelete = useCallback(
    (category: ItemRecord) => {
      deleteCategory.mutate(category.id);
    },
    [deleteCategory],
  );

  if (isLoading) return <p>Loading categories...</p>;

  return (
    <div className={styles.page}>
      <form className={styles.addCategoryForm} onSubmit={handleCreateCategory}>
        <Input
          id="new-category-name"
          value={newName}
          onChange={(v) => setNewName(v as string)}
          placeholder="New category name"
          className={styles.addCategoryInput}
        />
        <Button type="submit">Add category</Button>
      </form>

      {safeCategories.length > 0 ? (
        <div className={styles.categoriesList}>
          <PlayerItemList<ItemRecord>
            items={safeCategories as ItemRecord[]}
            itemLabel="category"
            ariaLabel="Categories"
            renderItemMeta={(category) => (
              <>
                Total XP: {category.total_xp} • Total time: {category.total_time} • Records: {category.total_records}
              </>
            )}
            renderEditSummary={(category) => (
              <>
                Total XP: {category.total_xp} • Total time: {category.total_time} • Records: {category.total_records}
              </>
            )}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>No categories yet.</p>
        </div>
      )}
    </div>
  );
}
