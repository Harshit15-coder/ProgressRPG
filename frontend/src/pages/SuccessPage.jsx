import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../utils/api.js";

export default function SuccessPage() {
  const [status, setStatus] = useState("syncing"); // "syncing" | "active" | "trialing" | "error"

  useEffect(() => {
    apiFetch("/payments/sync-subscription/", { method: "POST" })
      .then((data) => {
        setStatus(data.status === "active" || data.status === "trialing" ? data.status : "error");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "2rem" }}>
      <h1>Payment Successful</h1>
      {status === "syncing" && <p>Activating your subscription…</p>}
      {(status === "active" || status === "trialing") && (
        <p>Your subscription is active. Welcome to premium!</p>
      )}
      {status === "error" && (
        <p>
          Your payment was received but we couldn't confirm the subscription right away.
          It will activate automatically — check your account in a few minutes.
        </p>
      )}
      <Link to="/account">Go to account</Link>
    </div>
  );
}
