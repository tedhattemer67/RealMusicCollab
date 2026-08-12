const COLORS = {
  gray: { bg: '#eee', fg: '#555' },
  blue: { bg: '#e6f1fb', fg: '#185fa5' },
  amber: { bg: '#faeeda', fg: '#854f0b' },
  green: { bg: '#eaf3de', fg: '#3b6d11' },
};

export default function Badge({ color = 'gray', children }) {
  const c = COLORS[color] || COLORS.gray;
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 6,
        marginLeft: 6,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
