import React from "react";

export default function UnavailablePage(): React.ReactElement {
  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "2rem" }}>
      <h1>Server Unavailable</h1>
      <p>We're having trouble reaching the server. Please try again in a moment.</p>
      <button onClick={() => window.history.back()}>Go back</button>
    </div>
  );
}
