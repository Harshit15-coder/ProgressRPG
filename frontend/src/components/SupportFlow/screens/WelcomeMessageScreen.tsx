// SupportFlow/screens/WelcomeMessageScreen.tsx
import React from "react";
import Button from "../../Button/Button";
import ButtonFrame from "../../Button/ButtonFrame";

interface WelcomeMessageScreenProps {
  loginState?: string;
  loginStreak?: number;
  loginRewardXp?: number;
  onStart?: () => void;
  onSupport?: () => void;
}

function getWelcomeMessage(loginState: string | undefined, loginStreak: number | undefined): string {
  switch (loginState) {
    case "first_login_ever":
      return "Welcome to Progress RPG. Let's get started!";
    case "already_logged_today":
      return `Welcome back! You logged in earlier today. You have logged in for ${loginStreak} day${loginStreak !== 1 ? "s" : ""} in a row.`;
    case "streak_continues":
      return `Welcome back! Your login streak is now ${loginStreak} day${loginStreak !== 1 ? "s" : ""}.`;
    case "streak_reset":
      return "Welcome back, we missed you! Your login streak has been reset.";
    default:
      return "Welcome back! You showed up today.";
  }
}

export default function WelcomeMessageScreen({
  loginState,
  loginStreak,
  loginRewardXp,
  onStart,
  onSupport,
}: WelcomeMessageScreenProps) {
  const message = getWelcomeMessage(loginState, loginStreak);

  return (
    <div>
      <p>{message}</p>
      {Number(loginRewardXp) > 0 ? <p>You earned +{loginRewardXp} XP from today's login.</p> : null}
      <ButtonFrame>
        <Button onClick={onStart}>Start</Button>
        <Button onClick={onSupport}>Get support</Button>
      </ButtonFrame>
    </div>
  );
}
