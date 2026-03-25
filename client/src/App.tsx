import { RouterProvider } from 'react-router-dom';
import { ToastTopLayerHost } from './components/common/ToastTopLayerHost';
import { AuthInit } from './components/auth/AuthInit';
import { router } from './router';

function App() {
  return (
    <>
      <AuthInit>
        <RouterProvider router={router} />
      </AuthInit>
      <ToastTopLayerHost />
    </>
  );
}

export default App;
