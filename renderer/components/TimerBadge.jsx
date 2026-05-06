export default function TimerBadge({ expiresAt }) {
  if (!expiresAt) return null;

  const days = Math.floor((new Date(expiresAt) - Date.now()) / 86400000);

  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        🔴 Expired
      </span>
    );
  }

  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        🟡 {days} day{days !== 1 ? 's' : ''}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      🟢 Valid
    </span>
  );
}
