import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './hooks/useToast';
import { BottomNav } from './components/BottomNav';
import { ItemModal } from './components/ItemModal';
import { Onboarding, hasSeenOnboarding } from './components/Onboarding';
import { Home } from './pages/Home';
import { Streak } from './pages/Streak';
import { Stats } from './pages/Stats';
import { Settings } from './pages/Settings';
import { Premium } from './pages/Premium';
import { useItems } from './hooks/useItems';
import { api } from './utils/api';
import { registerServiceWorker } from './utils/notifications';
import type { Item } from './types';

function Shell() {
  const { items, loading, add, update, remove, useOne, refresh } = useItems();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(!hasSeenOnboarding());

  useEffect(() => {
    registerServiceWorker();
  }, []);

  async function clearAll() {
    await api.clearAll();
    await refresh();
  }

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(item: Item) {
    setEditing(item);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  if (showOnboarding) {
    return <Onboarding onDone={() => setShowOnboarding(false)} />;
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
                onUseOne={useOne}
                onEdit={openEdit}
                onAdd={openAdd}
              />
            }
          />
          <Route path="/streak" element={<Streak />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings items={items} onClearAll={clearAll} />} />
          <Route path="/premium" element={<Premium />} />
        </Routes>
      </main>
      <BottomNav onAddClick={openAdd} />
      <ItemModal
        open={modalOpen}
        onClose={closeModal}
        onAdd={add}
        onUpdate={update}
        editingItem={editing}
      />
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
