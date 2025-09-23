import React from 'react';
import Layout from './Layout';
import Introduction from './pages/introduction';
import WalletManage from './pages/WalletManager';
import TaskManage from './pages/taskManage';
import DefaultTask from './pages/defaultTask';
import ChromeManager from './pages/ChromeManager';

import { createHashRouter } from 'react-router-dom'; // 导入 createHashRouter

const router = createHashRouter([ // 使用 createHashRouter 替代 createBrowserRouter
  {path:"/", element:<Layout Child={Introduction}/>},
  {path:'/chromeManager', element:<Layout Child={ChromeManager} />},
  {path:"/walletManage", element:<Layout Child={WalletManage} />},
  {path:"/taskManage", element:<Layout Child={TaskManage} />},
  {path:"/defaultTask", element:<Layout Child={DefaultTask} />},
]);

export default router;
