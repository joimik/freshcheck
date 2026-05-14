import { useState, useEffect } from 'react';
import { ChefHat, Sparkles, Loader2, ExternalLink, Bookmark } from 'lucide-react';
import type { Item, Recipe } from '../types';
import { daysUntil } from '../utils/dates';
import { api } from '../utils/api';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../hooks/useToast';

const SAVED_KEY = 'freshcheck.savedRecipes';

function loadSaved(): Recipe[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecipe(r: Recipe) {
  const existing = loadSaved();
  if (existing.find((e) => e.name === r.name)) return;
  localStorage.setItem(SAVED_KEY, JSON.stringify([r, ...existing]));
}

export function Recipes({ items }: { items: Item[] }) {
  const toast = useToast();
  const expiring = items.filter((i) => {
    const d = daysUntil(i.expiry_date);
    return d >= 0 && d <= 3;
  });

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<Recipe[]>(loadSaved());

  useEffect(() => {
    const cached = localStorage.getItem('freshcheck.lastRecipes');
    if (cached) {
      try {
        setRecipes(JSON.parse(cached));
      } catch {
        /* ignore */
      }
    }
  }, []);

  async function generate() {
    if (!expiring.length) {
      toast('Nothing is expiring within 3 days', 'info');
      return;
    }
    setLoading(true);
    try {
      const { recipes } = await api.generateRecipes(
        expiring.map((i) => i.product_name.toLowerCase().split(/\s|,/)[0])
      );
      setRecipes(recipes);
      localStorage.setItem('freshcheck.lastRecipes', JSON.stringify(recipes));
      if (!recipes.length) toast('No recipes matched — try different items', 'info');
    } catch (err) {
      toast((err as Error).message || 'Failed to load recipes', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleSave(r: Recipe) {
    saveRecipe(r);
    setSaved(loadSaved());
    toast('Recipe saved', 'success');
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="pt-2 flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-black shadow-md shrink-0">
          <img src="/icons/recipes.png" alt="Recipes" className="w-full h-full object-cover" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500">Use it up</div>
          <h1 className="text-2xl font-bold text-white">Recipes</h1>
        </div>
      </header>

      <div className="card">
        <div className="text-sm font-medium text-gray-200">Expiring within 3 days</div>
        {expiring.length === 0 ? (
          <p className="text-xs text-gray-500 mt-1">Nothing urgent right now — your fridge is happy.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {expiring.map((e) => (
              <span key={e.id} className="text-xs bg-amber-900/40 text-warn px-2 py-1 rounded-full">
                {e.product_name}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={generate}
          disabled={loading || expiring.length === 0}
          className="btn-primary w-full mt-3"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          Generate recipes
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      ) : recipes.length > 0 ? (
        <div className="space-y-3">
          {recipes.map((r) => (
            <RecipeCard key={r.name} recipe={r} onSave={handleSave} />
          ))}
        </div>
      ) : (
        <EmptyState
          emoji="🍳"
          title="No recipes yet"
          hint={expiring.length ? 'Tap "Generate recipes" to get ideas.' : 'Add a few items to your fridge first.'}
        />
      )}

      {saved.length > 0 && (
        <section className="pt-3">
          <h2 className="text-sm font-semibold text-gray-400 mb-2">Saved recipes</h2>
          <div className="space-y-2">
            {saved.map((r) => (
              <div key={r.name} className="card flex items-center gap-3">
                <ChefHat size={20} className="text-gray-600" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-200 truncate">{r.name}</div>
                  <div className="text-xs text-gray-500">{r.prep_time}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RecipeCard({ recipe, onSave }: { recipe: Recipe; onSave: (r: Recipe) => void }) {
  return (
    <div className="card">
      <div className="flex gap-3">
        {recipe.thumbnail && (
          <img src={recipe.thumbnail} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white leading-tight">{recipe.name}</h3>
          <div className="text-xs text-gray-500 mt-0.5">⏱ {recipe.prep_time}</div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {recipe.uses_ingredients.map((i) => (
              <span key={i} className="text-[10px] bg-green-900/40 text-fresh px-1.5 py-0.5 rounded-full">
                {i}
              </span>
            ))}
          </div>
        </div>
      </div>
      <ol className="mt-3 space-y-1.5 text-sm text-gray-300 list-decimal list-inside">
        {recipe.steps.map((s, idx) => (
          <li key={idx}>{s}</li>
        ))}
      </ol>
      <div className="flex gap-2 mt-3">
        <button onClick={() => onSave(recipe)} className="btn-ghost flex-1">
          <Bookmark size={16} /> Save
        </button>
        <a href={recipe.source} target="_blank" rel="noreferrer" className="btn-ghost flex-1">
          <ExternalLink size={16} /> Full recipe
        </a>
      </div>
    </div>
  );
}
