import { createContext } from "react";
import type { RecipientInvitation } from "../../services/recipientRepository";
export const RecipientInvitationContext = createContext<RecipientInvitation | null>(null);
