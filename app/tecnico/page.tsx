import { requireChatGPTUser, chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { TechnicianPortal } from "./technician-portal";
import "./technician-portal.css";

export default async function TechnicianPage(){const user=await requireChatGPTUser("/tecnico");return <TechnicianPortal userName={user.fullName??user.email} signOut={chatGPTSignOutPath("/tecnico")}/>}
