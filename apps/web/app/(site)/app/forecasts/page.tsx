import { permanentRedirect } from "next/navigation";

export default function ForecastsPage() {
  permanentRedirect("/app/research?market=crypto#forecasts");
}
