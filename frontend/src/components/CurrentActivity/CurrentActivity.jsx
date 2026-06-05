import classNames from "classnames";
import { useGame } from "../../context/GameContext";
import ActivityInput from "../ActivityInput/ActivityInput";
import styles from "./CurrentActivity.module.scss";

export default function CurrentActivity() {
  const { activityTimer } = useGame();
  const isActive = activityTimer?.status === "active";

  return (
    <section className={classNames(styles.wrapper, { [styles.isActive]: isActive })}>
      <h2 className={styles.heading}>Activity timer</h2>
      <div className={styles.playerCard}>
        <ActivityInput />
      </div>
    </section>
  );
}
