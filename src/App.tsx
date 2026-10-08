import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { RecoveryRouteGuard } from "./components/auth/RecoveryRouteGuard";
import { AuthProvider } from "./contexts/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { EditorPage } from "./pages/EditorPage";
import { HomePage } from "./pages/HomePage";
import { PaymentCancelPage } from "./pages/PaymentCancelPage";
import { PaymentSuccessPage } from "./pages/PaymentSuccessPage";
import { PublicInvitePage } from "./pages/PublicInvitePage";
import { CustomInvitationRequestPage } from "./pages/CustomInvitationRequestPage";
import { RsvpResponsesPage } from "./pages/RsvpResponsesPage";
import { AdminTemplatesPage } from "./pages/AdminTemplatesPage";
import { AdminAssetsPage } from "./pages/AdminAssetsPage";
import { AdminPromoCodesPage } from "./pages/AdminPromoCodesPage";

const protectedPage = (page: ReactNode) => <ProtectedRoute>{page}</ProtectedRoute>;

export default function App() {
  return <BrowserRouter><AuthProvider><RecoveryRouteGuard><Routes><Route path="/auth" element={<AuthPage />} /><Route path="/login" element={<AuthPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="/" element={protectedPage(<HomePage />)} /><Route path="/studio/:projectId" element={protectedPage(<EditorPage />)} /><Route path="/studio/:projectId/rsvp/responses" element={protectedPage(<RsvpResponsesPage />)} /><Route path="/admin/templates" element={protectedPage(<AdminTemplatesPage />)} /><Route path="/admin/assets" element={protectedPage(<AdminAssetsPage />)} /><Route path="/admin/promo-codes" element={protectedPage(<AdminPromoCodesPage />)} /><Route path="/custom-invitation" element={protectedPage(<CustomInvitationRequestPage />)} /><Route path="/payment/success" element={protectedPage(<PaymentSuccessPage />)} /><Route path="/payment/cancel" element={protectedPage(<PaymentCancelPage />)} /><Route path="/i/:publicId" element={<PublicInvitePage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></RecoveryRouteGuard></AuthProvider></BrowserRouter>;
}
