export function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="avatar"
      title={name}
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
      aria-label={name}
    >
      {initials}
    </span>
  );
}
