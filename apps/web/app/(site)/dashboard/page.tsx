import { permanentRedirect } from "next/navigation";

export default function NewsMapPage() {
  permanentRedirect("/app#news");
}
