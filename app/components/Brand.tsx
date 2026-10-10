import Link from "next/link";

/** The Tabby wordmark. Always a way back home; on the home page it resets to a fresh bill instead. */
export function Brand({ onHome }: { onHome?: () => void }) {
  if (onHome) {
    return (
      <button type="button" className="brand brand-btn" onClick={onHome} aria-label="Tabby, start over">
        Tabby
      </button>
    );
  }
  return (
    <Link href="/" className="brand" aria-label="Tabby home">
      Tabby
    </Link>
  );
}
