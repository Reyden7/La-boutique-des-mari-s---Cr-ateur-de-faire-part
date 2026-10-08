import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";

export function AuthCard({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <main className="auth-page"><section className="auth-card">
    <div className="auth-brand"><div className="brand-mark">B</div><div><strong>Le Bureau des Mariés</strong><span>Studio</span></div></div>
    <div className="auth-icon"><LockKeyhole size={22}/></div>
    <p className="eyebrow">Votre espace personnel</p><h1>{title}</h1><p className="auth-intro">{intro}</p>
    {children}
  </section></main>;
}
