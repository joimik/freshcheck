type Props = {
  emoji: string;
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
};

export function EmptyState({ emoji, title, hint, action }: Props) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-6xl mb-3">{emoji}</div>
      <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
      {hint && <p className="text-sm text-gray-500 mt-1.5 max-w-xs mx-auto">{hint}</p>}
      {action && (
        <button onClick={action.onClick} className="btn-primary mt-5">
          {action.label}
        </button>
      )}
    </div>
  );
}
