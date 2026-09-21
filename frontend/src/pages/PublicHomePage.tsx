import { LinkButton } from "../components/ui/LinkButton";
import { PageShell } from "../components/ui/PageShell";
import { LOGIN_PATH } from "../utils/routing";
import { useDocumentTitle } from "../utils/useDocumentTitle";

export function PublicHomePage() {
  useDocumentTitle("Podsumuj artykuł");

  return (
    <PageShell className="gap-6">
      <h1 className="hero-title text-balance">Podsumuj dowolny artykuł</h1>
      <LinkButton href={LOGIN_PATH} className="justify-self-start">
        Zaloguj
      </LinkButton>
    </PageShell>
  );
}
