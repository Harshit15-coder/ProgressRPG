import React from "react";
import styles from "./StaticBanner.module.scss";

interface StaticBannerProps {
  message?: string;
}

const StaticBanner = ({ message }: StaticBannerProps) => {
  if (!message) return null;
  return (
    <section className={styles.banner} aria-label="Site announcement">
      <p className={styles.bannerText}>{message}</p>
    </section>
  );
};

export default StaticBanner;
