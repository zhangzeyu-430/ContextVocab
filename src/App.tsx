import { Navigate, Route, Routes } from "react-router-dom";
import { DevDebugPanel } from "@/components/DevDebugPanel";
import { HomePage } from "@/pages/HomePage";
import { ReadingPage } from "@/pages/ReadingPage";
import { ReviewPage } from "@/pages/ReviewPage";
import { WordbookPage } from "@/pages/WordbookPage";

function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/reading/:id" element={<ReadingPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/wordbook" element={<WordbookPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {import.meta.env.DEV ? <DevDebugPanel /> : null}
    </div>
  );
}

export default App;
