import { Route, Switch } from "wouter";
import { Toaster } from "sonner";
import CanvasPage from "./pages/CanvasPage";
import PreviewPage from "./pages/PreviewPage";
import IOSPreviewPage from "./pages/IOSPreviewPage";

function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Nunito', sans-serif", color: "#111" }}>
      <p>Not found — <a href="/">back to the canvas</a></p>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Toaster position="bottom-right" />
      <Switch>
        <Route path={"/"} component={CanvasPage} />
        <Route path={"/preview/:surfaceId"} component={PreviewPage} />
        <Route path={"/ios/:surfaceId"} component={IOSPreviewPage} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}
