import { permanentRedirect } from "next/navigation";

export default function CryptoPricesPage() {
  permanentRedirect("/app?market=crypto#prices");
}
