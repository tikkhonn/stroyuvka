import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { AppRouter } from "./app/AppRouter";
import { reactRouterFutureFlags } from "./lib/routerFuture";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={reactRouterFutureFlags}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
