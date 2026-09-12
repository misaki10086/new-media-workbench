import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AccountsPage } from './pages/AccountsPage';
import { ContentEditorPage } from './pages/ContentEditorPage';
import { ContentsPage } from './pages/ContentsPage';
import { StatsPage } from './pages/StatsPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/contents" replace />} />
        <Route path="contents" element={<ContentsPage />} />
        <Route path="contents/new" element={<ContentEditorPage />} />
        <Route path="contents/:id/edit" element={<ContentEditorPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="stats" element={<StatsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/contents" replace />} />
    </Routes>
  );
}
