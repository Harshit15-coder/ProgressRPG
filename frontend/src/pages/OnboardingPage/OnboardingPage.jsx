import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../utils/api";
import TutorialModal from "../../components/TutorialModal/TutorialModal";

export default function OnboardingPage() {
  const navigate = useNavigate();

  const handleClose = () => {
    // Closing without finishing still leaves onboarding incomplete —
    // the route guard will redirect back here on next navigation.
  };

  const handleComplete = async () => {
    try {
      await apiFetch("/me/complete_onboarding/", { method: "POST" });
    } catch {
      // Non-fatal — still navigate forward
    }
    navigate("/timer", { replace: true });
  };

  return (
    <TutorialModal
      onClose={handleClose}
      onComplete={handleComplete}
    />
  );
}
