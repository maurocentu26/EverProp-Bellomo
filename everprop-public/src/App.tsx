import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";

// 1. Importa tus páginas (créalas como componentes simples por ahora)
const Dashboard = () => <h1 className="text-2xl font-bold">Dashboard de EverProp</h1>;
const Properties = () => <h1 className="text-2xl font-bold">Gestión de Propiedades</h1>;
const Leads = () => <h1 className="text-2xl font-bold">Pipeline de Leads</h1>;

const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />, 
    children: [
      {
        index: true, 
        element: <Dashboard />,
      },
      {
        path: "properties",
        element: <Properties />,
      },
      {
        path: "leads",
        element: <Leads />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />, 
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;