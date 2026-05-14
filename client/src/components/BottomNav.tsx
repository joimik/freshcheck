import { NavLink } from 'react-router-dom';
import { Home, Flame, BarChart3, Settings, Plus } from 'lucide-react';

type Props = { onAddClick: () => void };

const leftTabs = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/streak', label: 'Streak', Icon: Flame },
] as const;

const rightTabs = [
  { to: '/stats', label: 'Stats', Icon: BarChart3 },
  { to: '/settings', label: 'Settings', Icon: Settings },
] as const;

export function BottomNav({ onAddClick }: Props) {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-[#141414]/95 backdrop-blur border-t border-[#2a2a2a] z-40">
      <div className="max-w-md mx-auto grid grid-cols-5 items-end px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {leftTabs.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end className="flex flex-col items-center py-2 text-xs text-gray-500">
            {({ isActive }) => (
              <>
                <Icon size={22} className={isActive ? 'text-fresh' : ''} strokeWidth={isActive ? 2.5 : 2} />
                <span className={isActive ? 'text-fresh font-medium mt-0.5' : 'mt-0.5'}>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        <button
          onClick={onAddClick}
          aria-label="Add item"
          className="relative flex flex-col items-center"
        >
          <span className="absolute -top-6 inline-flex items-center justify-center w-14 h-14 rounded-full bg-fresh text-white shadow-lg shadow-fresh/30 active:scale-95 transition">
            <Plus size={28} strokeWidth={2.5} />
          </span>
          <span className="text-xs text-gray-500 mt-9">Add</span>
        </button>

        {rightTabs.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end className="flex flex-col items-center py-2 text-xs text-gray-500">
            {({ isActive }) => (
              <>
                <Icon size={22} className={isActive ? 'text-fresh' : ''} strokeWidth={isActive ? 2.5 : 2} />
                <span className={isActive ? 'text-fresh font-medium mt-0.5' : 'mt-0.5'}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
