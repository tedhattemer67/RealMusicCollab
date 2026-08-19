// The design system explicitly forbids decorative color beyond the one
// steel accent, so status is signaled by weight/emphasis instead of hue:
// settled/positive -> accent fill, needs-attention -> outline, informational -> neutral.
const VARIANTS = {
  neutral: 'tag-neutral',
  accent: 'tag-accent',
  outline: 'tag-outline',
};

export default function Badge({ variant = 'neutral', children }) {
  const cls = VARIANTS[variant] || VARIANTS.neutral;
  return <span className={`tag ${cls}`}>{children}</span>;
}
