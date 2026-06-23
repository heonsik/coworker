import { createHashRouter, Navigate } from 'react-router';
import { App } from './App';
import { HomePage } from './pages/Home';
import ExecutionPage from './pages/Execution';
import EmailPage from './pages/Email';
import { RouteErrorFallback } from './components/ui/RouteErrorFallback';

export const router = createHashRouter([
  {
    path: '/',
    Component: App,
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, Component: HomePage, errorElement: <RouteErrorFallback /> },
      { path: 'execution/:id', Component: ExecutionPage, errorElement: <RouteErrorFallback /> },
      { path: 'email', Component: EmailPage, errorElement: <RouteErrorFallback /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
