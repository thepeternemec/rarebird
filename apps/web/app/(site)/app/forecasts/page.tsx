import { permanentRedirect } from "next/navigation";

export default function ForecastsPage() {
  permanentRedirect("/app?market=crypto#forecasts");
}
