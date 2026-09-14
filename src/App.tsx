import { BrowserRouter, Route, Routes } from "react-router-dom";
import { EditorPage } from "./pages/EditorPage";
import { HomePage } from "./pages/HomePage";
import { PublicInvitePage } from "./pages/PublicInvitePage";
import { PaymentCancelPage } from "./pages/PaymentCancelPage";
import { PaymentSuccessPage } from "./pages/PaymentSuccessPage";

export default function App() {
  return <BrowserRouter><Routes><Route path="/" element={<HomePage />} /><Route path="/studio/:projectId" element={<EditorPage />} /><Route path="/i/:publicId" element={<PublicInvitePage />} /><Route path="/payment/success" element={<PaymentSuccessPage />} /><Route path="/payment/cancel" element={<PaymentCancelPage />} /><Route path="*" element={<HomePage />} /></Routes></BrowserRouter>;
}
