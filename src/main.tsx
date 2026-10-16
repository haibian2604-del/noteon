import ReactDOM from "react-dom/client";
import App from "./App";

// 不用 StrictMode：开发模式下 effect 双调用会让 Milkdown 编辑器反复重建
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
