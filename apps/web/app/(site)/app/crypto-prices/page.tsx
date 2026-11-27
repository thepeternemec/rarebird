import { permanentRedirect } from "next/navigation";

export default function CryptoPricesPage() {
  permanentRedirect("/app/research?market=crypto#prices");
}
