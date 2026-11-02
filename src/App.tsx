import type { ReactNode } from "react";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { RecoveryRouteGuard } from "./components/auth/RecoveryRouteGuard";
import { AuthProvider,useAuth } from "./contexts/AuthContext";
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
import { RecipientSessionBoundary } from "./features/recipients/RecipientSessionBoundary";
import {RouteSeo} from './features/seo/RouteSeo';
import {NotFoundPage} from './pages/NotFoundPage';

const protectedPage = (page: ReactNode) => <ProtectedRoute>{page}</ProtectedRoute>;
function AppSeo(){const {user}=useAuth();return <RouteSeo privateHome={Boolean(user)}/>;}

const router = createBrowserRouter([{ element: <AuthProvider><AppSeo/><TutorialProvider><RecoveryRouteGuard><RecipientSessionBoundary><Outlet /></RecipientSessionBoundary></RecoveryRouteGuard></TutorialProvider></AuthProvider>, children: [
  { path: "/", element: <HomePage /> },
  { path: "/auth", element: <AuthPage /> },
  { path: "/login", element: <AuthPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/studio/discovery", element: <EditorPage discovery /> },
  { path: "/studio/:projectId", element: protectedPage(<EditorPage />) },
  { path: "/studio/:projectId/rsvp/responses", element: protectedPage(<RsvpResponsesPage />) },
  { path: "/dashboard/responses", element: protectedPage(<RsvpResponsesPage />) },
  { path: "/admin/templates", element: protectedPage(<AdminTemplatesPage />) },
  { path: "/admin/assets", element: protectedPage(<AdminAssetsPage />) },
  { path: "/admin/promo-codes", element: protectedPage(<AdminPromoCodesPage />) },
  { path: "/custom-invitation", element: protectedPage(<CustomInvitationRequestPage />) },
  { path: "/payment/success", element: protectedPage(<PaymentSuccessPage />) },
  { path: "/payment/cancel", element: protectedPage(<PaymentCancelPage />) },
  { path: "/i/:publicId", element: <PublicInvitePage /> },
  { path: "/i/:publicId/:recipientToken", element: <PublicInvitePage /> },
  { path: "*", element: <NotFoundPage /> },
] }]);
export default function App() { return <RouterProvider router={router} />; }
