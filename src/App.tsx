import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
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
import { TutorialProvider } from "./features/tutorial/TutorialProvider";

const protectedPage = (page: ReactNode) => <ProtectedRoute>{page}</ProtectedRoute>;

const router = createBrowserRouter([{ element: <AuthProvider><TutorialProvider><RecoveryRouteGuard><Outlet /></RecoveryRouteGuard></TutorialProvider></AuthProvider>, children: [
  { path: "/", element: <HomePage /> },
  { path: "/auth", element: <AuthPage /> },
  { path: "/login", element: <AuthPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/studio/discovery", element: <EditorPage discovery /> },
  { path: "/studio/:projectId", element: protectedPage(<EditorPage />) },
  { path: "/studio/:projectId/rsvp/responses", element: protectedPage(<RsvpResponsesPage />) },
  { path: "/admin/templates", element: protectedPage(<AdminTemplatesPage />) },
  { path: "/admin/assets", element: protectedPage(<AdminAssetsPage />) },
  { path: "/admin/promo-codes", element: protectedPage(<AdminPromoCodesPage />) },
  { path: "/custom-invitation", element: protectedPage(<CustomInvitationRequestPage />) },
  { path: "/payment/success", element: protectedPage(<PaymentSuccessPage />) },
  { path: "/payment/cancel", element: protectedPage(<PaymentCancelPage />) },
  { path: "/i/:publicId", element: <PublicInvitePage /> },
  { path: "*", element: <Navigate to="/" replace /> },
] }]);
export default function App() { return <RouterProvider router={router} />; }
