import React from "react";
import classNames from "classnames";

import Button from "../Button/Button";
import EntitySearchInput from "../EntitySearchInput/EntitySearchInput";
import styles from "./ActivityInput.module.scss";
import { useActivityInput } from "./useActivityInput";
import SupportFlowModal from "../SupportFlow/SupportFlowModal";

export default function ActivityInput() {
  const {
    name,
    setName,
    isActive,
    inputValue,
    minutes,
    seconds,
    formattedLimit,
    showAutoStopWarning,
    flowState,
    flowDispatch,
    handleConfirmActivity,
    handleToggle,
    handleSelectActivity,
    handleCreateActivity,
    handleSupportModeClick,
  } = useActivityInput();

  return (
    <>
      <div className={styles.containerOuter}>
        <div
          className={classNames(styles.container, {
            [styles.isRunning]: isActive,
            [styles.needsAttention]: !isActive,
          })}
        >
          <div className={styles.row}>
            <div className={classNames(styles.grow, styles.control)}>
              <EntitySearchInput
                type="activity"
                value={inputValue}
                onChange={setName}
                onSelect={async (activity) => {
                  await handleSelectActivity(activity);
                }}
                onCreate={async (activityName) => {
                  await handleCreateActivity(activityName);
                }}
                placeholder="What are you working on? e.g. washing dishes"
                ariaLabel="Activity name"
                className={styles.entitySearch}
                inputClassName={classNames(styles.inputText, {
                  [styles.inputCTA]: !isActive,
                  [styles.inputMuted]: isActive,
                })}
                searchEnabled={!isActive}
              />
            </div>

            <div className={classNames(styles.timerPill, styles.control)}>
              {minutes}:{seconds.toString().padStart(2, "0")}
            </div>

            <Button
              onClick={handleToggle}
              variant="primary"
              disabled={!isActive && !name.trim()}
              className={classNames(styles.ctaButton, styles.control)}
            >
              {isActive ? "Stop" : "Start"}
            </Button>
          </div>

        </div>

        {showAutoStopWarning && (
          <p className={styles.limitWarning}>
            This timer will stop automatically when it reaches {formattedLimit}.
          </p>
        )}

        <div className={styles.supportButtonRow}>
          <Button
            onClick={handleSupportModeClick}
            variant="secondary"
            className={styles.supportModeButton}
            ariaLabel="Open support mode"
          >
            Need support?
          </Button>
        </div>

      </div>

      <SupportFlowModal
        state={flowState}
        dispatch={flowDispatch}
        onConfirmActivity={handleConfirmActivity}
      />
    </>
  );
}
