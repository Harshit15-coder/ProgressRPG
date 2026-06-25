// components/ErrorFallback.tsx
import Button from "./Button/Button";

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div role="alert">
      <h2>Something went wrong:</h2>
      <pre style={{ color: "red" }}>{error.message}</pre>
      <Button onClick={resetErrorBoundary}>Try again</Button>
    </div>
  );
}

export default ErrorFallback;
