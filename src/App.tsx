import { BrowserRouter, Route, Routes } from "react-router-dom";
import { EditorPage } from "./pages/EditorPage";
import { HomePage } from "./pages/HomePage";
import { PublicInvitePage } from "./pages/PublicInvitePage";

export default function App() {
  return <BrowserRouter><Routes><Route path="/" element={<HomePage />} /><Route path="/studio/:projectId" element={<EditorPage />} /><Route path="/i/:publicId" element={<PublicInvitePage />} /><Route path="*" element={<HomePage />} /></Routes></BrowserRouter>;
}
