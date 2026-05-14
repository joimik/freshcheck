import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './hooks/useToast';
import { BottomNav } from './components/BottomNav';
import { AddItemModal } from './components/AddItemModal';
import { Home } from './pages/Home';
import { Recipes } from './pages/Recipes';
import { Stats } from './pages/Stats';
import { Settings } from './pages/Settings';
import { useItems } from './hooks/useItems';
import { api } from './utils/api';
import { registerServiceWorker } from './utils/notifications';

function Shell() {
  const { items, loading, add, remove, markUsed, refresh } = useItems();
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  async function clearAll() {
    await api.clearAll();
    await refresh();
  }

  return (
    <>
      <main className="max-w-md mx-auto px-4 pt-4 pb-28">
        <Routes>
          <Route
            path="/"
            element={
              <Home
                items={items}
                loading={loading}
                onDelete={remove}
                onUse={markUsed}
                onAdd={() => setAddOpen(true)}
              />
            }
          />
          <Route path="/recipes" element={<Recipes items={items} />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings items={items} onClearAll={clearAll} />} />
        </Routes>
      </main>
      <BottomNav onAddClick={() => setAddOpen(true)} />
      <AddItemModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={add} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </BrowserRouter>
  );
}
