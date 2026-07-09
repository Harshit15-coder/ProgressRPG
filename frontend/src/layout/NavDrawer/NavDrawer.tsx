import React, { useCallback, useEffect, useRef } from "react";
import styles from "./NavDrawer.module.scss";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";

interface NavDrawerProps {
  drawerOpen: boolean;
  onClose: () => void;
}

export default function NavDrawer({ drawerOpen, onClose }: NavDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const { isAuthenticated } = useAuth();
  const isTasksEnabled = useFeatureFlag("tasksFeature");
  const isLibraryEnabled = useFeatureFlag("your_library");

  const handleClose = useCallback(() => {
    const activeElement = document.activeElement as HTMLElement | null;
    if (drawerRef.current?.contains(activeElement)) {
      activeElement?.blur?.();
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (drawerOpen) {
      drawerRef.current?.focus();

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          handleClose();
        }
      };

      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [drawerOpen, handleClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`${styles.overlay} ${drawerOpen ? styles.visible : ""}`}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <nav
        ref={drawerRef}
        className={`${styles["nav-drawer"]} ${drawerOpen ? styles.drawerOpen : ""}`}
        aria-label="Side navigation"
        aria-hidden={!drawerOpen}
        inert={!drawerOpen ? true : undefined}
        tabIndex={-1}
      >
        <div className={styles["nav-drawer-header"]}>
          <button
            onClick={handleClose}
            aria-label="Close navigation drawer"
            className={styles.closeButton}
          >
            ✕
          </button>
        </div>

        <ul className={styles["nav-drawer-links"]} role="list">
          {isAuthenticated ? (
            <>
              <li>
                <Link to="/timer" onClick={handleClose} tabIndex={drawerOpen ? 0 : -1}>
                  <span aria-hidden="true">⏱ </span>Timer
                </Link>
              </li>
              {isLibraryEnabled ? (
                <li>
                  <Link
                    to="/library"
                    onClick={handleClose}
                    tabIndex={drawerOpen ? 0 : -1}
                  >
                    <span aria-hidden="true">📚 </span>Your library
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link
                      to="/activities"
                      onClick={handleClose}
                      tabIndex={drawerOpen ? 0 : -1}
                    >
                      <span aria-hidden="true">📋 </span>Activities
                    </Link>
                  </li>
                  {isTasksEnabled && (
                    <li>
                      <Link
                        to="/tasks"
                        onClick={handleClose}
                        tabIndex={drawerOpen ? 0 : -1}
                      >
                        <span aria-hidden="true">✅ </span>Tasks
                      </Link>
                    </li>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <li>
                <Link to="/" onClick={handleClose} tabIndex={drawerOpen ? 0 : -1}>
                  <span aria-hidden="true">🏠 </span>Home
                </Link>
              </li>
              <li>
                <Link to="/login" onClick={handleClose} tabIndex={drawerOpen ? 0 : -1}>
                  <span aria-hidden="true">🔑 </span>Log in
                </Link>
              </li>
              <li>
                <Link
                  to="/register"
                  onClick={handleClose}
                  tabIndex={drawerOpen ? 0 : -1}
                >
                  Join the waiting list
                </Link>
              </li>
            </>
          )}
        </ul>
      </nav>
    </>
  );
}
