import { create } from "zustand";
import type { InvitationRecipient } from "./recipientData";

/** Personal data is memory-only. It never enters project_data, Undo, templates or localStorage. */
export const useRecipientLists = create<{ lists: Record<string, { revision: number; recipients: InvitationRecipient[] }>; open: boolean }>(() => ({ lists: {}, open: false }));
export const setRecipientList = (key: string, value: { revision: number; recipients: InvitationRecipient[] }) => useRecipientLists.setState(state => ({ lists: { ...state.lists, [key]: value } }));
export const openRecipientList = () => useRecipientLists.setState({ open: true });
