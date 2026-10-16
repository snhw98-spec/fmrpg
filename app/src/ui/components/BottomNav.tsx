export type NavScreen = 'inbox' | 'squad' | 'tactics' | 'transfers' | 'club' | 'stats';

const ITEMS: { id: NavScreen; label: string; icon: string }[] = [
  { id: 'inbox', label: 'Inbox', icon: '✉️' },
  { id: 'squad', label: 'Squad', icon: '👥' },
  { id: 'tactics', label: 'Tactics', icon: '📋' },
  { id: 'transfers', label: 'Transfers', icon: '🔁' },
  { id: 'club', label: 'Club', icon: '🏟️' },
  { id: 'stats', label: 'Stats', icon: '📊' },
];

export function BottomNav({
  active,
  onChange,
}: {
  active: NavScreen;
  onChange: (screen: NavScreen) => void;
}) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`bottom-nav-item${item.id === active ? ' active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          <span className="bottom-nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="bottom-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
