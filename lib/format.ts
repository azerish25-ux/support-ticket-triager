export function timeAgo(date: Date | string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function shortId(id: string): string {
  return "#" + id.slice(-4);
}
