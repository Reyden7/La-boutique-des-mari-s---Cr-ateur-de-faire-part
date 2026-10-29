import { useEffect, type ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useDiscoverySession } from "../discovery/discoverySession";
import { useRecipientLists } from "./recipientStore";

/** Clear personal memory on account/draft changes, never browser-persist this store. */
export function RecipientSessionBoundary({children}:{children:ReactNode}) {
  const {user}=useAuth();const draftId=useDiscoverySession(state=>state.draftId);
  useEffect(()=>{
    useRecipientLists.setState(state=>({open:false,lists:Object.fromEntries(Object.entries(state.lists).filter(([key])=>key.startsWith(`${user?.id}:`)||(draftId&&key===`guest:${draftId}`)))}));
  },[user?.id,draftId]);
  return children;
}
