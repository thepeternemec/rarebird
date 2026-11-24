import { permanentRedirect } from "next/navigation";

export default function CryptoPage() {
  permanentRedirect("/app?market=crypto");
}
