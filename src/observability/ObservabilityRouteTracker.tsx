import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { setObservabilityRoute } from "./Observability";

export default function ObservabilityRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    setObservabilityRoute(location.pathname);
  }, [location.pathname]);

  return null;
}
