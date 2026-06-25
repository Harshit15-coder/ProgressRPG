// SupportFlow/screens/PostSupportMenuScreen.tsx
import React from "react";
import Button from "../../Button/Button";
import ButtonFrame from "../../Button/ButtonFrame";

interface PostSupportMenuScreenProps {
  onTryTask?: () => void;
  onMoreSupport?: () => void;
}

export default function PostSupportMenuScreen({ onTryTask, onMoreSupport }: PostSupportMenuScreenProps) {
  return (
    <div>
      <p>How are you feeling now?</p>
      <ButtonFrame>
        <Button onClick={onTryTask}>Try starting a task</Button>
        <Button onClick={onMoreSupport}>Do another support action</Button>
      </ButtonFrame>
    </div>
  );
}
