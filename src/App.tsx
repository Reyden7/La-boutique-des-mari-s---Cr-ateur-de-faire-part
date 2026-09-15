import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { EditorPage } from "./pages/EditorPage";
import { HomePage } from "./pages/HomePage";
import { PaymentCancelPage } from "./pages/PaymentCancelPage";
import { PaymentSuccessPage } from "./pages/PaymentSuccessPage";
import { PublicInvitePage } from "./pages/PublicInvitePage";

const protectedPage = (page: ReactNode) => <ProtectedRoute>{page}</ProtectedRoute>;

export default function App() {
  return <BrowserRouter><AuthProvider><Routes><Route path="/auth" element={<AuthPage />} /><Route path="/" element={protectedPage(<HomePage />)} /><Route path="/studio/:projectId" element={protectedPage(<EditorPage />)} /><Route path="/payment/success" element={protectedPage(<PaymentSuccessPage />)} /><Route path="/payment/cancel" element={protectedPage(<PaymentCancelPage />)} /><Route path="/i/:publicId" element={<PublicInvitePage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthProvider></BrowserRouter>;
}
