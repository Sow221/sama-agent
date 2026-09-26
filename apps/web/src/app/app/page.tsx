/** `/app` → `/app/home` (l'accueil est la destination principale connectée). */
import { redirect } from "next/navigation";

export default function AppIndexPage() {
  redirect("/app/home");
}