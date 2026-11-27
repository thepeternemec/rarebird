import { permanentRedirect } from "next/navigation";

export default function CryptoPage() {
  permanentRedirect("/app/research?market=crypto");
}
