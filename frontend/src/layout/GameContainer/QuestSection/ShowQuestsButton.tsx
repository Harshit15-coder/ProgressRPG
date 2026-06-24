import React from "react";
import Button from "../../../components/Button/Button";

interface ShowQuestsButtonProps {
  onClick?: () => void;
}

export default function ShowQuestsButton({ onClick }: ShowQuestsButtonProps) {
  return (
    <div className="button-frame" id="show-quests-btn-frame">
      <Button className="button-filled" id="show-quests-btn" onClick={onClick}>
        Show quests
      </Button>
    </div>
  );
}
