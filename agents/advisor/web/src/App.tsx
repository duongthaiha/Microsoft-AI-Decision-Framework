import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { AdminPage } from './pages/AdminPage';
import { ConversationPage } from './pages/ConversationPage';
import { IntakePage } from './pages/IntakePage';
import { RecommendationPage } from './pages/RecommendationPage';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<IntakePage />} />
          <Route path="/session/:sessionId" element={<ConversationPage />} />
          <Route path="/session/:sessionId/recommendation" element={<RecommendationPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
