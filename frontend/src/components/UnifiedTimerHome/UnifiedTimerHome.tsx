import React, { useRef, useState } from "react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";

import Button from "../Button/Button";
import AlertDialog from "../AlertDialog/AlertDialog";
import EntitySearchInput from "../EntitySearchInput/EntitySearchInput";
import SupportFlowModal from "../SupportFlow/SupportFlowModal";
import { useActivityInput } from "../ActivityInput/useActivityInput";
import { useDefaultActivityEntries } from "../../hooks/useDefaultActivityEntries";
import styles from "./UnifiedTimerHome.module.scss";

export default function UnifiedTimerHome() {
  const {
    name,
    setName,
    isActive,
    isUnlabelled,
    isEditingLabel,
    inputValue,
    minutes,
    seconds,
    formattedLimit,
    showAutoStopWarning,
    flowState,
    flowDispatch,
    handleConfirmActivity,
    handleToggle,
    handleBlankStart,
    handleUnifiedSelect,
    handleUnifiedSubmit,
    startEditingLabel,
    handleLabelBlur,
    handleLabelCancel,
    submitAndOpenSupport,
    openSupportMode,
  } = useActivityInput();

  const defaultResults = useDefaultActivityEntries();
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const listWrapperRef = useRef<HTMLDivElement>(null);

  // Label display (clickable name) only shows for a labelled, non-editing
  // running timer; every other case shows the list/input (no timer running,
  // an unlabelled running timer, or an in-progress click-to-edit).
  const showLabelDisplay = isActive && !isUnlabelled && !isEditingLabel;

  const handleWrapperKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && isEditingLabel) {
      handleLabelCancel();
      (event.target as HTMLElement).blur();
    }
  };

  const handleWrapperBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!isEditingLabel) return;
    if (listWrapperRef.current?.contains(event.relatedTarget as Node)) return;
    handleLabelBlur();
  };

  return (
    <>
      <section
        className={classNames(styles.wrapper, { [styles.isActive]: isActive })}
        aria-live="polite"
      >
        <h2 className="sr-only">Activity timer</h2>

        <AnimatePresence mode="wait" initial={false}>
          {showLabelDisplay ? (
            <motion.div
              key="labelled"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={styles.runningRow}
            >
              <button
                type="button"
                className={styles.activityLabel}
                onClick={startEditingLabel}
                aria-label={`Editing label: ${inputValue || "Untitled activity"}. Click to change.`}
              >
                {inputValue || "Untitled activity"}
              </button>

              <div className={styles.timerPill}>
                {minutes}:{seconds.toString().padStart(2, "0")}
              </div>

              <Button onClick={handleToggle} variant="primary" className={styles.ctaButton}>
                Stop
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="input"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={styles.inputRow}
              ref={listWrapperRef}
              onKeyDown={handleWrapperKeyDown}
              onBlur={handleWrapperBlur}
            >
              <div className={styles.searchControl}>
                <EntitySearchInput
                  type="activity"
                  value={inputValue}
                  onChange={setName}
                  onSelect={handleUnifiedSelect}
                  onCreate={handleUnifiedSubmit}
                  placeholder="What are you working on? e.g. washing dishes"
                  ariaLabel="Activity name"
                  alwaysOpen
                  defaultResults={defaultResults}
                  maxVisibleRows={4}
                  emptyMessage="No recent activities yet — type to create one."
                  className={styles.entitySearch}
                  inputClassName={styles.inputText}
                />
              </div>

              {isActive ? (
                <div className={styles.runningControls}>
                  <div className={styles.timerPill}>
                    {minutes}:{seconds.toString().padStart(2, "0")}
                  </div>
                  <Button onClick={handleToggle} variant="primary" className={styles.ctaButton}>
                    Stop
                  </Button>
                </div>
              ) : (
                <div className={styles.startControls}>
                  <Button
                    onClick={handleToggle}
                    variant="primary"
                    disabled={!name.trim()}
                    className={styles.ctaButton}
                  >
                    Start
                  </Button>
                  <Button onClick={handleBlankStart} variant="secondary" className={styles.blankStartButton}>
                    Start blank
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {showAutoStopWarning && (
          <p className={styles.limitWarning}>
            This timer will stop automatically when it reaches {formattedLimit}.
          </p>
        )}

        <div className={styles.supportButtonRow}>
          <Button
            onClick={() => {
              if (isActive) {
                setSubmitConfirmOpen(true);
              } else {
                openSupportMode();
              }
            }}
            variant="secondary"
            className={styles.supportModeButton}
            ariaLabel="Open support mode"
          >
            Need support?
          </Button>
        </div>
      </section>

      <AlertDialog
        open={submitConfirmOpen}
        title="Submit active timer?"
        description="You already have a timer running. Submit it before opening Task Support?"
        confirmLabel="Submit & continue"
        cancelLabel="Cancel"
        onCancel={() => setSubmitConfirmOpen(false)}
        onConfirm={() => {
          setSubmitConfirmOpen(false);
          submitAndOpenSupport();
        }}
      />

      <SupportFlowModal
        state={flowState}
        dispatch={flowDispatch}
        onConfirmActivity={handleConfirmActivity}
      />
    </>
  );
}
