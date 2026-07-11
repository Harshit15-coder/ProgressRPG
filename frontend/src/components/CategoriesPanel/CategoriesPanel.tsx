import React from "react";

import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "../../hooks/useCategories";
import { useSimpleCrudPanel } from "../../hooks/useSimpleCrudPanel";
import type { Category } from "../../types";
import Input from "../Input/Input";
import Button from "../Button/Button";
import PlayerItemList from "../PlayerItemList/PlayerItemList";
import styles from "./CategoriesPanel.module.scss";

const renderCategoryMeta = (category: Category) => (
  <>
    Total XP: {category.total_xp} • Total time: {category.total_time} • Records: {category.total_records}
  </>
);

export default function CategoriesPanel(): React.ReactElement | null {
  const { isLoading, items, newName, setNewName, handleCreate, handleEdit, handleDelete } = useSimpleCrudPanel<Category>({
    useList: useCategories,
    useCreate: useCreateCategory,
    useUpdate: useUpdateCategory,
    useDelete: useDeleteCategory,
  });

  if (isLoading) return <p>Loading categories...</p>;

  return (
    <div className={styles.page}>
      <form className={styles.addCategoryForm} onSubmit={handleCreate}>
        <Input
          id="new-category-name"
          value={newName}
          onChange={(v) => setNewName(v as string)}
          placeholder="New category name"
          className={styles.addCategoryInput}
        />
        <Button type="submit">Add category</Button>
      </form>

      {items.length > 0 ? (
        <div className={styles.categoriesList}>
          <PlayerItemList<Category>
            items={items}
            itemLabel="category"
            ariaLabel="Categories"
            renderItemMeta={renderCategoryMeta}
            renderEditSummary={renderCategoryMeta}
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
